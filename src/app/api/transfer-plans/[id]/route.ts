import { prisma } from '@/lib/prisma'
import { httpErrors, noContent, ok } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId, parseJsonBody } from '@/server/validation'
import { transferPlanSchema } from '../_schema'
import { z } from 'zod'

type Params = { id: string }

// 更新支持两种载荷：编辑字段（同创建）或只改状态 { status: 'pending' | 'done' }
const updateSchema = transferPlanSchema.partial().extend({
  status: z.enum(['pending', 'done']).optional(),
})

/** accountId 作用域取记录；不存在或跨账套都 404 */
async function findScoped(id: number, accountId: string) {
  const plan = await prisma.transferPlan.findFirst({ where: { id, accountId } })
  if (!plan) throw httpErrors.notFound('登记记录不存在')
  return plan
}

export const PUT = route<Params>({ roles: WRITER_ROLES }, async ({ req, params, accountId }) => {
  const id = parseId(params.id)
  const before = await findScoped(id, accountId)
  const input = await parseJsonBody(req, updateSchema)

  const data: Record<string, unknown> = {}
  for (const k of ['direction', 'name', 'idCard', 'orgName', 'manager', 'certTypes', 'plannedDate', 'note', 'personId'] as const) {
    if (input[k] !== undefined) data[k] = input[k]
  }
  if (input.status !== undefined && input.status !== before.status) {
    data.status = input.status
    data.completedAt = input.status === 'done' ? new Date() : null
  }

  const updated = await prisma.transferPlan.update({ where: { id }, data })
  return ok(updated)
})

export const DELETE = route<Params>({ roles: WRITER_ROLES }, async ({ params, accountId }) => {
  const id = parseId(params.id)
  await findScoped(id, accountId)
  await prisma.transferPlan.delete({ where: { id } })
  return noContent()
})
