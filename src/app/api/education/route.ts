import { ok } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseJsonBody } from '@/server/validation'
import { eduRegisterSchema, listEducation, parseEduYear, registerEducation } from '@/server/education'

/** 某年度到期证件的继续教育名单：GET /api/education?year=2027 */
export const GET = route({}, async ({ req, accountId }) => {
  const year = parseEduYear(req.nextUrl.searchParams.get('year'))
  return ok({ year, rows: await listEducation(accountId, year) })
})

/** 登记是否已参加继续教育（单本或批量）：PUT /api/education */
export const PUT = route({ roles: WRITER_ROLES }, async ({ req, accountId, session }) => {
  const input = await parseJsonBody(req, eduRegisterSchema)
  return ok(await registerEducation(input, accountId, session))
})
