// 路由 wrapper — 把 auth + 角色检查 + 错误翻译 + 上下文注入 集中处理
//
// 之前每个 handler 重复 5+ 行：
//   const session = await getSessionFromRequest(req)
//   if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
//   if (session.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 })
//   const { id } = await params
//   try { ... } catch { 500 }
//
// 现在统一为：
//   export const PUT = route({ roles: WRITER_ROLES }, async ({ params, session, accountId }) => {
//     const data = await parseJsonBody(req, schema)
//     return ok(await service.update({ id: parseId(params.id), accountId, data, session }))
//   })

import type { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId, type SessionUser } from '@/lib/auth'
import { httpErrors, toErrorResponse } from './http'

/**
 * 角色常量集中维护，避免散落的魔法字符串。
 * 系统实际只有三种角色（见 schema 默认值 + 登录建号 + 侧边栏展示）：
 *   viewer（查看员，schema 默认）/ editor（编辑员）/ super_admin（超级管理员）
 * 注意：超管的存储值是带下划线的 'super_admin'，不要写成 'superadmin'。
 */
export const ROLES = {
  VIEWER:      'viewer',
  EDITOR:      'editor',
  SUPER_ADMIN: 'super_admin',
} as const

/** 写操作放行的角色（任何非 viewer：编辑员 + 超级管理员） */
export const WRITER_ROLES = [ROLES.EDITOR, ROLES.SUPER_ADMIN]
/** 只有最高权限可调用 */
export const SUPERADMIN_ONLY = [ROLES.SUPER_ADMIN]

type Auth = 'required' | 'optional' | 'none'

type Ctx<P> = {
  req:        NextRequest
  params:     P
  session:    SessionUser    // 当 auth='required' 时一定有
  accountId:  string         // 当 auth='required' 时已注入
}

type CtxOptional<P> = Omit<Ctx<P>, 'session' | 'accountId'> & {
  session:   SessionUser | null
  accountId: string | null
}

type Handler<P> = (ctx: Ctx<P>) => Promise<NextResponse> | NextResponse
type OptionalHandler<P> = (ctx: CtxOptional<P>) => Promise<NextResponse> | NextResponse

export type RouteOptions = {
  auth?: Auth                  // 默认 required
  roles?: readonly string[]    // 默认不限角色（任何登录用户）
  /** 是否需要 accountId 上下文，默认 true */
  requireAccount?: boolean
}

export function route<P = Record<string, never>>(
  opts: RouteOptions,
  handler: Handler<P>,
): (req: NextRequest, ctx: { params: Promise<P> }) => Promise<NextResponse>

export function route<P = Record<string, never>>(
  opts: RouteOptions & { auth: 'optional' },
  handler: OptionalHandler<P>,
): (req: NextRequest, ctx: { params: Promise<P> }) => Promise<NextResponse>

export function route<P = Record<string, never>>(
  opts: RouteOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: any,
) {
  const auth = opts.auth ?? 'required'
  const requireAccount = opts.requireAccount ?? true

  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      let session: SessionUser | null = null
      let accountId: string | null = null

      if (auth !== 'none') {
        session = await getSessionFromRequest(req)
        if (auth === 'required' && !session) throw httpErrors.unauthorized()
        if (session && opts.roles && !opts.roles.includes(session.role)) {
          throw httpErrors.forbidden('权限不足')
        }
        if (session && requireAccount) {
          accountId = await getAccountId(req)
          if (!accountId) throw httpErrors.badRequest('未选择账套')
        }
      }

      const params = (await ctx.params) as P
      return await handler({ req, params, session, accountId })
    } catch (e) {
      return toErrorResponse(e)
    }
  }
}
