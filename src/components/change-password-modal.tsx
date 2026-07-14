'use client'

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/toast'

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (newPassword.length < 8) { setErr('新密码至少 8 个字符'); return }
    if (newPassword !== confirm) { setErr('两次输入的新密码不一致'); return }
    setSaving(true)
    const res = await fetch('/api/auth/change-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setErr(data.error || '修改失败'); return }
    toast('密码已修改', 'success')
    onClose()
  }

  return (
    <Modal onClose={onClose} title="修改密码" size="sm">
      <form onSubmit={submit} className="p-6 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">当前密码</label>
          <input type="password" value={oldPassword} onChange={e => setOld(e.target.value)}
            className="input-refined" autoComplete="current-password" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">新密码</label>
          <input type="password" value={newPassword} onChange={e => setNew(e.target.value)}
            placeholder="至少 8 个字符" className="input-refined" autoComplete="new-password" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">确认新密码</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            className="input-refined" autoComplete="new-password" />
        </div>
        {err && <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {saving && <Spinner size={14} label="提交中" />}
            {saving ? '提交中…' : '确认修改'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
