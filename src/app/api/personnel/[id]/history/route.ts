import { prisma } from '@/lib/prisma'
import { ok, httpErrors } from '@/server/http'
import { route } from '@/server/handler'
import { parseId } from '@/server/validation'

type Params = { id: string }

export const GET = route<Params>({}, async ({ params, accountId }) => {
  const personId = parseId(params.id)
  // 账套隔离：先确认该人员属于当前账套，避免跨账套读取证件历史
  const person = await prisma.person.findFirst({ where: { id: personId, accountId }, select: { id: true } })
  if (!person) throw httpErrors.notFound('人员不存在')

  const history = await prisma.certHistory.findMany({
    where: { personId },
    orderBy: { id: 'desc' },
  })
  return ok(history)
})
