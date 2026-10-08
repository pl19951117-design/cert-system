const { app, BrowserWindow, shell, dialog, Menu, session, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')
const { fork, spawn } = require('child_process')

const PORT = 34117
const HOST = '127.0.0.1'
// Electron 窗口与健康检查始终走回环地址；对外监听与否由「局域网共享」开关决定
const APP_URL = `http://${HOST}:${PORT}`
const FIREWALL_RULE = 'CertSystem-LAN'

let serverProcess = null
let mainWindow = null
let LOG_PATH = null
// 当前服务进程实际是否在对外监听（用于判断改了开关后是否需要重启生效）
let currentBindIsLan = false

function mlog(s) {
  try { if (LOG_PATH) fs.appendFileSync(LOG_PATH, `[main ${new Date().toISOString()}] ${s}\n`) } catch { /* ignore */ }
}

function resolvePaths() {
  const userData = app.getPath('userData')
  const dbPath = path.join(userData, 'cert-system.db')

  let standaloneDir
  let templateDbPath
  if (app.isPackaged) {
    standaloneDir = path.join(process.resourcesPath, 'standalone')
    templateDbPath = path.join(process.resourcesPath, 'template.db')
  } else {
    standaloneDir = path.join(__dirname, '..', '.next', 'standalone')
    templateDbPath = path.join(__dirname, '..', 'prisma', 'template.db')
  }

  return {
    userData,
    dbPath,
    standaloneDir,
    templateDbPath,
    serverJs: path.join(standaloneDir, 'server.js'),
    logPath: path.join(userData, 'server.log'),
  }
}

function ensureDatabase(dbPath, templateDbPath) {
  if (fs.existsSync(dbPath)) return
  if (!fs.existsSync(templateDbPath)) {
    throw new Error(`找不到数据库模板：${templateDbPath}`)
  }
  fs.copyFileSync(templateDbPath, dbPath)
}

// 每台机器一份独立的 JWT 签名密钥：首启随机生成并持久化到用户数据目录，
// 之后每次读取同一份。避免所有安装共用写死的密钥导致会话可被伪造。
function ensureJwtSecret(userData) {
  const crypto = require('crypto')
  const p = path.join(userData, 'jwt-secret')
  try {
    if (fs.existsSync(p)) {
      const s = fs.readFileSync(p, 'utf8').trim()
      if (s.length >= 32) return s
    }
  } catch { /* 读失败则重新生成 */ }
  const s = crypto.randomBytes(48).toString('base64url')
  try { fs.writeFileSync(p, s, { mode: 0o600 }) } catch (e) { mlog('写入 jwt-secret 失败: ' + String(e)) }
  return s
}

// ===== 本机设置（settings.json） =====
// 目前只存「局域网共享」开关。默认关闭 —— 安全默认：不主动对外开放。
function settingsPath(userData) {
  return path.join(userData, 'settings.json')
}
function readSettings(userData) {
  try {
    const s = JSON.parse(fs.readFileSync(settingsPath(userData), 'utf8'))
    return (s && typeof s === 'object') ? s : {}
  } catch {
    return {}
  }
}
function writeSettings(userData, patch) {
  const next = { ...readSettings(userData), ...patch }
  try {
    fs.writeFileSync(settingsPath(userData), JSON.stringify(next, null, 2), 'utf8')
  } catch (e) {
    mlog('写入 settings.json 失败: ' + String(e))
  }
  return next
}

/** 本机的局域网 IPv4 地址（排除回环与虚拟回环），供分享给同事 */
function getLanAddresses() {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const a of ifaces[name] || []) {
      // Node 18+ family 可能是 'IPv4' 或 4
      const isV4 = a.family === 'IPv4' || a.family === 4
      if (isV4 && !a.internal) out.push({ name, address: a.address })
    }
  }
  return out
}

/**
 * 放行 Windows 防火墙入站端口。需要管理员权限 —— 通过 Start-Process -Verb RunAs
 * 触发 UAC 由用户确认。规则名用纯 ASCII，避免 .bat 的中文编码问题。
 */
function addFirewallRule() {
  const bat = path.join(app.getPath('temp'), 'cert-system-firewall.bat')
  const content = [
    '@echo off',
    `netsh advfirewall firewall delete rule name="${FIREWALL_RULE}" >nul 2>&1`,
    `netsh advfirewall firewall add rule name="${FIREWALL_RULE}" dir=in action=allow protocol=TCP localport=${PORT}`,
  ].join('\r\n') + '\r\n'
  try {
    fs.writeFileSync(bat, content, 'ascii')
  } catch (e) {
    return Promise.resolve({ ok: false, error: '无法写入临时脚本：' + String(e) })
  }
  return new Promise((resolve) => {
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Start-Process -FilePath "${bat}" -Verb RunAs -WindowStyle Hidden -Wait`,
    ], { windowsHide: true })
    ps.on('exit', (code) => {
      mlog('firewall rule exit=' + code)
      resolve(code === 0
        ? { ok: true }
        : { ok: false, error: '已取消或未获得管理员授权' })
    })
    ps.on('error', (e) => resolve({ ok: false, error: String(e) }))
  })
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function isSqlite(fp) {
  try {
    const fd = fs.openSync(fp, 'r')
    const buf = Buffer.alloc(16)
    fs.readSync(fd, buf, 0, 16, 0)
    fs.closeSync(fd)
    return buf.toString('utf8', 0, 15) === 'SQLite format 3'
  } catch {
    return false
  }
}

// 启动时落地一次待恢复：先把当前库安全备份，再用所选备份覆盖；
// 若是完整备份(zip)，还会同时落地附件目录。
function applyPendingRestore(userData, dbPath) {
  const marker = path.join(userData, 'pending-restore.json')
  if (!fs.existsSync(marker)) return
  try {
    const { source, attachmentsStaging } = JSON.parse(fs.readFileSync(marker, 'utf8'))
    if (source && fs.existsSync(source) && isSqlite(source)) {
      if (fs.existsSync(dbPath)) {
        const backupsDir = path.join(userData, 'backups')
        fs.mkdirSync(backupsDir, { recursive: true })
        fs.copyFileSync(dbPath, path.join(backupsDir, `pre-restore-${stamp()}.db`))
      }
      fs.copyFileSync(source, dbPath)
      // 清掉旧的 WAL/SHM，避免与新库混用导致损坏
      for (const ext of ['-wal', '-shm']) {
        try { fs.rmSync(dbPath + ext, { force: true }) } catch { /* ignore */ }
      }

      // 完整恢复：用暂存的附件目录替换现有附件（旧附件改名保留一份）
      if (attachmentsStaging && fs.existsSync(attachmentsStaging)) {
        const attDir = path.join(userData, 'attachments')
        const bak = path.join(userData, 'attachments-prerestore')
        try { fs.rmSync(bak, { recursive: true, force: true }) } catch { /* ignore */ }
        if (fs.existsSync(attDir)) {
          try { fs.renameSync(attDir, bak) } catch { /* ignore */ }
        }
        fs.renameSync(attachmentsStaging, attDir)
      }
    }
  } catch (e) {
    dialog.showErrorBox('恢复失败', String((e && e.stack) || e))
  } finally {
    try { fs.rmSync(marker, { force: true }) } catch { /* ignore */ }
    // 清理可能残留的暂存
    try { fs.rmSync(path.join(userData, 'pending-restore.db'), { force: true }) } catch { /* ignore */ }
  }
}

function startServer({ serverJs, standaloneDir, dbPath, logPath, userData }) {
  if (!fs.existsSync(serverJs)) {
    throw new Error(`找不到应用服务文件：${serverJs}\n请先运行 npm run build。`)
  }
  // connection_limit=1 让所有数据库访问走单连接、串行化，避免后台维护(VACUUM/迁移/备份)
  // 与登录等请求并发时触发 SQLite 的 SQLITE_BUSY 导致 500。
  const dbUrl = 'file:' + dbPath.replace(/\\/g, '/') + '?connection_limit=1'
  const jwtSecret = ensureJwtSecret(userData)
  // 局域网共享：开启则监听 0.0.0.0（同事可访问），否则只监听回环（仅本机）
  const lanSharing = readSettings(userData).lanSharing === true
  const bindHost = lanSharing ? '0.0.0.0' : HOST
  currentBindIsLan = lanSharing
  mlog(`startServer dbUrl=${dbUrl} bind=${bindHost} lanSharing=${lanSharing}`)

  // 服务进程的 stdout/stderr 直接写入日志文件：① 打包后的 GUI 进程没有控制台，
  // 旧版把子进程输出 pipe 到 process.stdout 可能导致阻塞/异常；② 同时留下排障日志。
  let out = 'ignore'
  try { out = fs.openSync(logPath, 'a') } catch { out = 'ignore' }

  serverProcess = fork(serverJs, [], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      ELECTRON: '1',
      PORT: String(PORT),
      HOSTNAME: bindHost,
      DATABASE_URL: dbUrl,
      JWT_SECRET: jwtSecret,
    },
    stdio: ['ignore', out, out, 'ipc'],
  })

  serverProcess.on('exit', (code, signal) => {
    mlog(`server exit code=${code} signal=${signal}`)
    if (code && code !== 0 && !app.isQuitting) {
      dialog.showErrorBox('服务异常退出', `Next.js 服务退出，代码 ${code}\n日志：${logPath}`)
    }
  })
  serverProcess.on('error', (e) => mlog('server error ' + String(e)))
}

function waitForServer(url, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const ping = () => {
      const req = http.get(url, (res) => {
        res.destroy()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('等待应用服务启动超时'))
        } else {
          // 轮询更密一些，服务一就绪就立刻进入应用（原 300ms 平均要多等 ~150ms）
          setTimeout(ping, 60)
        }
      })
    }
    ping()
  })
}

// 每次启动都要求重新登录：清除上次残留的会话 cookie
async function clearSession() {
  try {
    const cookies = await session.defaultSession.cookies.get({ name: 'cert-session' })
    for (const c of cookies) {
      const host = c.domain ? c.domain.replace(/^\./, '') : HOST
      const url = `http://${host}${c.path || '/'}`
      await session.defaultSession.cookies.remove(url, c.name)
    }
    await session.defaultSession.cookies.flushStore()
  } catch (err) {
    console.error('清除会话 cookie 失败：', err)
  }
}

// 启动画面：纯内联 HTML（data URL，瞬时加载）。单位 logo 从 electron/brand-logo.png 读成 base64 内嵌，
// 不依赖尚未启动的 Next 服务。与登录页同色系（海军蓝 + 金），让冷启动期间就有品牌画面，而不是空白。
function splashLogoDataUri() {
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'brand-logo.png'))
    return 'data:image/png;base64,' + buf.toString('base64')
  } catch {
    return ''   // 读不到 logo 时只显示文字，不影响启动
  }
}

function splashDataUrl() {
  const logo = splashLogoDataUri()
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%}
body{display:flex;align-items:center;justify-content:center;overflow:hidden;
 font-family:-apple-system,"Segoe UI Variable","Segoe UI","Microsoft YaHei",sans-serif;
 background:radial-gradient(90% 60% at 50% 0%,rgba(201,162,39,.10),transparent 60%),
  linear-gradient(160deg,#13335a 0%,#0f2a4a 45%,#0a1d34 100%);
 color:#eef3fa;-webkit-user-select:none;user-select:none}
.wrap{display:flex;flex-direction:column;align-items:center;gap:16px;animation:fade .5s ease both}
.logo{width:96px;height:96px;border-radius:24px;display:flex;align-items:center;justify-content:center;
 background:#fff;box-shadow:0 18px 40px -10px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.25)}
.logo img{width:78px;height:78px;object-fit:contain}
.title{font-size:19px;font-weight:700;letter-spacing:.5px;margin-top:6px}
.sub{font-size:11px;color:#d4b04c;letter-spacing:3px;margin-top:-6px;opacity:.85}
.row{display:flex;align-items:center;gap:9px;margin-top:10px;color:#9cb2cf;font-size:12px}
.spin{width:15px;height:15px;border:2px solid rgba(224,198,119,.25);border-top-color:#e0c677;border-radius:50%;animation:rot .7s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style></head><body><div class="wrap">
${logo ? `<div class="logo"><img src="${logo}" alt=""></div>` : ''}
<div class="title">证件管理系统</div><div class="sub">三类人员 · 证件台账</div>
<div class="row"><span class="spin"></span><span>正在启动…</span></div>
</div></body></html>`
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html)
}

// 立即创建窗口并显示启动画面（此时 Next 服务还在后台启动）
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    show: false,
    backgroundColor: '#0f2a4a',
    title: '证件管理系统',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  Menu.setApplicationMenu(null)

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  await mainWindow.loadURL(splashDataUrl())
}

// 服务就绪后，把窗口内容从启动画面切换到真正的应用
async function loadApp() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  await clearSession()
  await mainWindow.loadURL(APP_URL)
}

function registerIpc() {
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('backup:openFolder', () => {
    const dir = path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    shell.openPath(dir)
    return { ok: true }
  })

  // ===== 局域网共享 =====
  ipcMain.handle('lan:getStatus', () => {
    const userData = app.getPath('userData')
    const enabled = readSettings(userData).lanSharing === true
    return {
      enabled,
      port: PORT,
      addresses: getLanAddresses(),
      // 当前服务进程实际的监听状态（与设置不一致说明改了开关但还没重启）
      activeEnabled: currentBindIsLan,
    }
  })

  ipcMain.handle('lan:setEnabled', (_e, enabled) => {
    const userData = app.getPath('userData')
    writeSettings(userData, { lanSharing: !!enabled })
    mlog('lanSharing set to ' + !!enabled)
    // 监听地址在服务进程启动时确定，需重启应用生效
    return { ok: true, needsRestart: currentBindIsLan !== !!enabled }
  })

  ipcMain.handle('lan:addFirewallRule', () => addFirewallRule())

  // 选择外部备份文件：返回路径，由服务端 /api/restore 暂存（支持 .db 与 .zip 完整备份）
  ipcMain.handle('restore:pickFile', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择要恢复的备份文件',
      filters: [{ name: '备份文件', extensions: ['db', 'zip'] }],
      properties: ['openFile'],
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
    return { ok: true, path: res.filePaths[0], fileName: path.basename(res.filePaths[0]) }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  registerIpc()

  app.whenReady().then(async () => {
    const paths = resolvePaths()
    LOG_PATH = paths.logPath
    try { fs.writeFileSync(LOG_PATH, '') } catch { /* ignore */ }  // 每次启动清空日志
    mlog(`启动 v${app.getVersion?.() || ''} packaged=${app.isPackaged} userData=${paths.userData}`)
    try {
      ensureDatabase(paths.dbPath, paths.templateDbPath)
      mlog('ensureDatabase ok')
      applyPendingRestore(paths.userData, paths.dbPath)
      mlog('applyPendingRestore ok')
      // 先启动服务，使其冷启动与窗口/渲染进程初始化并行进行
      startServer(paths)
      mlog('startServer 调用完成')
      // 立即弹出启动画面（不等服务），用户 ~1s 内就能看到界面
      await createWindow()
      mlog('启动画面已显示，等待服务就绪…')
      await waitForServer(APP_URL)
      mlog('服务已就绪，加载应用')
      await loadApp()
      mlog('应用已加载')
    } catch (err) {
      mlog('启动失败: ' + String((err && err.stack) || err))
      dialog.showErrorBox('启动失败', String((err && err.stack) || err))
      app.quit()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().then(loadApp).catch((e) => mlog('activate 重建窗口失败: ' + String(e)))
    }
  })
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill()
    serverProcess = null
  }
}

app.on('before-quit', () => {
  app.isQuitting = true
  stopServer()
})

app.on('window-all-closed', () => {
  stopServer()
  app.quit()
})
