import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { ok, created, httpErrors } from '@/server/http'
import { route, SUPERADMIN_ONLY, ROLES } from '@/server/handler'
import { parseJsonBody } from '@/server/validation'
import { logOp } from '@/lib/audit'

export const ROLE_VALUES = [ROLES.VIEWER, ROLES.EDITOR, ROLES.SUPER_ADMIN] as const

export const userCreateSchema = z.object({
  username: z.string().trim().min(3, '用户名至少 3 个字符').max(50, '用户名过长')
    .regex(/^[a-zA-Z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点、连字符'),
  displayName: z.string().trim().min(1, '显示名称不能为空').max(50, '显示名称过长'),
  password: z.string().min(8, '密码至少 8 个字符').max(100, '密码过长'),
  role: z.enum(ROLE_VALUES, { message: '角色不合法' }),
})

const SAFE_SELECT = {
  id: true, username: true, displayName: true, role: true,
  isActive: true, createdAt: true, lockoutUntil: true,
} as const

export const GET = route({ roles: SUPERADMIN_ONLY, requireAccount: false }, async () => {
  const users = await prisma.user.findMany({ select: SAFE_SELECT, orderBy: { id: 'asc' } })
  return ok(users)
})

export const POST = route({ roles: SUPERADMIN_ONLY, requireAccount: false }, async ({ req, session }) => {
  const input = await parseJsonBody(req, userCreateSchema)
  const exists = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true } })
  if (exists) throw httpErrors.conflict('用户名已存在')

  const user = await prisma.user.create({
    data: {
      username: input.username,
      displayName: input.displayName,
      passwordHash: hashPassword(input.password),
      role: input.role,
    },
    select: SAFE_SELECT,
  })
  await logOp(session, '新增用户', `${user.username}(${user.role})`)
  return created(user)
})
