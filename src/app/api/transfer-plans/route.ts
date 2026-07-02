import { prisma } from '@/lib/prisma'
import { ok, created } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseJsonBody } from '@/server/validation'
import { transferPlanSchema } from './_schema'

export const GET = route({}, async ({ accountId }) => {
  const plans = await prisma.transferPlan.findMany({
    where: { accountId },
    orderBy: [
      { status: 'asc' },                                    // pending 在 done 前
      { plannedDate: { sort: 'asc', nulls: 'last' } },      // 待办按计划日期升序
      { id: 'desc' },
    ],
  })
  return ok(plans)
})

export const POST = route({ roles: WRITER_ROLES }, async ({ req, accountId }) => {
  const input = await parseJsonBody(req, transferPlanSchema)
  const plan = await prisma.transferPlan.create({
    data: {
      accountId,
      direction: input.direction,
      name: input.name,
      idCard: input.idCard ?? null,
      orgName: input.orgName ?? null,
      manager: input.manager ?? null,
      certTypes: input.certTypes ?? null,
      plannedDate: input.plannedDate ?? null,
      note: input.note ?? null,
      personId: input.personId ?? null,
    },
  })
  return created(plan)
})
