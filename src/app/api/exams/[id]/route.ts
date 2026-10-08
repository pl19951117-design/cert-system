import { prisma } from '@/lib/prisma'
import { ok, noContent, httpErrors } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseId } from '@/server/validation'
import { applyExamToCert } from '@/lib/exam-cert'

type Params = { id: string }

/** 取报名记录并校验归属当前账套；不存在或跨账套都 404，避免 IDOR */
async function findScoped(id: number, accountId: string) {
  const exam = await prisma.exam.findFirst({ where: { id, accountId } })
  if (!exam) throw httpErrors.notFound('报名记录不存在')
  return exam
}

export const PUT = route<Params>({ roles: WRITER_ROLES }, async ({ req, params, accountId, session }) => {
  const id = parseId(params.id)
  await findScoped(id, accountId)   // 账套隔离校验
  const body = await req.json()
  const exam = await prisma.exam.update({
    where: { id },
    data: {
      personId: body.personId ? Number(body.personId) : null,
      certId: body.certId ? Number(body.certId) : null,
      orgName: body.orgName || null,
      manager: body.manager || null,
      name: body.name || null,
      idCard: typeof body.idCard === 'string' ? body.idCard.trim() || null : null,
      certType: body.certType || null,
      regDate: body.regDate || null,
      isPassed: body.isPassed || '待考',
      certNo: body.certNo || null,
      issueDate: body.issueDate || null,
      expiryDate: body.expiryDate || null,
      issuer: body.issuer || null,
    },
  })
  await applyExamToCert(exam.id, session)
  return ok(exam)
})

export const DELETE = route<Params>({ roles: WRITER_ROLES }, async ({ params, accountId }) => {
  const id = parseId(params.id)
  await findScoped(id, accountId)
  await prisma.exam.delete({ where: { id } })
  return noContent()
})
