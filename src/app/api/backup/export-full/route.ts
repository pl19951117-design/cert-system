import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { createFullExport } from '@/lib/backup'
import { createReadStream, statSync, rmSync } from 'fs'
import { Readable } from 'stream'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: '仅超级管理员可导出' }, { status: 403 })

  const { filePath, fileName, tmpDir } = await createFullExport()
  const size = statSync(filePath).size
  const nodeStream = createReadStream(filePath)
  // 流结束后清理临时目录
  nodeStream.on('close', () => { try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ } })
  const stream = Readable.toWeb(nodeStream) as unknown as ReadableStream

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Content-Length': String(size),
    },
  })
}
