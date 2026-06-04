// 内部辅助：列表查询（不应放在 service 因为是纯 HTTP read 优化）

import { prisma } from '@/lib/prisma'

export async function getJsonList(accountId: string) {
  return prisma.person.findMany({
    where: { accountId, deletedAt: null },
    include: {
      certificates: { where: { deletedAt: null } },
    },
    orderBy: [
      { sortOrder: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
    ],
  })
}
