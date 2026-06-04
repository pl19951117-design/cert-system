import { created } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId, parseJsonBody } from '@/server/validation'
import { certCreateSchema } from '@/server/personnel/schemas'
import { certificateService } from '@/server/personnel/service'

type Params = { id: string }

export const POST = route<Params>({ roles: WRITER_ROLES }, async ({ req, params, accountId, session }) => {
  const personId = parseId(params.id)
  const input = await parseJsonBody(req, certCreateSchema)
  const cert = await certificateService.create(personId, input, accountId, session)
  return created(cert)
})
