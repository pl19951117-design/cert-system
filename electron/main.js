const { app, BrowserWindow, shell, dialog, Menu, session, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { fork } = require('child_process')

const PORT = 34117
const HOST = '127.0.0.1'
const APP_URL = `http://${HOST}:${PORT}`

let serverProcess = null
let mainWindow = null
let LOG_PATH = null

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

function startServer({ serverJs, standaloneDir, dbPath, logPath }) {
  if (!fs.existsSync(serverJs)) {
    throw new Error(`找不到应用服务文件：${serverJs}\n请先运行 npm run build。`)
  }
  // connection_limit=1 让所有数据库访问走单连接、串行化，避免后台维护(VACUUM/迁移/备份)
  // 与登录等请求并发时触发 SQLite 的 SQLITE_BUSY 导致 500。
  const dbUrl = 'file:' + dbPath.replace(/\\/g, '/') + '?connection_limit=1'
  mlog('startServer dbUrl=' + dbUrl)

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
      HOSTNAME: HOST,
      DATABASE_URL: dbUrl,
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

// 启动画面：纯内联 HTML（data URL，瞬时加载，无需打包额外文件）。
// 与登录页同色系，让窗口在服务冷启动期间就有品牌画面，而不是空白。
function splashDataUrl() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%}
body{display:flex;align-items:center;justify-content:center;overflow:hidden;
 font-family:-apple-system,"Segoe UI Variable","Segoe UI","Microsoft YaHei",sans-serif;
 background:radial-gradient(120% 80% at 50% 0%,#11161f 0%,#0b0e14 60%,#080a0e 100%);
 color:#e8edf4;-webkit-user-select:none;user-select:none}
.wrap{display:flex;flex-direction:column;align-items:center;gap:16px;animation:fade .5s ease both}
.logo{width:62px;height:62px;border-radius:17px;display:flex;align-items:center;justify-content:center;
 background:linear-gradient(180deg,#f7ad27,#e08c0a);
 box-shadow:0 12px 32px -6px rgba(245,158,11,.5),inset 0 1px 0 rgba(255,255,255,.3)}
.logo svg{width:31px;height:31px}
.title{font-size:18px;font-weight:700;letter-spacing:.4px}
.sub{font-size:11px;color:#7a8699;letter-spacing:2px;margin-top:-6px}
.row{display:flex;align-items:center;gap:9px;margin-top:8px;color:#9aa6b6;font-size:12px}
.spin{width:15px;height:15px;border:2px solid rgba(245,158,11,.25);border-top-color:#f59e0b;border-radius:50%;animation:rot .7s linear infinite}
@keyframes rot{to{transform:rotate(360deg)}}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
</style></head><body><div class="wrap">
<div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.96 11.96 0 0 1 3.6 6 12 12 0 0 0 3 9.75c0 5.6 3.82 10.29 9 11.62 5.18-1.33 9-6.03 9-11.62 0-1.31-.21-2.57-.6-3.75h-.15c-3.2 0-6.1-1.25-8.25-3.29Z"/></svg></div>
<div class="title">证件管理系统</div><div class="sub">CERTIFICATE MANAGEMENT</div>
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
    backgroundColor: '#0b0e14',
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
