import { noContent, ok } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId, parseJsonBody } from '@/server/validation'
import { certUpdateSchema } from '@/server/personnel/schemas'
import { certificateService } from '@/server/personnel/service'

type Params = { id: string; certId: string }

export const PUT = route<Params>({ roles: WRITER_ROLES }, async ({ req, params, accountId, session }) => {
  const personId = parseId(params.id, 'personId')
  const certId = parseId(params.certId, 'certId')
  const input = await parseJsonBody(req, certUpdateSchema)
  return ok(await certificateService.update(personId, certId, input, accountId, session))
})

export const DELETE = route<Params>({ roles: WRITER_ROLES }, async ({ params, accountId, session }) => {
  const personId = parseId(params.id, 'personId')
  const certId = parseId(params.certId, 'certId')
  await certificateService.softDelete(personId, certId, accountId, session)
  return noContent()
})
