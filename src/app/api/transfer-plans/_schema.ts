import { z } from 'zod'
import { trimmedNullable, isoDateNullable } from '@/server/validation'

export const transferPlanSchema = z.object({
  direction: z.enum(['in', 'out'], { message: '方向必须是 in 或 out' }),
  name: z.string().trim().min(1, '姓名不能为空').max(100, '姓名过长'),
  idCard: trimmedNullable,
  orgName: trimmedNullable,
  manager: trimmedNullable,
  certTypes: trimmedNullable,
  plannedDate: isoDateNullable,
  note: trimmedNullable,
  personId: z.coerce.number().int().positive().nullish().catch(null),
})
