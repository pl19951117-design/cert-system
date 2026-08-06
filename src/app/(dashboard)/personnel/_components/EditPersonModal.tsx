'use client'

import { useId, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { personnelApi } from '@/lib/personnel/api'
import type { Person } from '@/lib/personnel/types'
import { CERT_FIELDS_ADD, PERSON_FIELDS } from './form-config'

export type EditPersonModalProps = {
  person: Person
  onClose: () => void
  onSaved: () => void
  /** 已有的建制/负责人，用于自动补全 —— 选中已有值才能正确归入同一组 */
  options?: { orgs: string[]; managers: string[] }
}

export function EditPersonModal({ person, onClose, onSaved, options }: EditPersonModalProps) {
  const [form, setForm] = useState<Record<string, string>>(() => ({
    name: person.name,
    orgName: person.orgName || '',
    manager: person.manager || '',
    idCard: person.idCard || '',
    education: person.education || '',
    socialSecurity: person.socialSecurity || '',
    sortOrder: person.sortOrder?.toString() || '',
  }))
  const [certs, setCerts] = useState<Record<string, string>[]>(() =>
    person.certificates.map(c => ({
      id: String(c.id),
      certType: c.certType || '',
      certNo: c.certNo || '',
      issueDate: c.issueDate || '',
      expiryDate: c.expiryDate || '',
      issuer: c.issuer || '',
    }))
  )
  const [saving, setSaving] = useState(false)
  const baseId = useId()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await personnelApi.update(person.id, form)
      for (const c of certs) {
        if (c.id) await personnelApi.updateCert(person.id, c.id, c)
      }
      onSaved()
      onClose()
    } catch {
      // apiFetch 已弹错误 toast；保持模态开启让用户修正
    }
    setSaving(false)
  }

  return (
    <Modal onClose={onClose} title="编辑人员信息" size="lg">
      <form onSubmit={submit} className="p-6">
        <div className="section-label !mb-3">
          <div className="section-label-bar" />
          <span className="section-label-text">基本信息</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {PERSON_FIELDS.map(f => {
            const id = `${baseId}-${f.key}`
            const listId = f.key === 'orgName' ? `${baseId}-orgs`
                         : f.key === 'manager' ? `${baseId}-mgrs` : undefined
            const listItems = f.key === 'orgName' ? options?.orgs
                            : f.key === 'manager' ? options?.managers : undefined
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
                  list={listItems?.length ? listId : undefined}
                  className="input-refined"
                />
                {!!listItems?.length && (
                  <datalist id={listId}>
                    {listItems.map(v => <option key={v} value={v} />)}
                  </datalist>
                )}
              </div>
            )
          })}
        </div>

        {certs.length > 0 && (
          <>
            <div className="section-label !mb-3">
              <div className="section-label-bar" />
              <span className="section-label-text">证件信息</span>
            </div>
            {certs.map((c, ci) => (
              <fieldset key={c.id} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 p-4 bg-slate-50/80 rounded-xl border border-slate-100">
                <legend className="px-1 text-xs font-semibold text-slate-500">证件 {ci + 1}</legend>
                {CERT_FIELDS_ADD.map(f => {
                  const id = `${baseId}-c${ci}-${f.key}`
                  return (
                    <div key={f.key}>
                      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                      <input
                        id={id}
                        type={f.type || 'text'}
                        value={c[f.key] || ''}
                        onChange={e => setCerts(prev => prev.map((item, idx) => idx === ci ? { ...item, [f.key]: e.target.value } : item))}
                        className="input-refined !bg-white"
                      />
                    </div>
                  )
                })}
              </fieldset>
            ))}
          </>
        )}

        <div className="flex gap-3 mt-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="btn-primary flex-1 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Spinner size={14} label="保存中" />}
            {saving ? '保存中…' : '保存修改'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
