'use client'

import { useEffect, useState } from 'react'
import { apiFetch, getJSON } from '@/lib/api'
import { toast } from '@/components/toast'
import { Modal } from '@/components/Modal'

type User = {
  id: number
  username: string
  displayName: string
  role: string
  isActive: boolean
  createdAt: string
  lockoutUntil: string | null
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  editor: '编辑员',
  viewer: '查看员',
}
const ROLE_BADGE: Record<string, string> = {
  super_admin: 'badge-amber',
  editor: 'badge-blue',
  viewer: 'badge-slate',
}
const ROLE_OPTIONS = [
  { value: 'viewer', label: '查看员（只读）' },
  { value: 'editor', label: '编辑员（可增删改）' },
  { value: 'super_admin', label: '超级管理员（含系统管理）' },
]

export function UserManagement({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ username: '', displayName: '', password: '', role: 'editor' })
  const [addErr, setAddErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [resetFor, setResetFor] = useState<User | null>(null)
  const [newPwd, setNewPwd] = useState('')
  const [confirmDel, setConfirmDel] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try { setUsers(await getJSON<User[]>('/api/admin/users')) } catch { setUsers([]) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setAddErr('')
    if (form.username.trim().length < 3) { setAddErr('用户名至少 3 个字符'); return }
    if (form.password.length < 8) { setAddErr('密码至少 8 个字符'); return }
    setSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setAddErr(data.error || '创建失败'); return }
    toast('已创建用户', 'success')
    setShowAdd(false); setForm({ username: '', displayName: '', password: '', role: 'editor' })
    load()
  }

  async function updateUser(u: User, patch: Record<string, unknown>, okMsg: string) {
    try {
      await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      toast(okMsg, 'success')
      load()
    } catch { /* toast 已弹 */ }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetFor) return
    if (newPwd.length < 8) { toast('新密码至少 8 个字符', 'error'); return }
    setSaving(true)
    try {
      await apiFetch(`/api/admin/users/${resetFor.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPwd }),
      })
      toast(`已重置 ${resetFor.username} 的密码`, 'success')
      setResetFor(null); setNewPwd('')
    } catch { /* toast 已弹 */ }
    setSaving(false)
  }

  async function deleteUser(id: number) {
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      toast('已删除用户', 'success')
      setConfirmDel(null); load()
    } catch { /* toast 已弹 */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">系统用户</div>
          <p className="text-xs text-slate-400 mt-1">为每位同事创建独立账号并分配角色；密码请让本人首次登录后自行修改。</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddErr('') }} className="btn-primary !py-2 !px-4 !text-sm">+ 新建用户</button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-10 text-center">加载中…</div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <table className="w-full table-premium">
            <thead>
              <tr>{['用户名', '显示名称', '角色', '状态', '创建时间', '操作'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === currentUserId
                const locked = u.lockoutUntil && new Date(u.lockoutUntil) > new Date()
                return (
                  <tr key={u.id} className={!u.isActive ? 'opacity-50' : ''}>
                    <td className="font-mono text-xs font-semibold text-slate-700">
                      {u.username}{isSelf && <span className="ml-1.5 text-[10px] text-amber-500">（我）</span>}
                    </td>
                    <td className="text-slate-700">{u.displayName}</td>
                    <td>
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={e => updateUser(u, { role: e.target.value }, '已更新角色')}
                        className={`text-xs rounded-md border px-2 py-1 bg-white ${isSelf ? 'text-slate-400 border-slate-100 cursor-not-allowed' : 'text-slate-700 border-slate-200'}`}
                        title={isSelf ? '不能修改自己的角色' : ''}
                      >
                        {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{ROLE_LABEL[o.value]}</option>)}
                      </select>
                    </td>
                    <td>
                      {locked ? (
                        <span className="badge badge-orange">已锁定</span>
                      ) : u.isActive ? (
                        <span className="badge badge-green">正常</span>
                      ) : (
                        <span className="badge badge-slate">已停用</span>
                      )}
                    </td>
                    <td className="text-xs text-slate-400">{u.createdAt.slice(0, 10)}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <button onClick={() => { setResetFor(u); setNewPwd('') }} className="text-xs text-amber-500 hover:text-amber-600 font-medium">重置密码</button>
                        {!isSelf && (
                          u.isActive
                            ? <button onClick={() => updateUser(u, { isActive: false }, '已停用')} className="text-xs text-slate-400 hover:text-orange-500">停用</button>
                            : <button onClick={() => updateUser(u, { isActive: true }, '已启用')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">启用</button>
                        )}
                        {!isSelf && (
                          confirmDel === u.id ? (
                            <span className="flex items-center gap-2">
                              <button onClick={() => deleteUser(u.id)} className="text-xs text-red-500 font-semibold">确认</button>
                              <button onClick={() => setConfirmDel(null)} className="text-xs text-slate-400">取消</button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmDel(u.id)} className="text-xs text-slate-400 hover:text-red-500">删除</button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 新建用户 */}
      {showAdd && (
        <Modal onClose={() => setShowAdd(false)} title="新建用户" size="md">
          <form onSubmit={createUser} className="p-6 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">用户名 <span className="text-red-400">*</span></label>
              <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                placeholder="登录用（字母/数字/下划线，至少 3 位）" className="input-refined" autoComplete="off" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">显示名称 <span className="text-red-400">*</span></label>
              <input value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))}
                placeholder="如：张三" className="input-refined" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">初始密码 <span className="text-red-400">*</span></label>
              <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="至少 8 个字符" className="input-refined" autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">角色</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="input-refined">
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {addErr && <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{addErr}</div>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1">取消</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? '创建中…' : '创建用户'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* 重置密码 */}
      {resetFor && (
        <Modal onClose={() => setResetFor(null)} title={`重置密码 · ${resetFor.username}`} size="sm">
          <form onSubmit={resetPassword} className="p-6 space-y-3">
            <p className="text-xs text-slate-500">为 <span className="font-semibold text-slate-700">{resetFor.displayName}</span> 设置一个新密码，请线下告知本人并让其登录后自行修改。</p>
            <input value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="新密码（至少 8 个字符）"
              className="input-refined" autoComplete="new-password" />
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setResetFor(null)} className="btn-secondary flex-1">取消</button>
              <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? '重置中…' : '确认重置'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
