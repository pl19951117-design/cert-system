import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyExamToCert } from '@/lib/exam-cert'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json([])
  const exams = await prisma.exam.findMany({
    where: { accountId },
    orderBy: { id: 'desc' },
  })
  return NextResponse.json(exams)
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })
  const body = await req.json()
  const exam = await prisma.exam.create({
    data: {
      accountId,
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
