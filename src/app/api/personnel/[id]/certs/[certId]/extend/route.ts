import { ok } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId } from '@/server/validation'
import { certificateService } from '@/server/personnel/service'

type Params = { id: string; certId: string }

export const POST = route<Params>({ roles: WRITER_ROLES }, async ({ params, accountId, session }) => {
  const personId = parseId(params.id, 'personId')
  const certId = parseId(params.certId, 'certId')
  const result = await certificateService.extend(personId, certId, accountId, session)
  return ok({ ok: true, ...result })
})
