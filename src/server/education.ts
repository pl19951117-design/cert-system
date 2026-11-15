// 继续教育：年度名单查询 + 登记（单本 / 批量共用一个入口）
// 账套隔离：名单只取当前账套的人员证件；登记前校验每本证件都属于当前账套。

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logOp } from '@/lib/audit'
import type { SessionUser } from '@/lib/auth'
import { buildEducationRows, type EduRow } from '@/lib/education'
import { getJsonList } from '@/app/api/personnel/_shared'
import { httpErrors } from './http'
import { isoDateNullable, trimmedNullable } from './validation'

const yearSchema = z.coerce.number().int().min(2000, '年度不正确').max(2100, '年度不正确')

export function parseEduYear(raw: string | null): number {
  const r = yearSchema.safeParse(raw)
  if (!r.success) throw httpErrors.badRequest('请指定正确的年度')
  return r.data
}

export async function listEducation(accountId: string, year: number): Promise<EduRow[]> {
  const [people, records] = await Promise.all([
    getJsonList(accountId),
    prisma.certEducation.findMany({ where: { accountId, year } }),
  ])
  return buildEducationRows(people, records, year)
}

export const eduRegisterSchema = z.object({
  year: yearSchema,
  certIds: z.array(z.number().int().positive()).min(1, '请选择证件').max(5000, '一次最多登记 5000 本'),
  attended: z.boolean(),
  attendedDate: isoDateNullable.optional(),
  /** 不传 = 保留原备注（批量登记时用）；传 null / '' = 清空 */
  note: trimmedNullable.optional(),
})
export type EduRegisterInput = z.infer<typeof eduRegisterSchema>

export async function registerEducation(input: EduRegisterInput, accountId: string, session: SessionUser) {
  const ids = Array.from(new Set(input.certIds))
  const owned = await prisma.certificate.findMany({
    where: { id: { in: ids }, deletedAt: null, person: { accountId, deletedAt: null } },
    select: { id: true },
  })
  if (owned.length !== ids.length) throw httpErrors.notFound('部分证件不存在或已删除，请刷新后重试')

  const attendedDate = input.attended ? (input.attendedDate ?? null) : null
  const updatedBy = session.displayName || session.username
  const notePatch = input.note !== undefined ? { note: input.note } : {}

  await prisma.$transaction(ids.map(certId => prisma.certEducation.upsert({
    where: { certId_year: { certId, year: input.year } },
    create: { accountId, certId, year: input.year, attended: input.attended, attendedDate, updatedBy, ...notePatch },
    update: { attended: input.attended, attendedDate, updatedBy, ...notePatch },
  })))

  await logOp(session, '继续教育登记', `${input.year}年度 ${ids.length}本 → ${input.attended ? '已参加' : '未参加'}`, {
    year: input.year, attended: input.attended, attendedDate, certIds: ids,
  })
  return { updated: ids.length }
}
