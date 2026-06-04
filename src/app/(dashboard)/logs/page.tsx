'use client'

import { useEffect, useMemo, useState } from 'react'
import { CHANGE_TYPES, computeChangeStats, type ChangeLogRow } from '@/lib/change-log-stats'

type Log = ChangeLogRow & {
  id: number
  orgName: string | null; manager: string | null; name: string | null
  idCard: string | null; education: string | null; socialSecurity: string | null
  certNo: string | null; expiryDate: string | null
}

const CHANGE_TYPE_OPTIONS = [
  CHANGE_TYPES.PERSON_ADD,
  CHANGE_TYPES.PERSON_REMOVE,
  CHANGE_TYPES.CERT_ADD,
  CHANGE_TYPES.CERT_UPDATE,
  CHANGE_TYPES.CERT_REMOVE,
  '信息变更', '其他',
]

const FIELDS = [
  { key: 'changeType', label: '变动类型', isSelect: true },
  { key: 'changeDate', label: '变动日期', type: 'date' },
  { key: 'orgName', label: '归属建制' },
  { key: 'manager', label: '负责人' },
  { key: 'name', label: '姓名', required: true },
  { key: 'idCard', label: '身份证号' },
  { key: 'education', label: '学历' },
  { key: 'socialSecurity', label: '社保号' },
  { key: 'certType', label: '证件类别' },
  { key: 'certNo', label: '证件编号' },
  { key: 'expiryDate', label: '到期日期', type: 'date' },
]

const TYPE_BADGE: Record<string, string> = {
  [CHANGE_TYPES.PERSON_ADD]:    'bg-emerald-50 text-emerald-600 border-emerald-200',
  [CHANGE_TYPES.PERSON_REMOVE]: 'bg-red-50 text-red-500 border-red-200',
  [CHANGE_TYPES.CERT_ADD]:      'bg-amber-50 text-amber-600 border-amber-200',
  [CHANGE_TYPES.CERT_UPDATE]:   'bg-blue-50 text-blue-600 border-blue-200',
  [CHANGE_TYPES.CERT_REMOVE]:   'bg-slate-50 text-slate-500 border-slate-200',
  '信息变更': 'bg-purple-50 text-purple-600 border-purple-200',
  '其他':     'bg-slate-50 text-slate-400 border-slate-200',
}

/** 新增 / 编辑 变动记录共用的表单弹窗 */
function LogFormModal({ title, submitLabel, form, setForm, onSubmit, onClose, saving }: {
  title: string
  submitLabel: string
  form: Record<string, string>
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onSubmit: (e: React.FormEvent) => void
  onClose: () => void
  saving: boolean
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          {FIELDS.map(f => (
            <div key={f.key} className={f.key === 'name' ? 'col-span-2' : ''}>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              {f.isSelect ? (
                <select value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="input-refined">
                  {CHANGE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input type={f.type || 'text'} value={form[f.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="input-refined" />
              )}
            </div>
          ))}
          <div className="col-span-2 flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? '保存中…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({ changeType: CHANGE_TYPES.PERSON_ADD })
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Log | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [typeFilter, setTypeFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('') // 'YYYY-MM'
  const [search, setSearch] = useState('')
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  async function load() {
    setLoading(true)
    const data = await fetch('/api/logs').then(r => r.json())
    setLogs(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // 1) 按月份过滤的子集（先按月份过滤，再算「该月统计」）
  // 2) 在月份子集上再叠加类型/搜索过滤，作为表格展示集
  const monthFiltered = useMemo(
    () => !monthFilter ? logs : logs.filter(l => l.changeDate?.startsWith(monthFilter)),
    [logs, monthFilter],
  )
  const tableRows = useMemo(
    () => monthFiltered.filter(l => {
      const matchType = !typeFilter || l.changeType === typeFilter
      const matchSearch = !search || (l.name || '').includes(search) || (l.orgName || '').includes(search)
      return matchType && matchSearch
    }),
    [monthFiltered, typeFilter, search],
  )

  // 统计永远基于「月份过滤后的集合」，与类型/搜索过滤无关
  // —— 因为这两个过滤是为了找记录，不影响「该月新增/减少多少本」的语义
  const stats = useMemo(() => computeChangeStats(monthFiltered), [monthFiltered])

  async function addLog(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false); setShowAdd(false); setForm({ changeType: CHANGE_TYPES.PERSON_ADD }); load()
  }

  function startEdit(log: Log) {
    setEditing(log)
    setEditForm({
      changeType: log.changeType || '其他',
      changeDate: log.changeDate || '',
      orgName: log.orgName || '', manager: log.manager || '', name: log.name || '',
      idCard: log.idCard || '', education: log.education || '', socialSecurity: log.socialSecurity || '',
      certType: log.certType || '', certNo: log.certNo || '', expiryDate: log.expiryDate || '',
    })
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    try {
      await fetch(`/api/logs/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      })
      setEditing(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function deleteLog(id: number) {
    await fetch(`/api/logs/${id}`, { method: 'DELETE' })
    setConfirmDel(null)
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    load()
  }

  async function bulkDelete() {
    if (selected.size === 0) return
    setBulkBusy(true)
    try {
      await fetch('/api/logs/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected] }),
      })
      setSelected(new Set())
      setBulkConfirm(false)
      await load()
    } finally {
      setBulkBusy(false)
    }
  }

  // 当前可见行的 id（用于「全选当前视图」）
  const visibleIds = useMemo(() => tableRows.map(r => r.id), [tableRows])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const someVisibleSelected = visibleIds.some(id => selected.has(id))
  function toggleAllVisible() {
    setSelected(prev => {
      const n = new Set(prev)
      if (allVisibleSelected) { for (const id of visibleIds) n.delete(id) }
      else                    { for (const id of visibleIds) n.add(id) }
      return n
    })
  }
  function toggleOne(id: number) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const monthLabel = monthFilter
    ? `${monthFilter.slice(0, 4)}年${Number(monthFilter.slice(5, 7))}月`
    : '全部时间'

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">变动流水</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            共 {logs.length} 条记录 · 当前展示 {tableRows.length} 条
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setForm({ changeType: CHANGE_TYPES.PERSON_ADD }) }}
          className="btn-primary self-center !py-2 !px-4 !text-sm">
          + 添加记录
        </button>
      </div>

      {/* 统计面板 —— 永远基于「月份过滤后的集合」 */}
      <div className="card-elevated overflow-hidden mb-5">
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/40">
          <div className="p-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">统计周期</div>
            <div className="text-base font-bold text-slate-800">{monthLabel}</div>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">新增证件</div>
            <div className="text-2xl font-extrabold text-emerald-600 tabular-nums leading-none">
              +{stats.added}<span className="text-sm font-bold text-slate-400 ml-1">本</span>
            </div>
          </div>
          <div className="p-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">减少证件</div>
            <div className="text-2xl font-extrabold text-red-500 tabular-nums leading-none">
              −{stats.removed}<span className="text-sm font-bold text-slate-400 ml-1">本</span>
            </div>
          </div>
        </div>
        {stats.byType.length === 0 ? (
          <div className="p-5 text-center text-xs text-slate-400">
            {monthFilter ? '该月份没有新增/减少证件记录' : '暂无新增/减少证件记录'}
          </div>
        ) : (
          <table className="w-full table-premium">
            <thead>
              <tr>
                <th>证件类别</th>
                <th className="text-right">新增</th>
                <th className="text-right">减少</th>
                <th className="text-right">净变化</th>
              </tr>
            </thead>
            <tbody>
              {stats.byType.map(r => {
                const net = r.added - r.removed
                return (
                  <tr key={r.type}>
                    <td className="font-medium text-slate-800">{r.type}</td>
                    <td className="text-right tabular-nums text-emerald-700">+{r.added}</td>
                    <td className="text-right tabular-nums text-red-500">−{r.removed}</td>
                    <td className={`text-right tabular-nums font-semibold ${net > 0 ? 'text-emerald-700' : net < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                      {net > 0 ? `+${net}` : net}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="filter-bar flex items-center gap-3 flex-wrap">
        <input
          type="month"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          className="input-refined !w-44 !py-1.5 !px-3 !text-xs"
          aria-label="按月份筛选"
        />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索姓名或建制…"
          className="input-refined !w-44 !py-1.5 !px-3 !text-xs" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="input-refined !w-auto !py-1.5 !px-3 !text-xs">
          <option value="">全部类型</option>
          {CHANGE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(search || typeFilter || monthFilter) && (
          <button onClick={() => { setSearch(''); setTypeFilter(''); setMonthFilter('') }} className="text-xs text-amber-500 hover:text-amber-600 font-medium">清除</button>
        )}

        {/* 批量删除控件：有选中时才显示 */}
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2" role="region" aria-label="批量操作">
            <span className="text-xs text-slate-500">
              已选 <span className="font-semibold text-slate-700">{selected.size}</span> 条
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              清空
            </button>
            {bulkConfirm ? (
              <>
                <span className="text-xs text-red-500 font-medium">确认删除 {selected.size} 条？</span>
                <button
                  type="button"
                  onClick={bulkDelete}
                  disabled={bulkBusy}
                  aria-busy={bulkBusy}
                  className="text-xs px-2.5 py-1 rounded-md bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-60"
                >
                  {bulkBusy ? '删除中…' : '确认删除'}
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirm(false)}
                  disabled={bulkBusy}
                  className="text-xs px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100"
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setBulkConfirm(true)}
                className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-600 border border-red-200 font-semibold hover:bg-red-100"
              >
                删除选中
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
      ) : tableRows.length === 0 ? (
        <div className="card-elevated p-12 text-center">
          <div className="text-sm font-semibold text-slate-600">暂无变动记录</div>
          {monthFilter && (
            <div className="text-xs text-slate-400 mt-1">尝试清除月份筛选查看全部记录</div>
          )}
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <table className="w-full table-premium">
            <thead>
              <tr>
                <th className="w-8 px-3">
                  <input
                    type="checkbox"
                    aria-label={allVisibleSelected ? '取消全选当前视图' : '全选当前视图'}
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected }}
                    onChange={toggleAllVisible}
                    className="cursor-pointer accent-amber-500"
                  />
                </th>
                {['变动类型','变动日期','建制','负责人','姓名','证件类别','证件编号','到期日期','操作'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map(log => {
                const checked = selected.has(log.id)
                return (
                <tr key={log.id} className={checked ? 'bg-amber-50/30' : ''}>
                  <td className="w-8 px-3">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${log.name || '记录'}`}
                      checked={checked}
                      onChange={() => toggleOne(log.id)}
                      className="cursor-pointer accent-amber-500"
                    />
                  </td>
                  <td>
                    <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-semibold ${TYPE_BADGE[log.changeType || ''] || TYPE_BADGE['其他']}`}>
                      {log.changeType || '—'}
                    </span>
                  </td>
                  <td className="text-xs">{log.changeDate || '—'}</td>
                  <td>{log.orgName || '—'}</td>
                  <td>{log.manager || '—'}</td>
                  <td className="font-medium text-slate-800">{log.name || '—'}</td>
                  <td>{log.certType || '—'}</td>
                  <td className="font-mono text-xs text-slate-500">{log.certNo || '—'}</td>
                  <td className="text-xs">{log.expiryDate || '—'}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <button onClick={() => startEdit(log)} className="text-xs text-amber-500 hover:text-amber-600 font-medium">编辑</button>
                      {confirmDel === log.id ? (
                        <span className="flex items-center gap-2">
                          <button onClick={() => deleteLog(log.id)} className="text-xs text-red-500 font-semibold">确认</button>
                          <button onClick={() => setConfirmDel(null)} className="text-xs text-slate-400">取消</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDel(log.id)} className="text-xs text-slate-400 hover:text-red-500">删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <LogFormModal
          title="添加变动记录"
          submitLabel="确认添加"
          form={form}
          setForm={setForm}
          onSubmit={addLog}
          onClose={() => setShowAdd(false)}
          saving={saving}
        />
      )}

      {editing && (
        <LogFormModal
          title="编辑变动记录"
          submitLabel="保存修改"
          form={editForm}
          setForm={setEditForm}
          onSubmit={saveEdit}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}
    </div>
  )
}
