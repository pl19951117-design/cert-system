import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { backupFilePath, createBackup } from '@/lib/backup'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: '仅超级管理员可下载备份' }, { status: 403 })

  const file = req.nextUrl.searchParams.get('file')
  let fp: string | null
  let name: string
  if (file) {
    fp = backupFilePath(file)
    if (!fp) return NextResponse.json({ error: '备份文件不存在' }, { status: 404 })
    name = file
  } else {
    // 不指定则即时生成一份全新快照供下载
    const r = await createBackup()
    fp = r.filePath
    name = r.fileName
  }

  const size = statSync(fp).size
  const stream = Readable.toWeb(createReadStream(fp)) as unknown as ReadableStream
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Length': String(size),
    },
  })
}
