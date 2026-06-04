// 批量延期当前人员所有证件（前端已不再调用，保留兼容）
import { ok } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId } from '@/server/validation'
import { certificateService } from '@/server/personnel/service'

type Params = { id: string }

export const POST = route<Params>({ roles: WRITER_ROLES }, async ({ params, accountId, session }) => {
  const personId = parseId(params.id)
  return ok(await certificateService.extendAll(personId, accountId, session))
})
