import { getJsonList } from './_shared'
import { ok, created } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseJsonBody } from '@/server/validation'
import { personCreateSchema } from '@/server/personnel/schemas'
import { personnelService } from '@/server/personnel/service'

export const GET = route({}, async ({ accountId }) => {
  return ok(await getJsonList(accountId))
})

export const POST = route({ roles: WRITER_ROLES }, async ({ req, accountId, session }) => {
  const input = await parseJsonBody(req, personCreateSchema)
  const person = await personnelService.create(input, accountId, session)
  return created(person)
})
