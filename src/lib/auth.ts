import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'cert-system-dev-secret-change-in-prod'
)
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
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
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
