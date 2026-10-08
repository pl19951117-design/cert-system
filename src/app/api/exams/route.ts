import { prisma } from '@/lib/prisma'
import { ok, created } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'
import { applyExamToCert } from '@/lib/exam-cert'

export const GET = route({}, async ({ accountId }) => {
  const exams = await prisma.exam.findMany({ where: { accountId }, orderBy: { id: 'desc' } })
  return ok(exams)
})

export const POST = route({ roles: WRITER_ROLES }, async ({ req, accountId, session }) => {
  const body = await req.json()
  const exam = await prisma.exam.create({
    data: {
      accountId,
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
  return created(exam)
})
