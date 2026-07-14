import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { ok, httpErrors } from '@/server/http'
import { route } from '@/server/handler'
import { parseJsonBody } from '@/server/validation'
import { logOp } from '@/lib/audit'

const schema = z.object({
  oldPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(8, '新密码至少 8 个字符').max(100, '新密码过长'),
})

// 任意登录用户自助修改自己的密码（不需要账套上下文）
export const POST = route({ requireAccount: false }, async ({ req, session }) => {
  const input = await parseJsonBody(req, schema)
  const user = await prisma.user.findUnique({ where: { id: session.userId } })
  if (!user) throw httpErrors.notFound('用户不存在')
  if (!verifyPassword(input.oldPassword, user.passwordHash)) {
    throw httpErrors.unprocessable('当前密码不正确')
  }
  if (verifyPassword(input.newPassword, user.passwordHash)) {
    throw httpErrors.unprocessable('新密码不能与当前密码相同')
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(input.newPassword), failedAttempts: 0, lockoutUntil: null },
  })
  await logOp(session, '修改密码', user.username)
  return ok({ ok: true })
})
