// HTTP 响应原语 — 所有 API handler 共用
// 设计要点：
//   1) HttpError 是受控错误：状态码 + 稳定 code + 用户可读 message + 可选 details
//   2) 任何 throw HttpError 都会被 route() wrapper 翻译成 NextResponse
//   3) 非 HttpError（系统错误 / Prisma / Zod）也由 wrapper 兜底，避免 500 + stack 泄露

import { NextResponse } from 'next/server'

/** 统一的错误响应负载结构 */
export type ApiErrorBody = {
  error: string             // 用户可读消息
  code: string              // 稳定字符串码，前端可据此分支
  details?: unknown         // 字段级错误详情（如 zod 的 fieldErrors）
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const httpErrors = {
  badRequest:     (msg: string, details?: unknown) => new HttpError(400, 'bad_request', msg, details),
  unauthorized:   ()                               => new HttpError(401, 'unauthorized', '未登录或登录已过期'),
  forbidden:      (msg = '权限不足')               => new HttpError(403, 'forbidden', msg),
  notFound:       (msg = '资源不存在')             => new HttpError(404, 'not_found', msg),
  conflict:       (msg: string)                    => new HttpError(409, 'conflict', msg),
  unprocessable:  (msg: string, details?: unknown) => new HttpError(422, 'unprocessable_entity', msg, details),
  internal:       (msg = '服务器内部错误')         => new HttpError(500, 'internal', msg),
}

/** 200 OK with JSON body */
export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

/** 204 No Content — 适合 DELETE 等无返回体场景 */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

/** 201 Created with JSON body */
export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 })
}

/** 把任意错误翻译为标准 JSON 响应 */
export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    const body: ApiErrorBody = { error: e.message, code: e.code }
    if (e.details !== undefined) body.details = e.details
    return NextResponse.json(body, { status: e.status })
  }
  // Zod 错误（动态 import 避免循环依赖）
  if (e && typeof e === 'object' && (e as { name?: string }).name === 'ZodError') {
    const ze = e as { flatten?: () => unknown; issues?: unknown }
    const details = typeof ze.flatten === 'function' ? ze.flatten() : ze.issues
    return NextResponse.json({ error: '请求数据校验失败', code: 'validation_error', details }, { status: 422 })
  }
  // Prisma 已知错误码
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code: string }).code
    if (code === 'P2025') return NextResponse.json({ error: '资源不存在', code: 'not_found' }, { status: 404 })
    if (code === 'P2002') return NextResponse.json({ error: '资源已存在或冲突', code: 'conflict' }, { status: 409 })
    if (code === 'P2003') return NextResponse.json({ error: '外键约束失败', code: 'conflict' }, { status: 409 })
  }
  // 兜底：记录 + 通用 500
  console.error('[api] Unhandled error:', e)
  return NextResponse.json({ error: '服务器内部错误', code: 'internal' }, { status: 500 })
}
