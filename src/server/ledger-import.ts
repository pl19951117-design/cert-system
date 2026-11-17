import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { BusinessKind } from '@/lib/business-records'
import { safetySchema, legalSchema, validateChoices } from './business-records'
import { route, WRITER_ROLES } from './handler'
import { httpErrors, ok } from './http'
export function importLedger(kind: BusinessKind) {
  return route({ roles: WRITER_ROLES }, async ({ req, accountId }) => {
    const text = await req.text()
    if (text.length > 5 * 1024 * 1024) throw httpErrors.badRequest('导入数据过大')
    let body: unknown
    try { body = JSON.parse(text) } catch { throw httpErrors.badRequest('导入数据格式错误') }
    const parsed = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000) }).safeParse(body)
    if (!parsed.success) throw httpErrors.badRequest('单次导入须为 1 至 1000 条记录')
    const rows = parsed.data.rows.map((row, index) => {
      const result = (kind === 'safety-inspections' ? safetySchema : legalSchema).safeParse(row)
      const line = Number.isInteger(row._row) ? row._row : index + 2
      if (!result.success) throw httpErrors.badRequest(`第 ${line} 行：${result.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('；')}`)
      try { validateChoices(kind, result.data) } catch { throw httpErrors.badRequest(`第 ${line} 行选项无效，请参照模板填写`) }
      return result.data
    })
    await prisma.$transaction(rows.map(row => kind === 'safety-inspections'
      ? prisma.safetyInspection.create({ data: { accountId, ...safetySchema.parse(row) } })
      : prisma.legalCase.create({ data: { accountId, ...legalSchema.parse(row) } })))
    return ok({ imported: rows.length })
  })
}
