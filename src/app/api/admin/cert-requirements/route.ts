import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json([])
  const reqs = await prisma.certRequirement.findMany({
    where: { accountId },
    orderBy: [{ orgName: 'asc' }, { certType: 'asc' }],
  })
  return NextResponse.json(reqs)
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })
  const { orgName, certType } = await req.json()
  if (!certType?.trim()) return NextResponse.json({ error: '证件类别不能为空' }, { status: 400 })
  try {
    const r = await prisma.certRequirement.create({
      data: { accountId, orgName: orgName?.trim() || null, certType: certType.trim() },
    })
    return NextResponse.json(r)
  } catch {
    return NextResponse.json({ error: '该要求已存在' }, { status: 400 })
  }
}
