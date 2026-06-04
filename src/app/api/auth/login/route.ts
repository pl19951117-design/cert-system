import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, signToken, COOKIE_CONFIG, hashPassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 })
    }

    let user = await prisma.user.findUnique({ where: { username } })

    // 首次启动：自动创建默认管理员
    if (!user && username === 'admin') {
      user = await prisma.user.create({
        data: {
          username: 'admin',
          passwordHash: hashPassword('admin123'),
          displayName: '系统管理员',
          role: 'super_admin',
        },
      })
    }

    if (!user || !user.isActive) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      return NextResponse.json({ error: '账号已锁定，请15分钟后再试' }, { status: 401 })
    }

    if (!verifyPassword(password, user.passwordHash)) {
      const attempts = user.failedAttempts + 1
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: attempts,
          lockoutUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      })
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockoutUntil: null },
    })

    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    })

    const res = NextResponse.json({ ok: true })
    res.cookies.set({ ...COOKIE_CONFIG, value: token })
    return res
  } catch (e) {
    console.error('[login] 失败:', e)
    return NextResponse.json({ error: '系统繁忙，请稍后重试' }, { status: 503 })
  }
}
