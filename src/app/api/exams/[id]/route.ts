import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyExamToCert } from '@/lib/exam-cert'

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const exam = await prisma.exam.update({
    where: { id: Number(id) },
    data: {
      personId: body.personId ? Number(body.personId) : null,
      certId: body.certId ? Number(body.certId) : null,
      orgName: body.orgName || null,
      manager: body.manager || null,
      name: body.name || null,
      certType: body.certType || null,
      regDate: body.regDate || null,
      isPassed: body.isPassed || '待考',
      certNo: body.certNo || null,
      issueDate: body.issueDate || null,
      expiryDate: body.expiryDate || null,
      issuer: body.issuer || null,
    },
  })
  await applyExamToCert(exam.id, session)
  return NextResponse.json(exam)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.exam.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
