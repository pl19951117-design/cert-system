import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Ctx = { params: Promise<{ id: string }> }

const LOG_FIELDS = [
  'changeType', 'changeDate', 'orgName', 'manager', 'name',
  'idCard', 'education', 'socialSecurity', 'certType', 'certNo', 'expiryDate',
] as const

export async function PUT(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'viewer') return NextResponse.json({ error: '权限不足' }, { status: 403 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: '非法 ID' }, { status: 400 })

  // accountId 作用域：只能改自己账套的记录
  const existing = await prisma.changeLog.findFirst({ where: { id, accountId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: '记录不存在' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, string | null> = {}
  for (const f of LOG_FIELDS) {
    const v = body?.[f]
    data[f] = (typeof v === 'string' && v.trim()) ? v.trim() : null
  }

  const updated = await prisma.changeLog.update({ where: { id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'viewer') return NextResponse.json({ error: '权限不足' }, { status: 403 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })

  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: '非法 ID' }, { status: 400 })

  // accountId 作用域删除（防跨账套误删）
  const result = await prisma.changeLog.deleteMany({ where: { id, accountId } })
  if (result.count === 0) return NextResponse.json({ error: '记录不存在' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
