import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId } from '@/server/validation'
import { created, httpErrors } from '@/server/http'
import { reportSelect } from '@/server/business-records'

const TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain; charset=utf-8',
}

export const POST = route<{ id: string }>({ roles: WRITER_ROLES }, async ({ req, params, accountId }) => {
  const inspectionId = parseId(params.id)
  const record = await prisma.safetyInspection.findFirst({ where: { id: inspectionId, accountId }, select: { id: true } })
  if (!record) throw httpErrors.notFound('检查记录不存在')
  if (Number(req.headers.get('content-length') || 0) > 21 * 1024 * 1024) throw httpErrors.badRequest('单份报告不能超过 20 MB')
  let form: FormData
  try { form = await req.formData() }
  catch { throw httpErrors.badRequest('报告文件无法读取，请检查文件大小后重试') }
  const file = form.get('file')
  if (!(file instanceof File) || !file.size) throw httpErrors.badRequest('请选择非空报告文件')
  if (file.size > 20 * 1024 * 1024) throw httpErrors.badRequest('单份报告不能超过 20 MB')
  const fileName = file.name.replace(/[\x00-\x1f/\\]/g, '_').slice(0, 200)
  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  const mimeType = TYPES[extension]
  if (!mimeType) throw httpErrors.badRequest('支持 PDF、图片、Word、Excel 和 TXT 文件')
  // Reports live in SQLite: both database backups and full backups preserve them atomically.
  const report = await prisma.safetyReport.create({ data: {
    inspectionId, fileName, mimeType, fileSize: file.size, fileData: Buffer.from(await file.arrayBuffer()),
  }, select: reportSelect })
  return created(report)
})

export const GET = route<{ id: string }>({}, async ({ req, params, accountId }) => {
  const inspectionId = parseId(params.id)
  const reportId = parseId(req.nextUrl.searchParams.get('report') || '', '报告编号')
  const report = await prisma.safetyReport.findFirst({ where: {
    id: reportId, inspectionId, inspection: { accountId },
  } })
  if (!report) throw httpErrors.notFound('报告不存在')
  const inline = req.nextUrl.searchParams.get('inline') === '1' && /^(application\/pdf|image\/|text\/plain)/.test(report.mimeType)
  return new NextResponse(new Uint8Array(report.fileData), { headers: {
    'Content-Type': report.mimeType,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(report.fileName)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'private, no-store',
  } })
})

export const DELETE = route<{ id: string }>({ roles: WRITER_ROLES }, async ({ req, params, accountId }) => {
  const result = await prisma.safetyReport.deleteMany({ where: {
    id: parseId(req.nextUrl.searchParams.get('report') || '', '报告编号'),
    inspectionId: parseId(params.id), inspection: { accountId },
  } })
  if (!result.count) throw httpErrors.notFound('报告不存在')
  return NextResponse.json({ deleted: true })
})
