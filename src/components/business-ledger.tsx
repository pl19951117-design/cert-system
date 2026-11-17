'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, FileText, Download, Trash2 } from 'lucide-react'
import { LedgerExcel } from '@/components/ledger-excel'
import { AttachmentPreview } from '@/components/attachment-preview'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { TableRowSkeleton } from '@/components/Skeleton'
import { AlignedTable } from '@/components/aligned-table'
import { toast } from '@/components/toast'
import { apiFetch, getJSON } from '@/lib/api'
import { RECTIFICATIONS, BUSINESS_CATEGORIES, CASE_TYPES, yuanToWan, wanToYuan, formatMoney, normalizeMoney, type BusinessKind, type BusinessRecord } from '@/lib/business-records'

type Field = { key: string; label: string; type?: 'date' | 'money' | 'textarea'; required?: boolean; options?: readonly string[] }
const COMMON: Field[] = [{ key: 'orgName', label: '归属建制' }, { key: 'manager', label: '负责人' }]
const CONFIG = {
  'safety-inspections': {
    title: '安全检查', singular: '检查记录', name: 'projectName', date: 'inspectionDate',
    description: '集中管理项目检查、检查报告与整改记录。',
    fields: [...COMMON, { key: 'projectName', label: '项目名称', required: true },
      { key: 'amount', label: '合同金额', type: 'money' }, { key: 'inspectionDate', label: '检查时间', type: 'date' },
      { key: 'rectification', label: '整改情况', options: RECTIFICATIONS }] as Field[],
    columns: ['序号', '归属建制', '负责人', '项目名称', '合同金额', '检查时间', '检查报告', '整改情况'],
  },
  'legal-cases': {
    title: '法务案件', singular: '案件', name: 'caseNo', date: 'hearingDate',
    description: '统一记录案件信息、涉案金额、开庭时间与案件结果。',
    fields: [...COMMON, { key: 'caseNo', label: '案件编号', required: true }, { key: 'businessCategory', label: '业务类别', options: BUSINESS_CATEGORIES }, { key: 'caseType', label: '案件类型', options: CASE_TYPES },
      { key: 'amount', label: '涉案金额', type: 'money' }, { key: 'hearingDate', label: '开庭时间', type: 'date' },
      { key: 'result', label: '案件结果', type: 'textarea' }] as Field[],
    columns: ['序号', '归属建制', '负责人', '案件编号', '业务类别', '案件类型', '涉案金额', '开庭时间', '案件结果'],
  },
}
const PAGE_SIZE = 30

export function BusinessLedger({ kind, canWrite }: { kind: BusinessKind; canWrite: boolean }) {
  const config = CONFIG[kind]
  const [rows, setRows] = useState<BusinessRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [org, setOrg] = useState('')
  const [manager, setManager] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [target, setTarget] = useState<BusinessRecord | 'new' | null>(null)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setRows(await getJSON<BusinessRecord[]>(`/api/${kind}`)) }
    catch { setError('加载失败，请重试。') }
    finally { setLoading(false) }
  }, [kind])
  useEffect(() => {
    let active = true
    getJSON<BusinessRecord[]>(`/api/${kind}`)
      .then(data => { if (active) setRows(data) })
      .catch(() => { if (active) setError('加载失败，请重试。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [kind])
  const filtered = useMemo(() => rows.filter(row => {
    const date = kind === 'safety-inspections' ? row.inspectionDate : row.hearingDate
    const haystack = [row.orgName, row.manager, row.projectName, row.caseNo, row.businessCategory, row.caseType, row.rectification, row.result,
      ...(row.reports || []).map(report => report.fileName)].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(search.trim().toLowerCase()) && (!org || row.orgName === org) && (!manager || row.manager === manager)
      && (!from || !!date && date >= from) && (!to || !!date && date <= to)
  }), [rows, search, org, manager, from, to, kind])
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const orgs = [...new Set(rows.map(row => row.orgName).filter(Boolean))] as string[]
  const managers = [...new Set(rows.map(row => row.manager).filter(Boolean))] as string[]
  const clear = () => { setSearch(''); setOrg(''); setManager(''); setFrom(''); setTo(''); setPage(1) }
  const value = (row: BusinessRecord, key: string) => row[key as keyof BusinessRecord] as string | null | undefined
  const nameCell = (row: BusinessRecord) => <button type="button" className="record-name" onClick={() => setTarget(row)} title="查看详情">{value(row, config.name)}</button>

  return <div className="space-y-6">
    <header className="page-header">
      <div className="flex-1 min-w-0"><h1>{config.title}</h1><p>{config.description}</p></div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <LedgerExcel kind={kind} rows={filtered} canWrite={canWrite} onChanged={() => void load()} />
        <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} aria-hidden />刷新</button>
        {canWrite && <button type="button" className="btn-primary" onClick={() => setTarget('new')}><Plus size={16} aria-hidden />新增{config.singular}</button>}
      </div>
    </header>
    <section className="card-elevated overflow-hidden" aria-label={`${config.title}台账`}>
      <div className="record-filters">
        <label className="record-filter record-search" htmlFor={`${kind}-search`}>关键词
          <span className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400" aria-hidden /><input id={`${kind}-search`} className="input-refined !pl-9" value={search} placeholder={kind === 'safety-inspections' ? '搜索项目、报告或整改情况' : '搜索案号、类型或案件结果'} onChange={e => { setSearch(e.target.value); setPage(1) }} /></span>
        </label>
        <label className="record-filter" htmlFor={`${kind}-org`}>归属建制<select id={`${kind}-org`} className="input-refined" value={org} onChange={e => { setOrg(e.target.value); setPage(1) }}><option value="">全部建制</option>{orgs.map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="record-filter" htmlFor={`${kind}-manager`}>负责人<select id={`${kind}-manager`} className="input-refined" value={manager} onChange={e => { setManager(e.target.value); setPage(1) }}><option value="">全部负责人</option>{managers.map(v => <option key={v}>{v}</option>)}</select></label>
        <label className="record-filter" htmlFor={`${kind}-from`}>起始日期<input id={`${kind}-from`} type="date" className="input-refined" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1) }} /></label>
        <label className="record-filter" htmlFor={`${kind}-to`}>截止日期<input id={`${kind}-to`} type="date" className="input-refined" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1) }} /></label>
        <button type="button" className="btn-ghost" onClick={clear}>重置</button>
      </div>
      <div className="record-table-note"><span aria-live="polite">{loading ? '正在加载…' : `共 ${filtered.length} 条记录`}</span><span>金额单位：{kind === 'safety-inspections' ? '万元' : '元'} · 点击{kind === 'safety-inspections' ? '项目名称' : '案件编号'}查看详情</span></div>
      {error ? <div className="p-10 text-center" role="alert"><p className="text-red-600 mb-3">{error}</p><button className="btn-secondary" onClick={() => void load()}>重新加载</button></div> : <div className="overflow-x-auto">
        <AlignedTable columns={config.columns} className="table-premium w-full record-table">
          <caption className="sr-only">{config.title}，金额单位为{kind === 'safety-inspections' ? '万元' : '元'}</caption>
          <thead><tr>{config.columns.map((label, i) => <th key={label} scope="col" className={i === 0 || label.endsWith('时间') ? 'text-center' : label.endsWith('金额') ? 'text-right' : 'text-left'}>{label}</th>)}</tr></thead>
          <tbody>{loading ? <TableRowSkeleton cols={config.columns.length} count={5} /> : visible.length ? visible.map((row, index) => <tr key={row.id}>
            <td className="text-center tabular-nums text-slate-400">{(current - 1) * PAGE_SIZE + index + 1}</td>
            <td>{row.orgName || '—'}</td><td>{row.manager || '—'}</td><td>{nameCell(row)}</td>
            {kind === 'legal-cases' && <td>{row.businessCategory || '—'}</td>}
            {kind === 'legal-cases' && <td>{row.caseType || '—'}</td>}
            <td className="text-right tabular-nums whitespace-nowrap">{kind === 'safety-inspections' ? yuanToWan(row.amount) || '—' : formatMoney(row.amount)}</td>
            <td className="text-center tabular-nums whitespace-nowrap">{value(row, config.date) || '—'}</td>
            {kind === 'safety-inspections' && <td>{row.reports?.length ? <button className="record-name inline-flex items-center gap-1.5" onClick={() => setTarget(row)}><FileText size={14} aria-hidden />{row.reports.length} 份报告</button> : <span className="text-slate-400">未上传</span>}</td>}
            <td className="record-long-text">{(kind === 'safety-inspections' ? row.rectification : row.result) || '—'}</td>
          </tr>) : <tr><td colSpan={config.columns.length} className="!py-14 text-center text-slate-400">{rows.length ? '没有符合条件的记录，请调整筛选。' : `暂无${config.singular}${canWrite ? '，点击右上角新增。' : '。'}`}</td></tr>}</tbody>
        </AlignedTable>
      </div>}
      <div className="record-pagination"><span>第 {current} / {pages} 页</span><div className="flex gap-2"><button className="btn-secondary" disabled={current <= 1 || loading} onClick={() => setPage(current - 1)}>上一页</button><button className="btn-secondary" disabled={current >= pages || loading} onClick={() => setPage(current + 1)}>下一页</button></div></div>
    </section>
    {target && <RecordModal key={target === 'new' ? 'new' : target.id} kind={kind} initial={target} canWrite={canWrite} onClose={() => setTarget(null)} onChanged={() => void load()} />}
  </div>
}

function RecordModal({ kind, initial, canWrite, onClose, onChanged }: { kind: BusinessKind; initial: BusinessRecord | 'new'; canWrite: boolean; onClose: () => void; onChanged: () => void }) {
  const config = CONFIG[kind]
  const [record, setRecord] = useState<BusinessRecord | null>(initial === 'new' ? null : initial)
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(config.fields.map(field => [field.key, initial === 'new' ? '' : field.key === 'amount' && kind === 'safety-inspections' ? yuanToWan(initial.amount) : String(initial[field.key as keyof BusinessRecord] ?? '')])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reportDelete, setReportDelete] = useState<number | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [fileKey, setFileKey] = useState(0)
  const [preview, setPreview] = useState<{ source: string; fileName: string } | null>(null)

  function normalizeAmount() {
    // Validate before scheduling an updater: React can run state updaters later,
    // outside a surrounding try/catch, so an invalid amount must never throw there.
    try {
      const normalized = kind === 'safety-inspections' ? wanToYuan(form.amount) : normalizeMoney(form.amount) || ''
      setForm(previous => ({ ...previous, amount: kind === 'safety-inspections' ? yuanToWan(normalized) : normalized || '' }))
      setError('')
    } catch (e) { setError((e as Error).message) }
  }

  async function upload(id: number) {
    // Remove each successful upload from the pending queue so a retry never duplicates it.
    for (const file of files) {
      const data = new FormData(); data.set('file', file)
      const response = await apiFetch(`/api/${kind}/${id}/reports`, { method: 'POST', body: data })
      const report = await response.json()
      setRecord(previous => previous ? { ...previous, reports: [...(previous.reports || []), report] } : previous)
      setFiles(previous => previous.filter(pending => pending !== file))
    }
    setFileKey(previous => previous + 1)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try { if (kind === 'safety-inspections') wanToYuan(form.amount); else normalizeMoney(form.amount) } catch (e) { setError((e as Error).message); return }
    setBusy(true)
    try {
      const response = await apiFetch(`/api/${kind}${record ? `/${record.id}` : ''}`, { method: record ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, amount: kind === 'safety-inspections' ? wanToYuan(form.amount) : form.amount }) })
      const saved = await response.json() as BusinessRecord
      setRecord(saved)
      try { await upload(saved.id) } catch (e) {
        setError(`记录已保存，报告上传未完成：${(e as Error).message}。可再次保存以重试。`)
        onChanged(); return
      }
      onChanged(); toast('保存成功', 'success'); onClose()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!record) return
    setBusy(true); setError('')
    try {
      await apiFetch(`/api/${kind}/${record.id}`, { method: 'DELETE' })
      onChanged(); toast('已删除', 'success'); onClose()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  async function removeReport(id: number) {
    if (!record) return
    setBusy(true); setError('')
    try {
      await apiFetch(`/api/${kind}/${record.id}/reports?report=${id}`, { method: 'DELETE' })
      setRecord({ ...record, reports: record.reports?.filter(report => report.id !== id) }); setReportDelete(null); onChanged()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return <><Modal title={`${record ? config.singular + '详情' : '新增' + config.singular}`} onClose={() => { if (!busy) onClose() }} size="lg">
    <form onSubmit={save} className="p-6 space-y-5">
      <div className="record-form-grid">{config.fields.map(field => <label key={field.key} className={`record-field ${field.options ? <select id={`record-${field.key}`} className="input-refined" value={form[field.key]} disabled={!canWrite || busy} onChange={e => setForm({ ...form, [field.key]: e.target.value })}><option value="">请选择</option>{form[field.key] && !field.options.includes(form[field.key]) && <option value={form[field.key]}>{form[field.key]}（历史值）</option>}{field.options.map(option => <option key={option}>{option}</option>)}</select> : field.type === 'textarea' ? 'sm:col-span-2' : ''}`} htmlFor={`record-${field.key}`}>
        <span>{field.label}{field.type === 'money' ? (kind === 'safety-inspections' ? '（万元）' : '（元）') : ''}{field.required && <span className="text-red-500"> *</span>}</span>
        {field.type === 'textarea' ? <textarea id={`record-${field.key}`} className="input-refined min-h-24 resize-y" value={form[field.key]} disabled={!canWrite || busy} maxLength={10000} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />
          : <input id={`record-${field.key}`} className={`input-refined ${field.type === 'money' ? 'text-right tabular-nums' : ''}`} type={field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'money' ? 'decimal' : undefined} required={field.required} maxLength={field.type === 'money' ? 18 : 200} value={form[field.key]} disabled={!canWrite || busy} placeholder={field.type === 'money' ? '0.00' : undefined} onBlur={field.type === 'money' ? normalizeAmount : undefined} onChange={e => setForm({ ...form, [field.key]: e.target.value })} />}
      </label>)}</div>
      {kind === 'safety-inspections' && <section className="record-reports" aria-labelledby="report-heading">
        <h3 id="report-heading" className="text-sm font-semibold mb-3">检查报告</h3>
        {record?.reports?.length ? <ul className="space-y-3">{record.reports.map(report => <li key={report.id} className="record-report-row">
          <div className="min-w-0"><p className="text-sm break-all">{report.fileName}</p><p className="text-xs text-slate-500">{(report.fileSize / 1024).toFixed(1)} KB</p></div>
          <div className="flex items-center gap-3 shrink-0"><button type="button" className="record-name" onClick={() => setPreview({ source: `/api/${kind}/${record.id}/reports?report=${report.id}&inline=1`, fileName: report.fileName })}>查看</button><a className="record-name" href={`/api/${kind}/${record.id}/reports?report=${report.id}`} aria-label={`下载 ${report.fileName}`}><Download size={16} aria-hidden /></a>{canWrite && <button type="button" className="text-red-500" disabled={busy} onClick={() => setReportDelete(report.id)} aria-label={`删除 ${report.fileName}`}><Trash2 size={16} aria-hidden /></button>}</div>
          {reportDelete === report.id && <div className="record-inline-confirm"><span>删除此报告？</span><button type="button" disabled={busy} className="text-red-600" onClick={() => void removeReport(report.id)}>确认删除</button><button type="button" disabled={busy} onClick={() => setReportDelete(null)}>取消</button></div>}
        </li>)}</ul> : <p className="text-sm text-slate-400">尚未上传报告</p>}
        {canWrite && <div className="mt-4"><label htmlFor="record-files" className="block text-xs text-slate-500 mb-2">添加报告 · 支持 PDF、图片、Word、Excel、TXT，每份不超过 20 MB</label><input key={fileKey} id="record-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt" disabled={busy} className="input-refined text-xs" onChange={e => {
          const selected = Array.from(e.target.files || [])
          if (selected.some(file => file.size > 20 * 1024 * 1024 || !file.size)) { setError('请选择非空文件，每份不能超过 20 MB'); e.target.value = ''; setFiles([]); return }
          setFiles(selected); setError('')
        }} />{files.length > 0 && <p className="text-xs text-slate-500 mt-2">{files.length} 份报告将在保存时上传</p>}</div>}
      </section>}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {confirmDelete && <div className="record-inline-confirm" role="alert"><span>确认删除“{form[config.name]}”？{kind === 'safety-inspections' ? '关联报告也会删除。' : ''}此操作无法撤销。</span><button type="button" className="btn-secondary text-red-600" disabled={busy} onClick={() => void remove()}>确认删除</button><button type="button" className="btn-ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</button></div>}
      <div className="record-form-actions">
        <div>{canWrite && record && !confirmDelete && <button type="button" className="btn-ghost text-red-600" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={15} aria-hidden />删除{config.singular}</button>}</div>
        <div className="flex gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>{canWrite ? '取消' : '关闭'}</button>{canWrite && <button type="submit" className="btn-primary" disabled={busy || confirmDelete}>{busy && <Spinner size={14} />}{busy ? '正在处理…' : '保存'}</button>}</div>
      </div>
    </form>
  </Modal>
    {preview && <AttachmentPreview key={preview.source} {...preview} onClose={() => setPreview(null)} />}
  </>
}
