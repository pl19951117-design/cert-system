// 重排账套显示顺序 —— super_admin 限定
// 入参：{ ids: string[] }  按目标显示顺序排列的账套 ID 数组
// 逻辑：把数组里出现的账套 sortOrder 写为 1..N（按入参顺序）；
//      未在数组里出现的账套 sortOrder 置 NULL（沿用 createdAt 兜底排序）
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const ids: unknown = body?.ids
  if (!Array.isArray(ids) || ids.some(v => typeof v !== 'string' || !v.trim())) {
    return NextResponse.json({ error: '参数 ids 必须为非空字符串数组' }, { status: 400 })
  }
  const list = (ids as string[]).map(s => s.trim())
  const seen = new Set<string>()
  for (const id of list) {
    if (seen.has(id)) return NextResponse.json({ error: '账套 ID 不能重复' }, { status: 400 })
    seen.add(id)
  }

  // 校验所有 ID 都存在（防止前端漂移导致部分更新）
  const exist = await prisma.account.findMany({ where: { id: { in: list } }, select: { id: true } })
  if (exist.length !== list.length) {
    return NextResponse.json({ error: '部分账套不存在' }, { status: 400 })
  }

  // 事务里改：入参 ids → sortOrder 1..N；未列出者清空 sortOrder
  await prisma.$transaction([
    prisma.account.updateMany({ where: { id: { notIn: list } }, data: { sortOrder: null } }),
    ...list.map((id, idx) =>
      prisma.account.update({ where: { id }, data: { sortOrder: idx + 1 } })
    ),
  ])

  return NextResponse.json({ ok: true, count: list.length })
}
