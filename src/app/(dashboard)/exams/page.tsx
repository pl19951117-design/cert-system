'use client'

import { useEffect, useState } from 'react'
import { apiFetch, getJSON } from '@/lib/api'
import { toast } from '@/components/toast'

type Exam = {
  id: number; orgName: string | null; manager: string | null; name: string | null
  certType: string | null; regDate: string | null; isPassed: string
  certNo: string | null; issueDate: string | null; expiryDate: string | null; issuer: string | null
  personId: number | null; certId: number | null; certLinked: boolean
}
type CertLite = { id: number; certType: string | null; certNo: string | null; issueDate: string | null; expiryDate: string | null; issuer: string | null }
type PersonLite = { id: number; name: string; orgName: string | null; manager: string | null; certificates: CertLite[] }

const STATUS_OPTIONS = ['待考', '已通过', '未通过', '已取证']
const statusBadge: Record<string, string> = {
  '待考':   'bg-slate-50 text-slate-500 border-slate-200',
  '已通过': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  '未通过': 'bg-red-50 text-red-500 border-red-200',
  '已取证': 'bg-amber-50 text-amber-600 border-amber-200',
}

const FIELDS = [
  { key: 'orgName', label: '归属建制' },
  { key: 'manager', label: '负责人' },
  { key: 'name', label: '姓名', required: true },
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
          <div className="col-span-2 grid grid-cols-2 gap-3 p-3 bg-amber-50/40 border border-amber-100 rounded-xl">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">关联人员（续证闭环）</label>
              <select value={f.personId || ''} onChange={e => {
                const pid = e.target.value
                const per = people.find(p => String(p.id) === pid)
                setF(prev => ({ ...prev, personId: pid, certId: '', ...(per ? { name: per.name, orgName: per.orgName || '', manager: per.manager || '' } : {}) }))
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
            <div key={field.key} className={field.key === 'name' ? 'col-span-2' : ''}>
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

  useEffect(() => { load(); loadPeople() }, [])

  const filtered = statusFilter ? exams.filter(e => e.isPassed === statusFilter) : exams

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
          <p className="text-xs text-slate-400 mt-0.5">共 {exams.length} 条记录</p>
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
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-12 text-center">
          <div className="text-sm font-semibold text-slate-600">暂无报名记录</div>
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <table className="w-full table-premium">
            <thead>
              <tr>
                {['建制','负责人','姓名','证件类别','报名日期','状态','证件编号','到期日期','证件','操作'].map(h => (
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
                    <span className={`badge ${exam.isPassed === '已通过' ? 'badge-green' : exam.isPassed === '未通过' ? 'badge-red' : exam.isPassed === '已取证' ? 'badge-amber' : 'badge-slate'}`}>{exam.isPassed}</span>
                  </td>
                  <td className="font-mono text-xs text-slate-500">{exam.certNo || '—'}</td>
                  <td className="text-xs">{exam.expiryDate || '—'}</td>
                  <td>
                    {exam.certLinked
                      ? <span className="badge badge-green">已生成</span>
                      : exam.personId ? <span className="badge badge-slate">待取证</span> : <span className="text-xs text-slate-300">—</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <button onClick={() => startEdit(exam)} className="text-xs text-amber-500 hover:text-amber-600 font-medium">编辑</button>
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
      )}

      {showAdd && <FormModal title="添加报名记录" f={form} setF={setForm} onSubmit={addExam} onClose={() => setShowAdd(false)} saving={saving} people={people} />}
      {editingExam && <FormModal title="编辑报名记录" f={editForm} setF={setEditForm} onSubmit={saveEdit} onClose={() => setEditingExam(null)} saving={saving} people={people} />}
    </div>
  )
}
