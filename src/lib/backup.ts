import path from 'path'
import fs from 'fs'
import os from 'os'
import JSZip from 'jszip'
import { prisma } from '@/lib/prisma'

// 备份保留份数（自动备份滚动保留）
const KEEP = 14

// 从 DATABASE_URL 推导出 SQLite 文件的绝对路径
function resolveDbPath(): string {
  const url = process.env.DATABASE_URL || ''
  let p = url.startsWith('file:') ? url.slice(5) : url
  p = p.split('?')[0]
  if (!path.isAbsolute(p)) p = path.resolve(process.cwd(), p)
  return p
}

export function getDbPath(): string {
  return resolveDbPath()
}

export function getBackupsDir(): string {
  const dir = path.join(path.dirname(resolveDbPath()), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`
}

// 只允许我们自己生成的文件名，防止路径穿越
function safeName(fileName: string): boolean {
  return /^[A-Za-z0-9._-]+\.db$/.test(fileName)
}

export function backupFilePath(fileName: string): string | null {
  if (!safeName(fileName)) return null
  const fp = path.join(getBackupsDir(), fileName)
  return fs.existsSync(fp) ? fp : null
}

export function isSqliteFile(fp: string): boolean {
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

// 用 VACUUM INTO 生成一致性快照（与日志/WAL 模式无关，始终完整）
export async function createBackup(prefix = 'cert-system'): Promise<{ fileName: string; filePath: string; size: number }> {
  const dir = getBackupsDir()
  const fileName = `${prefix}-${stamp()}.db`
  const filePath = path.join(dir, fileName)
  const escaped = filePath.replace(/\\/g, '/').replace(/'/g, "''")
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`)
  const size = fs.statSync(filePath).size
  return { fileName, filePath, size }
}

export function listBackups(): { fileName: string; size: number; time: number }[] {
  const dir = getBackupsDir()
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const st = fs.statSync(path.join(dir, f))
      return { fileName: f, size: st.size, time: st.mtimeMs }
    })
    .sort((a, b) => b.time - a.time)
}

export function pruneBackups(keep = KEEP): void {
  // 只清理自动备份，保留手动/恢复前的安全备份(pre-restore-*)
  const auto = listBackups().filter(b => b.fileName.startsWith('cert-system-'))
  for (const b of auto.slice(keep)) {
    try {
      fs.unlinkSync(path.join(getBackupsDir(), b.fileName))
    } catch {
      /* ignore */
    }
  }
}

// 暂存一次恢复：写标记文件，由 Electron 主进程在下次启动时落地
export function stageRestore(fileName: string): { ok: boolean; error?: string } {
  const fp = backupFilePath(fileName)
  if (!fp) return { ok: false, error: '备份文件不存在' }
  if (!isSqliteFile(fp)) return { ok: false, error: '该文件不是有效的数据库' }
  const marker = path.join(path.dirname(resolveDbPath()), 'pending-restore.json')
  fs.writeFileSync(marker, JSON.stringify({ source: fp, requestedAt: Date.now() }))
  return { ok: true }
}

// ===== 完整备份（含磁盘附件）=====

function attachmentsDir(): string {
  return path.join(path.dirname(getDbPath()), 'attachments')
}

// 生成一个完整导出 zip（数据库一致性快照 + 全部附件文件）到临时目录，调用方负责清理 tmpDir
export async function createFullExport(): Promise<{ filePath: string; fileName: string; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-export-'))
  const dbSnap = path.join(tmpDir, 'cert-system.db')
  const escaped = dbSnap.replace(/\\/g, '/').replace(/'/g, "''")
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`)

  const zip = new JSZip()
  zip.file('cert-system.db', fs.readFileSync(dbSnap))
  const attDir = attachmentsDir()
  if (fs.existsSync(attDir)) {
    for (const f of fs.readdirSync(attDir)) {
      const fp = path.join(attDir, f)
      if (fs.statSync(fp).isFile()) zip.file(`attachments/${f}`, fs.readFileSync(fp))
    }
  }

  const fileName = `cert-system-full-${stamp()}.zip`
  const zipPath = path.join(tmpDir, fileName)
  await new Promise<void>((resolve, reject) => {
    zip
      .generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 1 } })
      .pipe(fs.createWriteStream(zipPath))
      .on('finish', () => resolve())
      .on('error', reject)
  })
  fs.rmSync(dbSnap, { force: true })
  return { filePath: zipPath, fileName, tmpDir }
}

// 从外部路径暂存恢复：.zip 走完整恢复，.db 走仅数据库恢复
export async function stageRestoreFromPath(absPath: string): Promise<{ ok: boolean; error?: string }> {
  if (!absPath || !fs.existsSync(absPath)) return { ok: false, error: '文件不存在' }
  if (absPath.toLowerCase().endsWith('.zip')) return stageFullRestore(absPath)
  if (!isSqliteFile(absPath)) return { ok: false, error: '该文件不是有效的数据库或备份' }
  const marker = path.join(path.dirname(getDbPath()), 'pending-restore.json')
  fs.writeFileSync(marker, JSON.stringify({ source: absPath, requestedAt: Date.now() }))
  return { ok: true }
}

// 完整恢复：解压 db 到 pending-restore.db，附件到 pending-attachments，写标记由主进程重启时落地
async function stageFullRestore(zipPath: string): Promise<{ ok: boolean; error?: string }> {
  const dbDir = path.dirname(getDbPath())
  let zip
  try {
    zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
  } catch {
    return { ok: false, error: '无法读取该 zip 备份' }
  }
  const dbEntry = zip.file('cert-system.db')
  if (!dbEntry) return { ok: false, error: '备份内缺少数据库文件' }

  const pendingDb = path.join(dbDir, 'pending-restore.db')
  fs.writeFileSync(pendingDb, await dbEntry.async('nodebuffer'))
  if (!isSqliteFile(pendingDb)) {
    fs.rmSync(pendingDb, { force: true })
    return { ok: false, error: '备份内数据库无效' }
  }

  const staging = path.join(dbDir, 'pending-attachments')
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir || !name.startsWith('attachments/')) continue
    const base = path.basename(name)
    if (!base) continue
    fs.writeFileSync(path.join(staging, base), await file.async('nodebuffer'))
  }

  const marker = path.join(dbDir, 'pending-restore.json')
  fs.writeFileSync(marker, JSON.stringify({ source: pendingDb, attachmentsStaging: staging, requestedAt: Date.now() }))
  return { ok: true }
}

let started = false
// 自动备份调度：启动后 8s 一次，之后每 24h 一次
export function startBackupScheduler(): void {
  if (started) return
  started = true
  const run = async () => {
    try {
      await createBackup()
      pruneBackups()
    } catch (e) {
      console.error('[backup] 自动备份失败:', e)
    }
  }
  setTimeout(run, 8000)
  setInterval(run, 24 * 60 * 60 * 1000)
}
