import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/auth'
import { ok, noContent, httpErrors } from '@/server/http'
import { route, SUPERADMIN_ONLY, ROLES } from '@/server/handler'
import { parseId, parseJsonBody } from '@/server/validation'
import { logOp } from '@/lib/audit'
import { ROLE_VALUES } from '../route'

type Params = { id: string }

const userUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(50).optional(),
  role: z.enum(ROLE_VALUES).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8, '密码至少 8 个字符').max(100).optional(),   // 重置密码
}).refine(d => Object.keys(d).length > 0, { message: '没有要更新的字段' })

/** 当前是否只剩这一个「有效的超级管理员」（用于防止把自己锁死在门外） */
async function isLastActiveSuperAdmin(userId: number): Promise<boolean> {
  const count = await prisma.user.count({ where: { role: ROLES.SUPER_ADMIN, isActive: true } })
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } })
  return count <= 1 && target?.role === ROLES.SUPER_ADMIN && target?.isActive === true
}

export const PUT = route<Params>({ roles: SUPERADMIN_ONLY, requireAccount: false }, async ({ req, params, session }) => {
  const id = parseId(params.id)
  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) throw httpErrors.notFound('用户不存在')

  const input = await parseJsonBody(req, userUpdateSchema)
  const isSelf = id === session.userId
  const willDisable = input.isActive === false
  const willDemote = input.role !== undefined && input.role !== ROLES.SUPER_ADMIN && target.role === ROLES.SUPER_ADMIN

  // 防自锁：不能停用 / 降级当前登录的自己
  if (isSelf && (willDisable || willDemote)) {
    throw httpErrors.unprocessable('不能停用或降级当前登录的账号')
  }
  // 防锁死：不能停用 / 降级最后一个超级管理员
  if ((willDisable || willDemote) && await isLastActiveSuperAdmin(id)) {
    throw httpErrors.unprocessable('这是最后一个超级管理员，不能停用或降级')
  }

  const data: Record<string, unknown> = {}
  if (input.displayName !== undefined) data.displayName = input.displayName
  if (input.role !== undefined) data.role = input.role
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.password !== undefined) data.passwordHash = hashPassword(input.password)
  // 重置密码 / 重新启用时，一并解除失败锁定
  if (input.password !== undefined || input.isActive === true) {
    data.failedAttempts = 0
    data.lockoutUntil = null
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true, lockoutUntil: true },
  })

  const actions = [
    input.password !== undefined ? '重置密码' : null,
    input.role !== undefined ? `角色→${input.role}` : null,
    input.isActive !== undefined ? (input.isActive ? '启用' : '停用') : null,
  ].filter(Boolean).join('、')
  await logOp(session, '修改用户', `${target.username}${actions ? '：' + actions : ''}`)
  return ok(updated)
})

export const DELETE = route<Params>({ roles: SUPERADMIN_ONLY, requireAccount: false }, async ({ params, session }) => {
  const id = parseId(params.id)
  const target = await prisma.user.findUnique({ where: { id }, select: { username: true } })
  if (!target) throw httpErrors.notFound('用户不存在')
  if (id === session.userId) throw httpErrors.unprocessable('不能删除当前登录的账号')
  if (await isLastActiveSuperAdmin(id)) throw httpErrors.unprocessable('这是最后一个超级管理员，不能删除')

  await prisma.user.delete({ where: { id } })
  await logOp(session, '删除用户', target.username)
  return noContent()
})
