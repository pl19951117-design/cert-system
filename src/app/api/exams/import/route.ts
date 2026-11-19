import { z } from 'zod'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseJsonBody } from '@/server/validation'
import { sheetBatch, sheetDate, sheetText } from '@/server/sheet-input'
import { prisma } from '@/lib/prisma'
import { httpErrors, ok } from '@/server/http'
const record = z.object({
  name:z.string().trim().min(1,'姓名必填').max(200), orgName:sheetText, manager:sheetText, idCard:sheetText, certType:sheetText,
  regDate:sheetDate, issueDate:sheetDate, expiryDate:sheetDate, certNo:sheetText, issuer:sheetText,
  isPassed:z.preprocess(v => v || '待考',z.enum(['待考','已通过','未通过','已取证'])),
})
export const POST = route({roles:WRITER_ROLES},async ({req,accountId}) => {
  const { rows } = await parseJsonBody(req,sheetBatch)
  const data = rows.map((row,i) => {
    const result = record.safeParse(row)
    if (!result.success) throw httpErrors.badRequest(`第 ${Number(row._row)||i+2} 行：${result.error.issues[0].message}`)
    return {accountId,...result.data}
  })
  await prisma.exam.createMany({data})
  return ok({imported:data.length})
})
