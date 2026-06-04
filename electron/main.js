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
          setTimeout(ping, 300)
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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    show: false,
    backgroundColor: '#ffffff',
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
      startServer(paths)
      mlog('startServer 调用完成，等待服务就绪…')
      await waitForServer(APP_URL)
      mlog('服务已就绪，创建窗口')
      await createWindow()
      mlog('窗口已创建')
    } catch (err) {
      mlog('启动失败: ' + String((err && err.stack) || err))
      dialog.showErrorBox('启动失败', String((err && err.stack) || err))
      app.quit()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
