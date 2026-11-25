import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { CASE_RESULTS, BUSINESS_CATEGORIES, CASE_TYPES, normalizeMoney } from '@/lib/business-records'
import { isoDateNullable, parseId, parseJsonBody, trimmedNullable } from './validation'
import { route, WRITER_ROLES } from './handler'
import { created, httpErrors, noContent, ok } from './http'
import type { BusinessKind } from '@/lib/business-records'

const amount = z.unknown().default(null).transform((value, ctx) => {
  try { return normalizeMoney(value) } catch (e) {
    ctx.addIssue({ code: 'custom', message: (e as Error).message })
    return z.NEVER
  }
})
const date = isoDateNullable.refine(value => !value || (
  !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
), '请输入有效日期')
const base = { orgName: trimmedNullable, manager: trimmedNullable, amount }
export const safetySchema = z.object({ ...base,
  projectName: z.string().trim().min(1, '请填写项目名称').max(200),
  inspectionDate: date,
})
export const legalSchema = z.object({ ...base,
  caseNo: z.string().trim().min(1, '请填写案件编号').max(200),
  party: trimmedNullable, businessCategory: trimmedNullable, caseType: trimmedNullable, hearingDate: date, result: trimmedNullable,
})
export function validateChoices(kind: BusinessKind, data: Record<string, unknown>, previous: Record<string, unknown> = {}) {
  if (kind === 'safety-inspections') return
  const choices = { result: CASE_RESULTS, businessCategory: BUSINESS_CATEGORIES, caseType: CASE_TYPES }
  for (const [key, allowed] of Object.entries(choices)) {
    const value = data[key]
    if (value && value !== previous[key] && !(allowed as readonly string[]).includes(String(value))) throw httpErrors.badRequest(key + '请选择有效选项')
  }
}
export const reportSelect = { id: true, fileName: true, fileSize: true, category: true } as const

// Fixed route factories keep authentication and account isolation identical for both ledgers.
export function recordRoutes(kind: BusinessKind) {
  const safety = kind === 'safety-inspections'
  return {
    GET: route({}, async ({ accountId }) => ok(safety
      ? await prisma.safetyInspection.findMany({ where: { accountId }, include: { reports: { select: reportSelect } }, orderBy: { id: 'desc' } })
      : await prisma.legalCase.findMany({ where: { accountId }, orderBy: { id: 'desc' } }))),
    POST: route({ roles: WRITER_ROLES }, async ({ req, accountId }) => {
      const data = safety ? await parseJsonBody(req, safetySchema) : await parseJsonBody(req, legalSchema)
      validateChoices(kind, data)
      if (safety) return created(await prisma.safetyInspection.create({ data: { accountId, ...safetySchema.parse(data) }, include: { reports: { select: reportSelect } } }))
      return created(await prisma.legalCase.create({ data: { accountId, ...legalSchema.parse(data) } }))
    }),
  }
}

export function recordItemRoutes(kind: BusinessKind) {
  const safety = kind === 'safety-inspections'
  return {
    PUT: route<{ id: string }>({ roles: WRITER_ROLES }, async ({ req, params, accountId }) => {
      const id = parseId(params.id)
      const previous = safety ? await prisma.safetyInspection.findFirst({ where: { id, accountId } }) : await prisma.legalCase.findFirst({ where: { id, accountId } })
      if (!previous) throw httpErrors.notFound('记录不存在')
      const data = safety ? await parseJsonBody(req, safetySchema) : await parseJsonBody(req, legalSchema)
      validateChoices(kind, data, previous)
      // Use the scoped condition for the write itself, so account switching cannot affect another ledger.
      if (safety) {
        const result = await prisma.safetyInspection.updateMany({ where: { id, accountId }, data: safetySchema.parse(data) })
        if (!result.count) throw httpErrors.notFound('记录不存在')
        return ok(await prisma.safetyInspection.findUnique({ where: { id }, include: { reports: { select: reportSelect } } }))
      }
      const result = await prisma.legalCase.updateMany({ where: { id, accountId }, data: legalSchema.parse(data) })
      if (!result.count) throw httpErrors.notFound('记录不存在')
      return ok(await prisma.legalCase.findUnique({ where: { id } }))
    }),
    DELETE: route<{ id: string }>({ roles: WRITER_ROLES }, async ({ params, accountId }) => {
      const id = parseId(params.id)
      const result = safety
        ? await prisma.safetyInspection.deleteMany({ where: { id, accountId } })
        : await prisma.legalCase.deleteMany({ where: { id, accountId } })
      if (!result.count) throw httpErrors.notFound('记录不存在')
      return noContent()
    }),
  }
}
