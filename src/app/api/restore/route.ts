import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { stageRestore, stageRestoreFromPath } from '@/lib/backup'

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: '仅超级管理员可恢复数据' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { fileName, path: extPath } = body as { fileName?: string; path?: string }

  let r: { ok: boolean; error?: string }
  if (extPath) {
    r = await stageRestoreFromPath(extPath)
  } else if (fileName) {
    r = stageRestore(fileName)
  } else {
    return NextResponse.json({ error: '未指定备份文件' }, { status: 400 })
  }

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true, message: '恢复已就绪，重启应用后生效' })
}
