'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch, getJSON } from '@/lib/api'
import { toast } from '@/components/toast'
import { canAdmit } from '@/lib/exam-stats'
import { AdmitModal } from './_components/AdmitModal'

type Exam = {
  id: number; orgName: string | null; manager: string | null; name: string | null; idCard: string | null
  certType: string | null; regDate: string | null; isPassed: string
  certNo: string | null; issueDate: string | null; expiryDate: string | null; issuer: string | null
  personId: number | null; certId: number | null; certLinked: boolean
}
type CertLite = { id: number; certType: string | null; certNo: string | null; issueDate: string | null; expiryDate: string | null; issuer: string | null }
type PersonLite = { id: number; name: string; idCard: string | null; orgName: string | null; manager: string | null; certificates: CertLite[] }

const STATUS_OPTIONS = ['待考', '已通过', '未通过', '已取证']
/** 筛选里额外的「待准入」：考试通过但还没进人员库 */
const PENDING_ADMIT = '待准入'
const STATUS_BADGE: Record<string, string> = {
  '待考': 'badge-slate', '已通过': 'badge-green', '未通过': 'badge-red', '已取证': 'badge-navy',
}

const FIELDS = [
  { key: 'orgName', label: '归属建制' },
  { key: 'manager', label: '负责人' },
  { key: 'name', label: '姓名', required: true },
  { key: 'idCard', label: '身份证号' },
  { key: 'certType', label: '证件类别' },
  { key: 'regDate', label: '报名日期', type: 'date' },
  { key: 'certNo', label: '证件编号' },
  { key: 'issueDate', label: '发证日期', type: 'date' },
  { key: 'expiryDate', label: '到期日期', type: 'date' },
  { key: 'issuer', label: '发证机构' },
]

function FormModal({ title, f, setF, onSubmit, onClose, saving, people }: {
  title: string
  f: Record<string, string>
  setF: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
  saving: boolean
  people: PersonLite[]
}) {
  const selectedPerson = people.find(p => String(p.id) === f.personId)
  const certs = selectedPerson?.certificates || []
  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 grid grid-cols-2 gap-3 p-3 bg-navy-50/60 border border-navy-100 rounded-xl">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">关联人员（续证闭环）</label>
              <select value={f.personId || ''} onChange={e => {
                const pid = e.target.value
                const per = people.find(p => String(p.id) === pid)
                setF(prev => ({ ...prev, personId: pid, certId: '', ...(per ? { name: per.name, idCard: per.idCard || '', orgName: per.orgName || '', manager: per.manager || '' } : {}) }))
              }} className="input-refined">
                <option value="">（不关联，仅记录）</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.orgName ? ` · ${p.orgName}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">续证目标证件（可选）</label>
              <select value={f.certId || ''} disabled={!f.personId} onChange={e => {
                const cid = e.target.value
                const c = certs.find(x => String(x.id) === cid)
                setF(prev => ({ ...prev, certId: cid, ...(c ? { certType: c.certType || '', certNo: c.certNo || '', issueDate: c.issueDate || '', expiryDate: c.expiryDate || '', issuer: c.issuer || '' } : {}) }))
              }} className="input-refined disabled:opacity-50">
                <option value="">（新证 / 不指定）</option>
                {certs.map(c => <option key={c.id} value={c.id}>{c.certType || '证件'} {c.certNo || ''} · 到期{c.expiryDate || '—'}</option>)}
              </select>
            </div>
            {f.personId && (
              <div className="col-span-2 text-[11px] text-slate-500">
                状态设为「已取证」保存时，将自动{f.certId ? '更新所选证件（续证，记入证件历史）' : '为该人员生成新证件'}。
              </div>
            )}
          </div>
          {FIELDS.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <input type={field.type || 'text'} value={f[field.key] || ''}
                onChange={e => setF(p => ({ ...p, [field.key]: e.target.value }))}
                className="input-refined" />
            </div>
          ))}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">考试状态</label>
            <select value={f.isPassed || '待考'} onChange={e => setF(p => ({ ...p, isPassed: e.target.value }))}
              className="input-refined">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2 flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? '保存中…' : '确认'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({ isPassed: '待考' })
  const [saving, setSaving] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [people, setPeople] = useState<PersonLite[]>([])
  const [admitting, setAdmitting] = useState<Exam | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await getJSON<Exam[]>('/api/exams')
      setExams(Array.isArray(data) ? data : [])
    } catch {
      setExams([])
    }
    setLoading(false)
  }

  async function loadPeople() {
    try {
      setPeople(await getJSON<PersonLite[]>('/api/personnel'))
    } catch {
      setPeople([])
    }
  }

  useEffect(() => {
    load(); loadPeople()
    // 看板「去处理」跳转：/exams?filter=待准入
    const f = new URLSearchParams(window.location.search).get('filter')
    if (f && (f === PENDING_ADMIT || STATUS_OPTIONS.includes(f))) {
      setStatusFilter(f)
      window.history.replaceState(null, '', '/exams')
    }
  }, [])

  const pendingAdmitCount = exams.filter(canAdmit).length
  const filtered = statusFilter === PENDING_ADMIT ? exams.filter(canAdmit)
    : statusFilter ? exams.filter(e => e.isPassed === statusFilter) : exams

  async function addExam(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/exams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      toast('报名已添加', 'success')
      setShowAdd(false); setForm({ isPassed: '待考' }); load()
    } catch { /* toast 已弹 */ }
    setSaving(false)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingExam) return
    setSaving(true)
    try {
      await apiFetch(`/api/exams/${editingExam.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) })
      toast('已保存', 'success')
      setEditingExam(null); load()
    } catch { /* toast 已弹 */ }
    setSaving(false)
  }

  async function deleteExam(id: number) {
    try {
      await apiFetch(`/api/exams/${id}`, { method: 'DELETE' })
      toast('已删除', 'success')
      setConfirmDel(null); load()
    } catch { /* toast 已弹 */ }
  }

  function startEdit(exam: Exam) {
    setEditingExam(exam)
    setEditForm({
      personId: exam.personId ? String(exam.personId) : '', certId: exam.certId ? String(exam.certId) : '',
      orgName: exam.orgName || '', manager: exam.manager || '', name: exam.name || '',
      idCard: exam.idCard || '',
      certType: exam.certType || '', regDate: exam.regDate || '', isPassed: exam.isPassed,
      certNo: exam.certNo || '', issueDate: exam.issueDate || '',
      expiryDate: exam.expiryDate || '', issuer: exam.issuer || '',
    })
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">考试报名</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            共 {exams.length} 条记录{pendingAdmitCount > 0 && <> · <span className="text-navy-700 font-semibold">{pendingAdmitCount} 人通过待准入</span></>}
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setForm({ isPassed: '待考' }) }}
          className="btn-primary self-center !py-2 !px-4 !text-sm">
          + 添加报名
        </button>
      </div>

      <div className="filter-bar flex items-center gap-3">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${!statusFilter ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>全部</button>
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statusFilter === s ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{s}</button>
          ))}
        </div>
        <button onClick={() => setStatusFilter(statusFilter === PENDING_ADMIT ? '' : PENDING_ADMIT)}
          aria-pressed={statusFilter === PENDING_ADMIT}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all inline-flex items-center gap-1.5 ${statusFilter === PENDING_ADMIT ? 'bg-navy-700 text-white border-navy-700' : 'bg-white text-navy-700 border-navy-200 hover:bg-navy-50'}`}>
          {PENDING_ADMIT}
          <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums ${statusFilter === PENDING_ADMIT ? 'bg-white/20' : 'bg-navy-100'}`}>{pendingAdmitCount}</span>
        </button>
        <span className="ml-auto text-[11px] text-slate-400 hidden md:inline">考试通过（已通过 / 已取证）的人员，可一键准入人员库</span>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-12 text-center">
          <div className="text-sm font-semibold text-slate-600">
            {statusFilter === PENDING_ADMIT ? '没有待准入的人员，考试通过的都已在人员库中' : '暂无报名记录'}
          </div>
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full table-premium table-compact">
            <thead>
              <tr>
                {['建制','负责人','姓名','证件类别','报名日期','状态','证件编号','到期日期','人员库','证件','操作'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(exam => (
                <tr key={exam.id}>
                  <td>{exam.orgName || '—'}</td>
                  <td>{exam.manager || '—'}</td>
                  <td className="font-medium text-slate-800">{exam.name || '—'}</td>
                  <td>{exam.certType || '—'}</td>
                  <td className="text-xs">{exam.regDate || '—'}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[exam.isPassed] ?? 'badge-slate'}`}>{exam.isPassed}</span>
                  </td>
                  <td className="text-xs text-slate-500">{exam.certNo || '—'}</td>
                  <td className="text-xs">{exam.expiryDate || '—'}</td>
                  <td>
                    {exam.personId ? (
                      <Link href={`/personnel?open=${exam.personId}`} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium" title="在人员库中查看此人">
                        ✓ 已在库
                      </Link>
                    ) : canAdmit(exam) ? (
                      <button onClick={() => setAdmitting(exam)}
                        className="px-2.5 py-1 rounded-md bg-navy-700 hover:bg-navy-800 text-white text-xs font-semibold transition-colors">
                        准入人员库
                      </button>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td>
                    {exam.certLinked
                      ? <span className="badge badge-green">已生成</span>
                      : exam.personId ? <span className="badge badge-slate">待取证</span> : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <button onClick={() => startEdit(exam)} className="text-xs text-navy-600 hover:text-navy-800 font-medium">编辑</button>
                      {confirmDel === exam.id ? (
                        <><button onClick={() => deleteExam(exam.id)} className="text-xs text-red-500 font-semibold">确认</button>
                        <button onClick={() => setConfirmDel(null)} className="text-xs text-slate-400">取消</button></>
                      ) : (
                        <button onClick={() => setConfirmDel(exam.id)} className="text-xs text-slate-400 hover:text-red-500">删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showAdd && <FormModal title="添加报名记录" f={form} setF={setForm} onSubmit={addExam} onClose={() => setShowAdd(false)} saving={saving} people={people} />}
      {admitting && (
        <AdmitModal
          exam={admitting}
          people={people}
          onClose={() => setAdmitting(null)}
          onDone={() => { load(); loadPeople() }}
        />
      )}
      {editingExam && <FormModal title="编辑报名记录" f={editForm} setF={setEditForm} onSubmit={saveEdit} onClose={() => setEditingExam(null)} saving={saving} people={people} />}
    </div>
  )
}
