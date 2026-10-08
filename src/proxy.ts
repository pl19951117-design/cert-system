import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  const session = await getSessionFromRequest(req)
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  // brand/：单位 logo 等公开静态资源，登录页（未登录）也要能加载
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
}
