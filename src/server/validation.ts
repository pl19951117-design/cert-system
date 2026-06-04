// 输入验证辅助 — 都会在失败时抛 HttpError，被 route() 翻译为 4xx

import type { NextRequest } from 'next/server'
import { z, type ZodType } from 'zod'
import { httpErrors } from './http'

/** 解析路径段为正整数 ID；NaN / 0 / 负数 / 非整数都抛 400 */
export function parseId(value: string, field = 'id'): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw httpErrors.badRequest(`无效的 ${field}: ${value}`)
  }
  return n
}

/** 安全解析 JSON 请求体 + 校验 */
export async function parseJsonBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw httpErrors.badRequest('请求体不是合法的 JSON')
  }
  return schema.parse(raw)
}

// ===== 通用 zod 片段 =====

/** 把 '' / null / undefined 统一为 null，否则保留字符串（含 trim） */
export const trimmedNullable = z.preprocess(
  v => {
    if (v === null || v === undefined) return null
    if (typeof v === 'string') {
      const t = v.trim()
      return t === '' ? null : t
    }
    return v
  },
  z.string().nullable(),
)

/** YYYY-MM-DD 日期字符串；接受单/双位数字月日并规范化为双位数 */
export const isoDateNullable = z.preprocess(
  v => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v !== 'string') return v
    const t = v.trim()
    if (t === '') return null
    const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) return v // 让后续 schema 报错
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD').nullable(),
)

/** 把可能是字符串或数字的值规范化为整数，空串/null/undefined → null */
export function intNullable(opts: { min?: number; max?: number; field?: string } = {}) {
  return z.preprocess(
    v => {
      if (v === null || v === undefined || v === '') return null
      if (typeof v === 'number') return Number.isInteger(v) ? v : NaN
      if (typeof v === 'string') {
        const t = v.trim()
        if (t === '') return null
        const n = Number(t)
        return Number.isInteger(n) ? n : NaN
      }
      return NaN
    },
    z.number().int(opts.field ? `${opts.field} 必须是整数` : '必须是整数')
      .nullable()
      .refine(
        v => v === null || (
          (opts.min === undefined || v >= opts.min) &&
          (opts.max === undefined || v <= opts.max)
        ),
        opts.field
          ? `${opts.field} 超出允许范围${opts.min !== undefined ? ` [${opts.min}` : ''}${opts.max !== undefined ? `, ${opts.max}]` : ']'}`
          : '超出允许范围'
      )
  )
}
