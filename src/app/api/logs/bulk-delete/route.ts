// 批量删除变动流水 —— 严格 accountId-scoped，防止跨账套误删
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'viewer') return NextResponse.json({ error: '权限不足' }, { status: 403 })

  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const ids: unknown = body?.ids
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: '请选择要删除的记录' }, { status: 400 })
  }
  const numericIds = ids
    .map(v => typeof v === 'number' ? v : Number(v))
    .filter(n => Number.isInteger(n) && n > 0)
  if (numericIds.length === 0) {
    return NextResponse.json({ error: '没有合法的 ID' }, { status: 400 })
  }

  // accountId 作用域 —— 只能删自己账套的记录
  const result = await prisma.changeLog.deleteMany({
    where: { id: { in: numericIds }, accountId },
  })
  return NextResponse.json({ deleted: result.count })
}
