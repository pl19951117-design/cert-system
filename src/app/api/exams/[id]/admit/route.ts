import { created } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId, parseJsonBody } from '@/server/validation'
import { admitExam, admitSchema } from '@/server/exams/admit'

type Params = { id: string }

/** 考试通过人员「准入人员库」：新建人员（或关联已有人员），可同时生成证件 */
export const POST = route<Params>({ roles: WRITER_ROLES }, async ({ req, params, accountId, session }) => {
  const id = parseId(params.id)
  const input = await parseJsonBody(req, admitSchema)
  return created(await admitExam(id, input, accountId, session))
})
