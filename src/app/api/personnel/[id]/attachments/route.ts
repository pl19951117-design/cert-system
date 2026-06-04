import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAttachmentsDir, extOf, mimeOf } from '@/lib/attachments'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

type Ctx = { params: Promise<{ id: string }> }

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

// 列出该人员的所有附件（仅元数据，不含文件内容）
export async function GET(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const attachments = await prisma.attachment.findMany({
    where: { personId: Number(id) },
    select: { id: true, certId: true, fileName: true, uploadTime: true },
    orderBy: { uploadTime: 'desc' },
  })
  return NextResponse.json(attachments)
}

// 上传附件（multipart/form-data: file，可选 certId）
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 })

  const { id } = await params
  const form = await req.formData()
  const file = form.get('file')
  const certIdRaw = form.get('certId')

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: '未选择文件' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '文件过大（上限 20MB）' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const certId = certIdRaw && typeof certIdRaw === 'string' && certIdRaw !== '' ? Number(certIdRaw) : null

  // 写入磁盘，数据库只存文件名（基名）
  const ext = extOf(file.name)
  const diskName = `att-${crypto.randomUUID()}${ext ? '.' + ext : ''}`
  fs.writeFileSync(path.join(getAttachmentsDir(), diskName), bytes)

  const attachment = await prisma.attachment.create({
    data: {
      personId: Number(id),
      certId,
      fileName: file.name,
      filePath: diskName,
      fileSize: bytes.length,
      mimeType: mimeOf(file.name),
    },
    select: { id: true, certId: true, fileName: true, uploadTime: true },
  })
  return NextResponse.json(attachment)
}
