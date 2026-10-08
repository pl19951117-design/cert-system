'use client'

// 「准入人员库」弹窗：把考试通过的人员登记进人员库，可同时生成证件。
// - 预填报名记录里的姓名 / 身份证 / 建制 / 负责人 / 证件信息
// - 人员库里已有同身份证号或同名的人时给出提示，可改为「关联到此人」，避免重复建档

import { useId, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { toast } from '@/components/toast'

export type AdmitExam = {
  id: number
  name: string | null
  idCard: string | null
  orgName: string | null
  manager: string | null
  certType: string | null
  regDate: string | null
  isPassed: string
  certNo: string | null
  issueDate: string | null
  expiryDate: string | null
  issuer: string | null
}

export type AdmitPerson = {
  id: number
  name: string
  idCard: string | null
  orgName: string | null
  manager: string | null
  certificates: { id: number; certType: string | null; certNo: string | null; expiryDate: string | null }[]
}

type Props = {
  exam: AdmitExam
  people: AdmitPerson[]
  onClose: () => void
  onDone: () => void
}

const PERSON_INPUTS = [
  { key: 'name', label: '姓名', required: true },
  { key: 'idCard', label: '身份证号' },
  { key: 'orgName', label: '归属建制' },
  { key: 'manager', label: '负责人' },
  { key: 'education', label: '学历' },
  { key: 'socialSecurity', label: '社保情况' },
] as const

const CERT_INPUTS = [
  { key: 'certType', label: '证件类别' },
  { key: 'certNo', label: '证件编号' },
  { key: 'issueDate', label: '发证日期', type: 'date' },
  { key: 'expiryDate', label: '到期日期', type: 'date' },
  { key: 'issuer', label: '发证机构' },
] as const

function uniq(values: (string | null)[]): string[] {
  return Array.from(new Set(values.map(v => v?.trim()).filter((v): v is string => !!v)))
}

export function AdmitModal({ exam, people, onClose, onDone }: Props) {
  const baseId = useId()
  const [person, setPerson] = useState<Record<string, string>>({
    name: exam.name || '', idCard: exam.idCard || '', orgName: exam.orgName || '', manager: exam.manager || '',
    education: '', socialSecurity: '',
  })
  const [cert, setCert] = useState<Record<string, string>>({
    certType: exam.certType || '', certNo: exam.certNo || '', issueDate: exam.issueDate || '',
    expiryDate: exam.expiryDate || '', issuer: exam.issuer || '',
  })
  // 已取证或已有证件信息时默认一起生成证件
  const [withCert, setWithCert] = useState(
    exam.isPassed === '已取证' || !!(exam.certNo || exam.expiryDate),
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  // 服务端发现身份证号重复时返回的已有人员
  const [serverDup, setServerDup] = useState<AdmitPerson | null>(null)

  const orgs = useMemo(() => uniq(people.map(p => p.orgName)), [people])
  const managers = useMemo(() => uniq(people.map(p => p.manager)), [people])

  // 前端预判重复：身份证号完全一致（强提示）/ 同名（弱提示）
  const idCard = person.idCard.trim()
  const name = person.name.trim()
  const idMatch = idCard ? people.find(p => (p.idCard || '').trim() === idCard) ?? null : null
  const dupPerson = serverDup ?? idMatch
  const nameMatches = dupPerson ? [] : people.filter(p => p.name.trim() === name && name)

  function certPayload() {
    return withCert ? cert : null
  }

  async function post(body: unknown): Promise<boolean> {
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/exams/${exam.id}/admit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) return true
      const data = await res.json().catch(() => ({})) as { error?: string; code?: string; details?: { existing?: { id: number } } }
      if (data.code === 'duplicate_id_card' && data.details?.existing) {
        const existing = people.find(p => p.id === data.details!.existing!.id)
        if (existing) setServerDup(existing)
      }
      setErr(data.error || `准入失败（${res.status}）`)
      return false
    } catch {
      setErr('网络请求失败，请重试')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function admitNew(e: React.FormEvent) {
    e.preventDefault()
    if (!name) { setErr('姓名不能为空'); return }
    if (withCert && !cert.certType.trim()) { setErr('生成证件需要填写证件类别'); return }
    const ok = await post({ person, cert: certPayload() })
    if (ok) { toast(`已准入人员库：${name}`, 'success'); onDone(); onClose() }
  }

  async function linkTo(p: AdmitPerson) {
    // 此人已有同类证件时不再重复生成（续证请在报名记录里选「续证目标证件」）
    const genCert = withCert && !sameTypeCert(p)
    if (genCert && !cert.certType.trim()) { setErr('生成证件需要填写证件类别'); return }
    const ok = await post({ linkPersonId: p.id, cert: genCert ? cert : null })
    if (ok) { toast(`已关联到人员库中的「${p.name}」`, 'success'); onDone(); onClose() }
  }

  /** 关联对象已有同类证件时提醒，避免重复生成 */
  function sameTypeCert(p: AdmitPerson) {
    const t = cert.certType.trim()
    return t ? p.certificates.find(c => (c.certType || '').trim() === t) : undefined
  }

  /** 重复/同名人员卡片（普通渲染函数，不作为组件，避免每次渲染重建） */
  function dupCard(p: AdmitPerson, strong: boolean) {
    const same = sameTypeCert(p)
    return (
      <div key={p.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${strong ? 'bg-white border border-amber-200' : 'bg-white/70 border border-slate-200'}`}>
        <div className="min-w-0 flex-1 text-xs">
          <div className="font-semibold text-slate-800">
            {p.name}<span className="ml-2 font-normal text-slate-500">{p.orgName || '未填写建制'}{p.manager ? ` · ${p.manager}` : ''}</span>
          </div>
          <div className="text-slate-400 mt-0.5 leading-relaxed">
            {p.idCard || '未填身份证'} · {p.certificates.length} 本证件
            {same && <span className="text-amber-600">（已有 {same.certType} 证，到期 {same.expiryDate || '—'}，关联后不会重复生成）</span>}
          </div>
        </div>
        <button type="button" disabled={saving} onClick={() => linkTo(p)}
          className="flex-shrink-0 text-xs font-semibold text-navy-700 hover:text-navy-900 disabled:opacity-50 whitespace-nowrap">
          就是此人，关联 →
        </button>
      </div>
    )
  }

  return (
    <Modal onClose={onClose} title={`准入人员库 · ${exam.name || '未填写姓名'}`} size="lg">
      <form onSubmit={admitNew} className="p-6" noValidate>
        <p className="text-xs text-slate-500 -mt-1 mb-5">
          {exam.certType || '未分类'} 类考试 <span className={`badge align-middle ${exam.isPassed === '已取证' ? 'badge-navy' : 'badge-green'}`}>{exam.isPassed}</span>
          {exam.regDate && <span className="ml-2">报名日期 {exam.regDate}</span>}
          <span className="ml-2">· 入库后按建制、负责人自动排到对应位置，并记入变动流水</span>
        </p>

        {/* 重复提示 */}
        {dupPerson ? (
          <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
            <div className="text-xs font-bold text-amber-800 mb-2">人员库中已有这个身份证号，不能重复建档</div>
            {dupCard(dupPerson, true)}
          </div>
        ) : nameMatches.length > 0 && (
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-xs font-semibold text-slate-600 mb-2">人员库中有同名人员，如果是同一个人，请直接关联：</div>
            <div className="space-y-2">
              {nameMatches.slice(0, 3).map(p => dupCard(p, false))}
            </div>
          </div>
        )}

        <div className="section-label !mb-3">
          <div className="section-label-bar" />
          <span className="section-label-text">人员信息</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {PERSON_INPUTS.map(f => {
            const id = `${baseId}-${f.key}`
            const list = f.key === 'orgName' ? orgs : f.key === 'manager' ? managers : null
            return (
              <div key={f.key}>
                <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">
                  {f.label}{'required' in f && f.required && <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>}
                </label>
                <input
                  id={id}
                  value={person[f.key]}
                  onChange={e => { setPerson(p => ({ ...p, [f.key]: e.target.value })); if (f.key === 'idCard') setServerDup(null) }}
                  list={list?.length ? `${id}-list` : undefined}
                  className="input-refined"
                />
                {!!list?.length && <datalist id={`${id}-list`}>{list.map(v => <option key={v} value={v} />)}</datalist>}
              </div>
            )
          })}
        </div>

        <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
          <input type="checkbox" checked={withCert} onChange={e => setWithCert(e.target.checked)} className="accent-navy-700 w-4 h-4" />
          <span className="text-[13px] font-semibold text-slate-700">同时生成证件</span>
        </label>
        {withCert ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 rounded-xl border border-[var(--line)] bg-slate-50/60 p-3.5">
            {CERT_INPUTS.map(f => {
              const id = `${baseId}-c-${f.key}`
              return (
                <div key={f.key}>
                  <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
                  <input id={id} type={'type' in f ? f.type : 'text'} value={cert[f.key]}
                    onChange={e => setCert(c => ({ ...c, [f.key]: e.target.value }))}
                    className="input-refined" />
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-[11.5px] text-slate-400 mb-5">
            暂不生成证件。以后把这条报名记录的状态改成「已取证」并填好证件信息，会自动给此人生成证件。
          </p>
        )}

        {err && <div role="alert" className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button type="submit" disabled={saving || !!dupPerson} className="btn-primary flex-1"
            title={dupPerson ? '身份证号已存在，请使用上方的「关联」' : undefined}>
            {saving ? '处理中…' : '确认准入（新建人员）'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
