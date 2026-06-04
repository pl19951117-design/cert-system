import { noContent, ok } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId, parseJsonBody } from '@/server/validation'
import { personUpdateSchema } from '@/server/personnel/schemas'
import { personnelService } from '@/server/personnel/service'

type Params = { id: string }

export const GET = route<Params>({}, async ({ params, accountId }) => {
  const id = parseId(params.id)
  return ok(await personnelService.get(id, accountId))
})

export const PUT = route<Params>({ roles: WRITER_ROLES }, async ({ req, params, accountId, session }) => {
  const id = parseId(params.id)
  const input = await parseJsonBody(req, personUpdateSchema)
  return ok(await personnelService.update(id, input, accountId, session))
})

export const DELETE = route<Params>({ roles: WRITER_ROLES }, async ({ params, accountId, session }) => {
  const id = parseId(params.id)
  await personnelService.softDelete(id, accountId, session)
  return noContent()
})
