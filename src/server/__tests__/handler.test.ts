import { describe, expect, it } from 'vitest'
import { ROLES, SUPERADMIN_ONLY, WRITER_ROLES } from '../handler'

// 回归防护：写操作的角色放行清单必须与系统实际使用的角色字符串一致。
//
// 背景：某次重构把放行清单写成了 'superadmin'（无下划线）+ 'admin'，
// 但登录建号实际写入的是 'super_admin'（带下划线，见 api/auth/login/route.ts），
// 导致超级管理员每次写操作都拿到 403「权限不足」。
// 这组断言把「实际角色字符串」钉死，防止再次因拼写漂移而静默回归。

const ACTUAL_ROLES = {
  // schema 默认值
  viewer: 'viewer',
  // 侧边栏展示分支 / 可被指派
  editor: 'editor',
  // 登录首次自动建号写入的角色（注意下划线）
  superAdmin: 'super_admin',
} as const

describe('角色常量', () => {
  it('ROLES 与系统实际角色字符串一致', () => {
    expect(ROLES.VIEWER).toBe(ACTUAL_ROLES.viewer)
    expect(ROLES.EDITOR).toBe(ACTUAL_ROLES.editor)
    expect(ROLES.SUPER_ADMIN).toBe(ACTUAL_ROLES.superAdmin)
  })
})

describe('WRITER_ROLES（写操作放行清单）', () => {
  it('放行超级管理员与编辑员', () => {
    expect(WRITER_ROLES).toContain(ACTUAL_ROLES.superAdmin)
    expect(WRITER_ROLES).toContain(ACTUAL_ROLES.editor)
  })

  it('拒绝查看员', () => {
    expect(WRITER_ROLES).not.toContain(ACTUAL_ROLES.viewer)
  })
})

describe('SUPERADMIN_ONLY', () => {
  it('仅包含超级管理员', () => {
    expect(SUPERADMIN_ONLY).toEqual([ACTUAL_ROLES.superAdmin])
  })
})
