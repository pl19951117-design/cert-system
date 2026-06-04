import path from 'path'
import fs from 'fs'
import { prisma } from '@/lib/prisma'
import { getDbPath, createBackup } from '@/lib/backup'

export const ATTACH_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain; charset=utf-8',
}

export function extOf(fileName: string | null): string {
  const ext = fileName?.split('.').pop()?.toLowerCase() || ''
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : ''
}

export function mimeOf(fileName: string | null): string {
  return ATTACH_MIME[extOf(fileName)] || 'application/octet-stream'
}

// 附件磁盘目录 = 数据库文件同级的 attachments/（Electron 即 userData/attachments）
export function getAttachmentsDir(): string {
  const dir = path.join(path.dirname(getDbPath()), 'attachments')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function attachmentFsPath(filePath: string): string {
  // filePath 仅存基名，拼到附件目录下
  return path.join(getAttachmentsDir(), path.basename(filePath))
}

// 给现有库（未跑迁移的 userData 库）补列，幂等
export async function ensureAttachmentColumns(): Promise<void> {
  const cols = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("Attachment")`)
  const have = new Set(cols.map(c => c.name))
  const add: Record<string, string> = { filePath: 'TEXT', fileSize: 'INTEGER', mimeType: 'TEXT' }
  for (const [name, type] of Object.entries(add)) {
    if (!have.has(name)) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Attachment" ADD COLUMN "${name}" ${type}`)
    }
  }
}

let migrating = false
// 把仍存于 BLOB 的附件搬到磁盘，幂等、可中断（写盘并校验成功后才置空 fileData）
export async function migrateBlobsToDisk(): Promise<{ migrated: number; failed: number }> {
  if (migrating) return { migrated: 0, failed: 0 }
  migrating = true
  let migrated = 0
  let failed = 0
  try {
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `SELECT "id" FROM "Attachment" WHERE "filePath" IS NULL AND "fileData" IS NOT NULL`
    )
    if (rows.length === 0) return { migrated: 0, failed: 0 }

    // 迁移前做一次安全快照（含 BLOB），便于回退
    try { await createBackup('pre-attach-migrate') } catch (e) { console.error('[migrate] 迁移前备份失败:', e) }

    const dir = getAttachmentsDir()
    for (const { id } of rows) {
      try {
        const a = await prisma.attachment.findUnique({
          where: { id },
          select: { id: true, fileName: true, fileData: true },
        })
        if (!a || !a.fileData) continue
        const ext = extOf(a.fileName)
        const fileName = `att-${a.id}${ext ? '.' + ext : ''}`
        const fp = path.join(dir, fileName)
        const buf = Buffer.from(a.fileData)
        fs.writeFileSync(fp, buf)
        // 校验写入完整后才置空 BLOB
        if (fs.statSync(fp).size !== buf.length) throw new Error('写入大小不一致')
        await prisma.attachment.update({
          where: { id },
          data: { filePath: fileName, fileSize: buf.length, mimeType: mimeOf(a.fileName), fileData: null },
        })
        migrated++
      } catch (e) {
        failed++
        console.error(`[migrate] 附件 ${id} 迁移失败:`, e)
      }
    }

    if (migrated > 0) {
      try { await prisma.$executeRawUnsafe('VACUUM') } catch (e) { console.error('[migrate] VACUUM 失败:', e) }
    }
    console.log(`[migrate] 附件迁移完成：成功 ${migrated}，失败 ${failed}`)
    return { migrated, failed }
  } finally {
    migrating = false
  }
}
