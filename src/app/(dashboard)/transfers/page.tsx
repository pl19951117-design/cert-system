'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/toast'
import { apiFetch, getJSON } from '@/lib/api'

type Plan = {
  id: number
  direction: 'in' | 'out'
  name: string
  idCard: string | null
  orgName: string | null
  manager: string | null
  certTypes: string | null
  plannedDate: string | null
  note: string | null
  status: 'pending' | 'done'
  personId: number | null
  createdAt: string
  completedAt: string | null
}

const FIELDS = [
  { key: 'name', label: '姓名', required: true },
  { key: 'orgName', label: '归属建制' },
  { key: 'manager', label: '负责人' },
  { key: 'certTypes', label: '涉及证件类别', placeholder: '如：A,C1（可多个，逗号分隔）' },
  { key: 'plannedDate', label: '计划办理日期', type: 'date' },
  { key: 'idCard', label: '身份证号' },
  { key: 'note', label: '备注', placeholder: '如：等新证下来 / 6月底离场', col: 2 },
] as const

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function PlanFormModal({ title, submitLabel, form, setForm, onSubmit, onClose, saving, options }: {
  title: string; submitLabel: string
  form: Record<string, string>
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
  saving: boolean
  /** 已有建制/负责人，自动补全 —— 与人员表保持一致的写法才能正确归类 */
  options: { orgs: string[]; managers: string[] }
}) {
  return (
    <Modal onClose={onClose} title={title} size="md">
      <form onSubmit={onSubmit} className="p-6">
        {/* 方向选择 */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">方向</label>
          <div role="radiogroup" aria-label="登记方向" className="grid grid-cols-2 gap-2">
            {([['in', '待转入', 'peer-checked'], ['out', '待转出', '']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={form.direction === v}
                onClick={() => setForm(p => ({ ...p, direction: v }))}
                className={
                  'py-2 rounded-lg border text-sm font-semibold transition-colors ' +
                  (form.direction === v
                    ? (v === 'in'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                        : 'bg-red-50 border-red-300 text-red-600')
                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map(f => {
            const listItems = f.key === 'orgName' ? options.orgs
                            : f.key === 'manager' ? options.managers : undefined
            const listId = f.key === 'orgName' ? 'tp-orgs' : f.key === 'manager' ? 'tp-mgrs' : undefined
            return (
              <div key={f.key} className={'col' in f && f.col === 2 ? 'col-span-2' : ''}>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {f.label}{'required' in f && f.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type={'type' in f ? f.type : 'text'}
                  value={form[f.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={'placeholder' in f ? f.placeholder : ''}
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
        <div className="flex gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Spinner size={14} label="保存中" />}
            {saving ? '保存中…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function TransfersPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({ direction: 'in' })
  const [editing, setEditing] = useState<Plan | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  // 已有建制/负责人（取自人员表），供表单自动补全，保证与人员表写法一致
  const [options, setOptions] = useState<{ orgs: string[]; managers: string[] }>({ orgs: [], managers: [] })

  async function load() {
    setLoading(true)
    try {
      setPlans(await getJSON<Plan[]>('/api/transfer-plans'))
    } catch { setPlans([]) }
    setLoading(false)
  }

  async function loadOptions() {
    try {
      const people = await getJSON<{ orgName: string | null; manager: string | null }[]>('/api/personnel')
      const o = new Set<string>(), m = new Set<string>()
      for (const p of people) {
        if (p.orgName) o.add(p.orgName)
        if (p.manager) m.add(p.manager)
      }
      setOptions({ orgs: [...o], managers: [...m] })
    } catch { /* 补全不可用不影响主流程 */ }
  }

  useEffect(() => { load(); loadOptions() }, [])

  const rows = useMemo(() => plans.filter(p => p.status === tab), [plans, tab])
  const pendingCount = useMemo(() => plans.filter(p => p.status === 'pending').length, [plans])
  const today = todayYMD()

  async function addPlan(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim()) { toast('姓名不能为空', 'error'); return }
    setSaving(true)
    try {
      await apiFetch('/api/transfer-plans', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      toast('已登记', 'success')
      setShowAdd(false); setForm({ direction: 'in' })
      await load()
      router.refresh()   // 同步侧边栏角标
    } catch { /* toast 已弹 */ }
    setSaving(false)
  }

  function startEdit(p: Plan) {
    setEditing(p)
    setEditForm({
      direction: p.direction, name: p.name,
      orgName: p.orgName || '', manager: p.manager || '',
      certTypes: p.certTypes || '', plannedDate: p.plannedDate || '',
      idCard: p.idCard || '', note: p.note || '',
    })
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      await apiFetch(`/api/transfer-plans/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      })
      toast('已保存', 'success')
      setEditing(null)
      await load()
    } catch { /* toast 已弹 */ }
    setSaving(false)
  }

  async function setStatus(p: Plan, status: 'pending' | 'done') {
    try {
      await apiFetch(`/api/transfer-plans/${p.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      toast(status === 'done' ? '已标记完成' : '已重新打开', 'success')
      await load()
      router.refresh()
    } catch { /* toast 已弹 */ }
  }

  async function deletePlan(id: number) {
    try {
      await apiFetch(`/api/transfer-plans/${id}`, { method: 'DELETE' })
      toast('已删除', 'success')
      setConfirmDel(null)
      await load()
      router.refresh()
    } catch { /* toast 已弹 */ }
  }

  /** 去办理：转入 → 带预填参数打开人员页添加弹窗；转出 → 人员页按姓名筛选 */
  function goHandle(p: Plan) {
    if (p.direction === 'in') {
      const q = new URLSearchParams({ add: '1', name: p.name })
      if (p.orgName) q.set('orgName', p.orgName)
      if (p.manager) q.set('manager', p.manager)
      if (p.idCard) q.set('idCard', p.idCard)
      router.push(`/personnel?${q.toString()}`)
    } else {
      router.push(`/personnel?search=${encodeURIComponent(p.name)}`)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">转入转出登记</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            待办 {pendingCount} 条 · 登记计划转入/转出的人员，防止遗忘
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setForm({ direction: 'in' }) }}
          className="btn-primary self-center !py-2 !px-4 !text-sm">
          + 新增登记
        </button>
      </div>

      <div className="filter-bar !p-1 w-fit !mb-5 flex gap-1">
        {([['pending', `待办 ${pendingCount}`], ['done', '已完成']] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-5 py-2 rounded-[10px] text-sm font-medium transition-all ${
              tab === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
      ) : rows.length === 0 ? (
        <div className="card-elevated p-12 text-center">
          <svg className="w-10 h-10 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M9 8h6m-9 12h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="text-sm font-semibold text-slate-600">
            {tab === 'pending' ? '暂无待办登记' : '暂无已完成记录'}
          </div>
          {tab === 'pending' && (
            <button onClick={() => { setShowAdd(true); setForm({ direction: 'in' }) }}
              className="mt-3 text-xs text-navy-600 hover:text-navy-800 font-semibold">
              + 登记第一条
            </button>
          )}
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <table className="w-full table-premium">
            <thead>
              <tr>
                {['方向','姓名','归属建制','负责人','证件类别','计划日期','备注', tab === 'done' ? '完成时间' : '', '操作'].filter(Boolean).map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(p => {
                const overdue = p.status === 'pending' && !!p.plannedDate && p.plannedDate < today
                return (
                  <tr key={p.id} className={overdue ? 'bg-red-50/30' : ''}>
                    <td>
                      <span className={`badge ${p.direction === 'in' ? 'badge-green' : 'badge-red'}`}>
                        {p.direction === 'in' ? '待转入' : '待转出'}
                      </span>
                    </td>
                    <td className="font-medium text-slate-800">{p.name}</td>
                    <td>{p.orgName || '—'}</td>
                    <td>{p.manager || '—'}</td>
                    <td className="text-xs">{p.certTypes || '—'}</td>
                    <td className={`text-xs ${overdue ? 'text-red-500 font-semibold' : ''}`}>
                      {p.plannedDate || '—'}{overdue && ' · 已超期'}
                    </td>
                    <td className="text-xs text-slate-500 max-w-[160px] truncate" title={p.note || ''}>{p.note || '—'}</td>
                    {tab === 'done' && (
                      <td className="text-xs text-slate-400">{p.completedAt ? p.completedAt.slice(0, 10) : '—'}</td>
                    )}
                    <td>
                      <div className="flex items-center gap-3">
                        {p.status === 'pending' ? (
                          <>
                            <button onClick={() => goHandle(p)} className="text-xs text-navy-600 hover:text-navy-800 font-semibold">
                              {p.direction === 'in' ? '去添加' : '去处理'}
                            </button>
                            <button onClick={() => setStatus(p, 'done')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">完成</button>
                            <button onClick={() => startEdit(p)} className="text-xs text-slate-400 hover:text-slate-600">编辑</button>
                          </>
                        ) : (
                          <button onClick={() => setStatus(p, 'pending')} className="text-xs text-slate-400 hover:text-navy-700">重新打开</button>
                        )}
                        {confirmDel === p.id ? (
                          <span className="flex items-center gap-2">
                            <button onClick={() => deletePlan(p.id)} className="text-xs text-red-500 font-semibold">确认</button>
                            <button onClick={() => setConfirmDel(null)} className="text-xs text-slate-400">取消</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDel(p.id)} className="text-xs text-slate-400 hover:text-red-500">删除</button>
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

      {showAdd && (
        <PlanFormModal title="新增登记" submitLabel="确认登记" form={form} setForm={setForm}
          onSubmit={addPlan} onClose={() => setShowAdd(false)} saving={saving} options={options} />
      )}
      {editing && (
        <PlanFormModal title="编辑登记" submitLabel="保存修改" form={editForm} setForm={setEditForm}
          onSubmit={saveEdit} onClose={() => setEditing(null)} saving={saving} options={options} />
      )}
    </div>
  )
}
