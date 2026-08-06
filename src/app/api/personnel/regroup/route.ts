// 一键归类：把当前账套所有人员按「归属建制 → 负责人」重排，使同组人员相邻
import { prisma } from '@/lib/prisma'
import { ok } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { planRegroup } from '@/server/personnel/ordering'
import { logOp } from '@/lib/audit'

export const POST = route({ roles: WRITER_ROLES }, async ({ accountId, session }) => {
  // 与列表 API 完全一致的展示顺序
  const ordered = await prisma.person.findMany({
    where: { accountId, deletedAt: null },
    orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    select: { id: true, orgName: true, manager: true, sortOrder: true },
  })

  const newOrder = planRegroup(ordered)
  const current = new Map(ordered.map(p => [p.id, p.sortOrder]))

  // 只写有变化的行，最小化写入
  const updates: { id: number; sortOrder: number }[] = []
  newOrder.forEach((id, i) => {
    const next = i + 1
    if (current.get(id) !== next) updates.push({ id, sortOrder: next })
  })

  if (updates.length > 0) {
    // 交互式事务：人数多时写入较久，显式放宽超时（数组式事务不支持 timeout 选项）
    await prisma.$transaction(async (tx) => {
      for (const u of updates) {
        await tx.person.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } })
      }
    }, { timeout: 60000 })
    await logOp(session, '按建制归类', accountId, { total: ordered.length, moved: updates.length })
  }

  return ok({ total: ordered.length, moved: updates.length })
})
