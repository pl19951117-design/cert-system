'use client'

import { useId, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { personnelApi } from '@/lib/personnel/api'
import { CERT_FIELDS_ADD, PERSON_FIELDS } from './form-config'

export type AddPersonModalProps = {
  onClose: () => void
  onSaved: () => void
}

export function AddPersonModal({ onClose, onSaved }: AddPersonModalProps) {
  const [form, setForm]   = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr]     = useState('')
  const baseId = useId()
  const errId  = `${baseId}-err`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim()) { setErr('姓名不能为空'); return }
    setSaving(true); setErr('')
    const res = await personnelApi.create(form)
    if (!res.ok) { setSaving(false); setErr('添加失败，请重试'); return }
    const person = await res.json() as { id: number }
    if (form.certType?.trim()) {
      try {
        await personnelApi.createCert(person.id, {
          certType: form.certType, certNo: form.certNo,
          issueDate: form.issueDate, expiryDate: form.expiryDate, issuer: form.issuer,
        })
      } catch { /* toast 已弹 */ }
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal onClose={onClose} title="添加人员" size="lg">
      <form onSubmit={submit} className="p-6" noValidate>
        <div className="section-label !mb-3">
          <div className="section-label-bar" />
          <span className="section-label-text">基本信息</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {PERSON_FIELDS.map(f => {
            const id = `${baseId}-${f.key}`
            const isName = f.key === 'name'
            return (
              <div key={f.key} className={f.col === 2 ? 'sm:col-span-2' : ''}>
                <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">
                  {f.label}
                  {f.required && <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>}
                  {f.required && <span className="sr-only">必填</span>}
                </label>
                <input
                  id={id}
                  value={form[f.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder || ''}
                  required={f.required}
                  aria-required={f.required || undefined}
                  aria-invalid={isName && !!err || undefined}
                  aria-describedby={isName && err ? errId : undefined}
                  className="input-refined"
                />
              </div>
            )
          })}
        </div>
        <div className="section-label !mb-3">
          <div className="section-label-bar" />
          <span className="section-label-text">首张证件（可选，留空则跳过）</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-4 bg-slate-50/80 rounded-xl border border-slate-100">
          {CERT_FIELDS_ADD.map(f => {
            const id = `${baseId}-${f.key}`
            return (
              <div key={f.key}>
                <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                <input
                  id={id}
                  type={f.type || 'text'}
                  value={form[f.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="input-refined !bg-white"
                />
              </div>
            )
          })}
        </div>
        {err && (
          <div
            id={errId}
            role="alert"
            className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3"
          >
            {err}
          </div>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="btn-primary flex-1 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Spinner size={14} label="提交中" />}
            {saving ? '添加中…' : '确认添加'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
