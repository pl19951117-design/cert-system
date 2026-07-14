import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { attachmentFsPath, mimeOf } from '@/lib/attachments'
import { createReadStream, existsSync, statSync, rmSync } from 'fs'
import { Readable } from 'stream'

type Ctx = { params: Promise<{ id: string; attId: string }> }

/** 账套隔离：确认附件所属人员属于当前账套 */
async function attachmentInAccount(attId: number, accountId: string): Promise<boolean> {
  if (!accountId) return false
  const att = await prisma.attachment.findFirst({
    where: { id: attId, person: { accountId } },
    select: { id: true },
  })
  return !!att
}

// 下载 / 预览附件（优先磁盘，兼容尚未迁移的旧 BLOB）
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { attId } = await params
  const accountId = await getAccountId(req)
  if (!await attachmentInAccount(Number(attId), accountId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const att = await prisma.attachment.findUnique({
    where: { id: Number(attId) },
    select: { id: true, fileName: true, filePath: true, fileData: true },
  })
  if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fileName = att.fileName || `attachment-${att.id}`
  const inline = req.nextUrl.searchParams.get('inline') === '1'
  const disposition = inline ? 'inline' : 'attachment'
  const headers = (len: number) => ({
    'Content-Type': mimeOf(att.fileName),
    'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'Content-Length': String(len),
  })

  if (att.filePath) {
    const fp = attachmentFsPath(att.filePath)
    if (!existsSync(fp)) return NextResponse.json({ error: '附件文件丢失' }, { status: 404 })
    const size = statSync(fp).size
    const stream = Readable.toWeb(createReadStream(fp)) as unknown as ReadableStream
    return new Response(stream, { headers: headers(size) })
  }

  if (att.fileData) {
    const body = new Uint8Array(att.fileData)
    return new Response(body, { headers: headers(body.byteLength) })
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

// 删除附件（同时删除磁盘文件）
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 })
  const { attId } = await params
  const accountId = await getAccountId(req)
  if (!await attachmentInAccount(Number(attId), accountId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const att = await prisma.attachment.findUnique({
    where: { id: Number(attId) },
    select: { filePath: true },
  })
  await prisma.attachment.delete({ where: { id: Number(attId) } })
  if (att?.filePath) {
    try { rmSync(attachmentFsPath(att.filePath), { force: true }) } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true })
}
