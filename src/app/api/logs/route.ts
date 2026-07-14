import { prisma } from '@/lib/prisma'
import { ok, created } from '@/server/http'
import { route, WRITER_ROLES } from '@/server/handler'

export const GET = route({}, async ({ accountId }) => {
  const logs = await prisma.changeLog.findMany({ where: { accountId }, orderBy: { id: 'desc' } })
  return ok(logs)
})

export const POST = route({ roles: WRITER_ROLES }, async ({ req, accountId }) => {
  const body = await req.json()
  const log = await prisma.changeLog.create({
    data: {
      accountId,
      changeType: body.changeType || null,
      changeDate: body.changeDate || null,
      orgName: body.orgName || null,
      manager: body.manager || null,
      name: body.name || null,
      idCard: body.idCard || null,
      education: body.education || null,
      socialSecurity: body.socialSecurity || null,
      certType: body.certType || null,
      certNo: body.certNo || null,
      expiryDate: body.expiryDate || null,
    },
  })
  return created(log)
})
