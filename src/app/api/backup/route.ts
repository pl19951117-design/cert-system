import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { createBackup, listBackups, pruneBackups, getDbPath, getBackupsDir } from '@/lib/backup'
import fs from 'fs'

async function requireAdmin(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (session.role !== 'super_admin') return { error: NextResponse.json({ error: '仅超级管理员可操作备份' }, { status: 403 }) }
  return { session }
}

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req)
  if (error) return error
  let dbSize = 0
  try { dbSize = fs.statSync(getDbPath()).size } catch { /* ignore */ }
  return NextResponse.json({
    backups: listBackups(),
    dbSize,
    backupsDir: getBackupsDir(),
    isDesktop: process.env.ELECTRON === '1',
  })
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req)
  if (error) return error
  try {
    const r = await createBackup()
    pruneBackups()
    return NextResponse.json({ ok: true, created: r.fileName, backups: listBackups() })
  } catch (e) {
    return NextResponse.json({ error: '备份失败：' + (e instanceof Error ? e.message : String(e)) }, { status: 500 })
  }
}
