import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json([])
  const logs = await prisma.changeLog.findMany({
    where: { accountId },
    orderBy: { id: 'desc' },
  })
  return NextResponse.json(logs)
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })
  const body = await req.json()
  const log = await prisma.changeLog.create({
    data: {
      accountId,
      changeType: body.changeType || null,
      changeDate: body.changeDate || null,
      orgName: body.orgName || null,
      manager: body.manager || null,
      name: body.name || null,
      idCard: body.idCard || null,
      education: body.education || null,
      socialSecurity: body.socialSecurity || null,
      certType: body.certType || null,
      certNo: body.certNo || null,
      expiryDate: body.expiryDate || null,
    },
  })
  return NextResponse.json(log)
}
