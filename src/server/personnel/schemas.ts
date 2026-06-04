// 人员证件领域的输入 schema — 由 zod 强制类型 + 业务规则

import { z } from 'zod'
import { intNullable, isoDateNullable, trimmedNullable } from '../validation'

const CURRENT_YEAR = new Date().getFullYear()

// ===== 人员 =====

/** 人员公共可写字段 */
const personBase = z.object({
  orgName:        trimmedNullable.optional(),
  manager:        trimmedNullable.optional(),
  idCard:         trimmedNullable.optional(),
  birthYear:      intNullable({ min: 1900, max: CURRENT_YEAR, field: '出生年份' }).optional(),
  education:      trimmedNullable.optional(),
  socialSecurity: trimmedNullable.optional(),
  sortOrder:      intNullable({ min: 0, max: 2_000_000_000, field: '排序值' }).optional(),
})

/**
 * 创建人员。
 * 注意：客户端表单同时包含「首张证件」字段（certType/certNo/.../issuer），
 * 但服务端仅创建人员；证件由客户端在收到 personId 后另起一次
 * POST /api/personnel/{id}/certs 调用。zod 默认 strip 未知字段，所以这里
 * 不声明 cert 字段也不会因 "unknown key" 报错。
 */
export const personCreateSchema = personBase.extend({
  name: z.string().trim().min(1, '姓名不能为空').max(100, '姓名过长'),
})
export type PersonCreateInput = z.infer<typeof personCreateSchema>

/** 更新人员 — name 仍必填（避免误清空） */
export const personUpdateSchema = personBase.extend({
  name: z.string().trim().min(1, '姓名不能为空').max(100, '姓名过长'),
})
export type PersonUpdateInput = z.infer<typeof personUpdateSchema>

// ===== 证件 =====

const certBase = z.object({
  certType:   trimmedNullable.optional(),
  certNo:     trimmedNullable.optional(),
  issueDate:  isoDateNullable.optional(),
  expiryDate: isoDateNullable.optional(),
  issuer:     trimmedNullable.optional(),
})

export const certCreateSchema = certBase
export type CertCreateInput = z.infer<typeof certCreateSchema>

export const certUpdateSchema = certBase
export type CertUpdateInput = z.infer<typeof certUpdateSchema>
