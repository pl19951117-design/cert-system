import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

// JWT 签名密钥解析（**惰性**：只在真正签发/校验令牌时解析，绝不在模块加载时执行）：
//   1) 环境变量 JWT_SECRET 优先（桌面版由 Electron 主进程注入每台机器独立的随机密钥；
//      服务器版由部署脚本/compose 注入）——不同安装/部署互不通用，杜绝伪造登录。
//   2) 非生产环境允许一个开发兜底密钥，方便本地 `next dev`。
//   3) 生产环境却没有配置密钥 = 严重误配，抛错（fail-closed），而不是退回到人尽皆知的固定值。
//
// 为什么惰性：`next build` 会以 production 模式导入所有路由模块来收集页面数据，
// 若在模块顶层就解析并抛错，会导致整个构建失败。放到函数里则只在运行时求值。
let _secret: Uint8Array | null = null
function getSecret(): Uint8Array {
  if (_secret) return _secret
  const fromEnv = process.env.JWT_SECRET
  if (fromEnv && fromEnv.length >= 16) { _secret = new TextEncoder().encode(fromEnv); return _secret }
  if (process.env.NODE_ENV !== 'production') {
    _secret = new TextEncoder().encode('cert-system-dev-secret-DO-NOT-USE-IN-PROD')
    return _secret
  }
  throw new Error('JWT_SECRET 未设置：生产环境必须提供一段足够长的随机密钥')
}
const COOKIE = 'cert-session'

export type SessionUser = {
  userId: number
  username: string
  role: string
  displayName: string
}

export async function signToken(payload: SessionUser) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionUser
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(COOKIE)?.value
  if (!token) return null
  return verifyToken(token)
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 260000, 32, 'sha256').toString('hex')
  return `pbkdf2$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored.startsWith('pbkdf2$')) return false
  const parts = stored.split('$')
  if (parts.length !== 3) return false
  const [, salt, hash] = parts
  try {
    const computed = crypto.pbkdf2Sync(password, salt, 260000, 32, 'sha256').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash, 'hex'))
  } catch {
    return false
  }
}

export function decodeAccountCookie(raw: string | undefined): string {
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function getAccountId(req: NextRequest): Promise<string> {
  const { prisma } = await import('@/lib/prisma')
  const fromCookie = decodeAccountCookie(req.cookies.get('cert-account')?.value)
  if (fromCookie) {
    const exists = await prisma.account.findUnique({ where: { id: fromCookie }, select: { id: true } })
    if (exists) return fromCookie
  }
  const first = await prisma.account.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } })
  return first?.id ?? ''
}

const IS_ELECTRON = process.env.ELECTRON === '1'

export const COOKIE_CONFIG = {
  name: COOKIE,
  httpOnly: true,
  // In the Electron build the app is served over http://127.0.0.1, so a
  // `secure` cookie would never be stored and login would silently fail.
  secure: process.env.NODE_ENV === 'production' && !IS_ELECTRON,
  sameSite: 'lax' as const,
  // Desktop (Electron) build: omit maxAge so this is a *session* cookie that
  // the app drops on quit — every launch then requires a fresh login.
  // Web build keeps a 24h persistent cookie.
  ...(IS_ELECTRON ? {} : { maxAge: 60 * 60 * 24 }),
  path: '/',
}
