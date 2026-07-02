'use client'

// 人员证件管理 — 编排层
// 关注点分布：
//   - 领域/派生数据 → @/lib/personnel/{types,precompute,filter,exporter,api}
//   - UI 原件      → @/components/MultiSelect
//   - 4 个模态框    → ./_components/*
// 本文件只负责：data state、filters state、table/filter/stats/pagination 的 JSX 编排

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from '@/components/toast'
import { MultiSelect } from '@/components/MultiSelect'
import { TableRowSkeleton } from '@/components/Skeleton'
import { statusLabel, type CertStatusKey } from '@/lib/cert-status'
import { isValidIdCard } from '@/lib/idcard'
import { personnelApi } from '@/lib/personnel/api'
import {
  buildDropdownOptions,
  buildPrecomputedMaps,
} from '@/lib/personnel/precompute'
import {
  derivePersonnelView,
  hasAnyFilter,
  type PersonnelView,
} from '@/lib/personnel/filter'
import {
  downloadImportTemplate,
  exportPersonnelExcel,
  parseExcelRows,
} from '@/lib/personnel/exporter'
import type { FilterState, Person } from '@/lib/personnel/types'

import { AddPersonModal }        from './_components/AddPersonModal'
import { EditPersonModal }       from './_components/EditPersonModal'
import { ImportPreviewModal, type ImportPreviewData } from './_components/ImportPreviewModal'
import { BulkSocialModal }       from './_components/BulkSocialModal'

// 静态查表：避免 JSX 每行重算三元链
const STATUS_BADGE_CLASS: Record<CertStatusKey, string> = {
  expired: 'badge-red',
  urgent:  'badge-orange',
  warning: 'badge-amber',
  ok:      'badge-green',
  none:    'badge-slate',
}

// 到期日期按紧急程度着色（比状态列更快扫到问题行）
const EXPIRY_TEXT_CLASS: Record<CertStatusKey, string> = {
  expired: 'text-red-500 font-semibold',
  urgent:  'text-orange-500 font-semibold',
  warning: 'text-amber-600',
  ok:      'text-slate-500',
  none:    'text-slate-400',
}

// 姓名首字头像的柔和配色（按 id 取模，稳定不闪变）
const AVATAR_CLASSES = [
  'bg-amber-100 text-amber-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-slate-200 text-slate-600',
]

const PAGE_SIZE = 50

function StatDot({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {label} <span className="font-semibold text-slate-700 tabular-nums">{n}</span>
    </span>
  )
}

export default function PersonnelPage() {
  // === 数据 ===
  const [people, setPeople]   = useState<Person[]>([])
  const [loading, setLoading] = useState(true)

  // === 模态/确认态（modal 的 form state 全部下沉到 modal 内部，这里只管开关）===
  const [showAdd, setShowAdd]               = useState(false)
  const [editPerson, setEditPerson]         = useState<Person | null>(null)
  const [showBulk, setShowBulk]             = useState(false)
  const [importPreview, setImportPreview]   = useState<ImportPreviewData | null>(null)
  const [importMsg, setImportMsg]           = useState('')
  const [confirmDel, setConfirmDel]         = useState<number | null>(null)
  const [confirmDelCert, setConfirmDelCert] = useState<number | null>(null)
  const [confirmExtCert, setConfirmExtCert] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // === 筛选 ===
  const [fOrg,        setFOrg]        = useState('')
  const [fManager,    setFManager]    = useState('')
  const [fName,       setFName]       = useState('')
  const [fEducation,  setFEducation]  = useState('')
  const [fAge,        setFAge]        = useState('')
  const [fSocial,     setFSocial]     = useState('')
  const [fCertType,   setFCertType]   = useState<string[]>([])
  const [fCertStatus, setFCertStatus] = useState('')

  const [showStats, setShowStats] = useState(true)
  const [page, setPage]           = useState(1)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  // 「转入转出登记」跳转过来时的添加预填
  const [addPrefill, setAddPrefill] = useState<Record<string, string> | null>(null)

  // 任何筛选变化都重置到第一页
  useEffect(() => { setPage(1) }, [fOrg, fManager, fName, fEducation, fAge, fSocial, fCertType, fCertStatus])

  // 接收登记页跳转指令：?add=1&name=..（打开添加弹窗并预填）或 ?search=..（按姓名筛选）
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    let consumed = false
    if (q.get('add') === '1') {
      const pre: Record<string, string> = {}
      for (const k of ['name', 'orgName', 'manager', 'idCard'] as const) {
        const v = q.get(k)
        if (v) pre[k] = v
      }
      setAddPrefill(pre)
      setShowAdd(true)
      consumed = true
    }
    const search = q.get('search')
    if (search) { setFName(search); consumed = true }
    // 清掉 query，避免刷新/返回时重复触发
    if (consumed) window.history.replaceState(null, '', '/personnel')
  }, [])

  // === 数据加载 ===
  async function load() {
    setLoading(true)
    try {
      const data = await personnelApi.list()
      setPeople(Array.isArray(data) ? data : [])
    } catch {
      setPeople([])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // === 派生数据（precompute → filter → page）===
  const maps = useMemo(() => buildPrecomputedMaps(people), [people])
  const dropdowns = useMemo(() => buildDropdownOptions(people), [people])

  const filters: FilterState = useMemo(() => ({
    org: fOrg, manager: fManager, name: fName, education: fEducation,
    age: fAge, social: fSocial, certTypes: fCertType, certStatus: fCertStatus,
  }), [fOrg, fManager, fName, fEducation, fAge, fSocial, fCertType, fCertStatus])

  const view: PersonnelView = useMemo(
    () => derivePersonnelView(people, filters, maps),
    [people, filters, maps],
  )
  const { filtered, flatRows, certStats, totalCerts } = view

  const totalPages = Math.max(1, Math.ceil(flatRows.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const pagedRows = useMemo(
    () => flatRows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [flatRows, pageSafe],
  )

  const hasFilter = hasAnyFilter(filters)

  // === 行内操作（modal 之外的轻量动作）===
  async function deletePerson(id: number) {
    try {
      await personnelApi.remove(id)
      toast('已删除人员', 'success')
      setConfirmDel(null); load()
    } catch { /* toast 已弹 */ }
  }

  async function extendOneCert(personId: number, certId: number) {
    try {
      await personnelApi.extendCert(personId, certId)
      toast('已延期', 'success')
      setConfirmExtCert(null); load()
    } catch { /* toast 已弹 */ }
  }

  async function deleteOneCert(personId: number, certId: number) {
    try {
      await personnelApi.deleteCert(personId, certId)
      toast('已删除证件', 'success')
      setConfirmDelCert(null); load()
    } catch { /* toast 已弹 */ }
  }

  // === Excel 导入（解析 + 预览在 parent，落库在 modal）===
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportMsg('')
    try {
      const rows = await parseExcelRows(file)
      if (rows.length === 0) { toast('文件没有数据', 'error'); return }
      const col = (r: Record<string, string>, ...ks: string[]) => {
        for (const k of ks) { const v = String(r[k] ?? '').trim(); if (v) return v }
        return ''
      }
      const existIds = new Set(people.map(p => (p.idCard || '').trim()).filter(Boolean))
      let newCount = 0, existCount = 0, invalidId = 0, noName = 0
      const sample: ImportPreviewData['sample'] = []
      rows.forEach((r, i) => {
        const name = col(r, '姓名', '名字', 'name')
        const idCard = col(r, '身份证号', '身份证', '身份证号码')
        let status = '', issue = ''
        if (!name) { noName++; status = '缺姓名'; issue = '将跳过' }
        else if (idCard && existIds.has(idCard)) { existCount++; status = '已存在' }
        else { newCount++; status = '新增' }
        if (name && idCard && !isValidIdCard(idCard)) { invalidId++; issue = issue ? issue + '；身份证校验失败' : '身份证校验失败' }
        if (sample.length < 300) sample.push({ row: i + 2, name: name || '(空)', idCard, status, issue })
      })
      setImportPreview({ rows, total: rows.length, newCount, existCount, invalidId, noName, sample })
    } catch {
      toast('解析失败，请检查文件格式', 'error')
    }
  }

  const exportExcel = () => exportPersonnelExcel(flatRows, maps)

  function resetFilters() {
    setFOrg(''); setFManager(''); setFName(''); setFEducation('')
    setFAge(''); setFSocial(''); setFCertType([]); setFCertStatus('')
  }

  return (
    <div>
      {/* 页头 */}
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">人员证件管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">共 {people.length} 人 · 已筛选 {filtered.length} 人</p>
        </div>
        <div className="self-center flex flex-wrap items-center gap-2">
          {importMsg && <span role="status" className="text-xs text-slate-500 bg-slate-100 rounded-md px-2.5 py-1">{importMsg}</span>}
          <button onClick={downloadImportTemplate} className="btn-secondary !py-2 !px-3 !text-xs">
            下载模板
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="btn-secondary !py-2 !px-3 !text-xs">
            Excel 导入
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          <button onClick={exportExcel} className="btn-secondary !py-2 !px-3 !text-xs">
            导出 Excel
          </button>
          <button onClick={() => setShowBulk(true)} className="btn-secondary !py-2 !px-3 !text-xs">
            批量更新社保
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary !py-2 !px-4 !text-sm">
            + 添加人员
          </button>
        </div>
      </div>

      {/* 筛选栏 — 常用条件一行，低频条件折叠进「更多」 */}
      <div className="filter-bar">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">姓名</label>
            <input value={fName} onChange={e => setFName(e.target.value)} placeholder="输入关键字…"
              className="input-refined !py-1.5 !px-2.5 !text-xs" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">归属建制</label>
            <input value={fOrg} onChange={e => setFOrg(e.target.value)} placeholder="输入关键字…"
              className="input-refined !py-1.5 !px-2.5 !text-xs" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">负责人</label>
            <input value={fManager} onChange={e => setFManager(e.target.value)} placeholder="输入关键字…"
              className="input-refined !py-1.5 !px-2.5 !text-xs" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">证件类别</label>
            <MultiSelect options={dropdowns.certTypes} selected={fCertType} onChange={setFCertType} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">证件状态</label>
            <select value={fCertStatus} onChange={e => setFCertStatus(e.target.value)}
              className="input-refined !py-1.5 !px-2.5 !text-xs">
              <option value="">全部</option>
              <option value="expired">已过期</option>
              <option value="urgent">紧急（30天内）</option>
              <option value="warning">预警（90天内）</option>
              <option value="ok">正常</option>
              <option value="none">无证件</option>
            </select>
          </div>
        </div>

        {showMoreFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">学历</label>
              <select value={fEducation} onChange={e => setFEducation(e.target.value)}
                className="input-refined !py-1.5 !px-2.5 !text-xs">
                <option value="">全部</option>
                {dropdowns.educations.map(ed => <option key={ed} value={ed}>{ed}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">年龄</label>
              <select value={fAge} onChange={e => setFAge(e.target.value)}
                className="input-refined !py-1.5 !px-2.5 !text-xs">
                <option value="">全部</option>
                <option value="30-">30岁及以下</option>
                <option value="31-40">31-40岁</option>
                <option value="41-50">41-50岁</option>
                <option value="51-60">51-60岁</option>
                <option value="60+">60岁以上</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">社保情况</label>
              <select value={fSocial} onChange={e => setFSocial(e.target.value)}
                className="input-refined !py-1.5 !px-2.5 !text-xs">
                <option value="">全部</option>
                {dropdowns.socials.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mt-3">
          <button onClick={() => setShowMoreFilters(v => !v)}
            className="text-xs text-slate-400 hover:text-slate-600 font-medium inline-flex items-center gap-1">
            {showMoreFilters ? '收起' : '更多筛选'}
            <svg className={`w-3 h-3 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            {!showMoreFilters && (fEducation || fAge || fSocial) && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="有生效的隐藏筛选" />
            )}
          </button>
          {hasFilter && (
            <button onClick={resetFilters}
              className="text-xs text-amber-500 hover:text-amber-600 font-medium">
              清除所有筛选
            </button>
          )}
        </div>
      </div>

      {/* 证件统计 */}
      {!loading && totalCerts > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="section-label !mb-0">
              <div className="section-label-bar" />
              <span className="section-label-text">证件统计{hasFilter ? '（已筛选）' : ''} · 共 {totalCerts} 张</span>
            </div>
            <button onClick={() => setShowStats(s => !s)} className="text-xs text-slate-400 hover:text-slate-600 font-medium">
              {showStats ? '收起 ▲' : '展开 ▼'}
            </button>
          </div>

          {showStats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {certStats.map(s => {
                const pct = totalCerts ? Math.round((s.total / totalCerts) * 100) : 0
                return (
                  <div key={s.type} className="card-elevated p-4 transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-700 truncate" title={s.type}>{s.type}</span>
                      <span className="text-[11px] font-medium text-slate-400 tabular-nums shrink-0">{pct}%</span>
                    </div>
                    <div className="flex items-baseline gap-1 mt-1.5">
                      <span className="text-[26px] font-bold text-slate-900 tabular-nums leading-none">{s.total}</span>
                      <span className="text-[11px] text-slate-400 ml-0.5">张</span>
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100 mt-3 gap-px">
                      {s.ok > 0      && <div style={{ flexGrow: s.ok }}      className="bg-emerald-400" />}
                      {s.warning > 0 && <div style={{ flexGrow: s.warning }} className="bg-amber-400" />}
                      {s.urgent > 0  && <div style={{ flexGrow: s.urgent }}  className="bg-orange-400" />}
                      {s.expired > 0 && <div style={{ flexGrow: s.expired }} className="bg-red-500" />}
                      {s.none > 0    && <div style={{ flexGrow: s.none }}    className="bg-slate-300" />}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
                      {s.ok > 0      && <StatDot color="bg-emerald-400" label="正常" n={s.ok} />}
                      {s.warning > 0 && <StatDot color="bg-amber-400"   label="预警" n={s.warning} />}
                      {s.urgent > 0  && <StatDot color="bg-orange-400"  label="紧急" n={s.urgent} />}
                      {s.expired > 0 && <StatDot color="bg-red-500"     label="过期" n={s.expired} />}
                      {s.none > 0    && <StatDot color="bg-slate-300"   label="无日期" n={s.none} />}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 表格 */}
      {loading ? (
        <div className="card-elevated overflow-hidden" role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">数据加载中…</span>
          <div className="overflow-x-auto">
            <table className="w-full table-premium">
              <thead>
                <tr>
                  {['序号','归属建制','负责人','姓名','身份证号','年龄','学历','社保情况','证件类别','证件编号','有效期','证书状态','操作'].map(h => (
                    <th key={h} scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableRowSkeleton cols={13} count={8} />
              </tbody>
            </table>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-14 text-center" role="status">
          <svg className="w-11 h-11 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
          </svg>
          <div className="text-sm font-semibold text-slate-600">
            {people.length === 0 ? '暂无人员' : '没有符合条件的人员'}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            {people.length === 0 ? (
              <>
                <button onClick={() => setShowAdd(true)} className="text-xs text-amber-500 hover:text-amber-600 font-semibold">+ 添加第一个人员</button>
                <span className="text-slate-200">|</span>
                <button onClick={() => fileRef.current?.click()} className="text-xs text-slate-400 hover:text-slate-600 font-medium">导入 Excel</button>
              </>
            ) : (
              <button onClick={resetFilters} className="text-xs text-amber-500 hover:text-amber-600 font-semibold">清除所有筛选</button>
            )}
          </div>
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full table-premium">
            <caption className="sr-only">
              人员证件列表 — 第 {(pageSafe - 1) * PAGE_SIZE + 1} 至 {Math.min(pageSafe * PAGE_SIZE, flatRows.length)} 行，共 {flatRows.length} 行
            </caption>
            <thead>
              <tr>
                {['序号','归属建制','负责人','姓名','身份证号','年龄','学历','社保情况','证件类别','证件编号','有效期','证书状态','操作'].map(h => (
                  <th key={h} scope="col">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, i) => {
                const { person: p, cert: c } = row
                const age = maps.ageMap.get(p.id) ?? null
                const st: CertStatusKey = c ? (maps.certStatusMap.get(c.id) ?? 'none') : 'none'
                return (
                  <tr key={`${p.id}-${c?.id ?? 'no'}`}>
                    <td className="text-slate-400 text-xs text-center tabular-nums">{(pageSafe - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="text-xs">{p.orgName || '—'}</td>
                    <td className="text-xs">{p.manager || '—'}</td>
                    <td className="font-medium text-slate-800">
                      <Link href={`/personnel/${p.id}`} className="inline-flex items-center gap-2 hover:text-amber-600 group">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10.5px] font-bold flex-shrink-0 ${AVATAR_CLASSES[p.id % AVATAR_CLASSES.length]}`} aria-hidden="true">
                          {p.name[0]}
                        </span>
                        <span className="group-hover:underline">{p.name}</span>
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-slate-500">{p.idCard || '—'}</td>
                    <td className="text-xs text-center">{age !== null ? age : '—'}</td>
                    <td className="text-xs">{p.education || '—'}</td>
                    <td className="text-xs">{p.socialSecurity || '—'}</td>
                    <td className="text-xs max-w-[140px] truncate" title={c?.certType || ''}>{c?.certType || '—'}</td>
                    <td className="text-xs max-w-[140px] truncate" title={c?.certNo || ''}>{c?.certNo || '—'}</td>
                    <td className={`text-xs tabular-nums ${EXPIRY_TEXT_CLASS[st]}`}>{c?.expiryDate || '—'}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE_CLASS[st]}`}>
                        {statusLabel[st]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditPerson(p)} className="text-xs text-emerald-500 hover:text-emerald-600 font-medium whitespace-nowrap">编辑</button>
                        <Link href={`/personnel/${p.id}`} className="text-xs text-amber-500 hover:text-amber-600 font-medium whitespace-nowrap">证件管理</Link>
                        {c ? (
                          <>
                            {confirmExtCert === c.id ? (
                              <>
                                <button onClick={() => extendOneCert(p.id, c.id)} className="text-xs text-blue-600 font-semibold whitespace-nowrap">确认延期</button>
                                <button onClick={() => setConfirmExtCert(null)} className="text-xs text-slate-400">取消</button>
                              </>
                            ) : (
                              <button onClick={() => setConfirmExtCert(c.id)} className="text-xs text-blue-500 hover:text-blue-600 font-medium whitespace-nowrap">延期</button>
                            )}
                            {confirmDelCert === c.id ? (
                              <>
                                <button onClick={() => deleteOneCert(p.id, c.id)} className="text-xs text-red-500 font-semibold">确认</button>
                                <button onClick={() => setConfirmDelCert(null)} className="text-xs text-slate-400">取消</button>
                              </>
                            ) : (
                              <button onClick={() => setConfirmDelCert(c.id)} className="text-xs text-slate-400 hover:text-red-500">删除证件</button>
                            )}
                          </>
                        ) : (
                          confirmDel === p.id ? (
                            <>
                              <button onClick={() => deletePerson(p.id)} className="text-xs text-red-500 font-semibold">确认删除人员</button>
                              <button onClick={() => setConfirmDel(null)} className="text-xs text-slate-400">取消</button>
                            </>
                          ) : (
                            <button onClick={() => setConfirmDel(p.id)} className="text-xs text-slate-400 hover:text-red-500">删除人员</button>
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
        </div>
      )}

      {/* 分页 */}
      {!loading && flatRows.length > PAGE_SIZE && (
        <nav aria-label="分页" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-4">
          <span className="text-xs text-slate-400" aria-live="polite">
            第 {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, flatRows.length)} 条 · 共 {flatRows.length} 条
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageSafe <= 1}
              aria-label="上一页"
              className="btn-secondary !py-1.5 !px-3 !text-xs disabled:opacity-40">上一页</button>
            <span className="text-xs text-slate-500 tabular-nums" aria-current="page">{pageSafe} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages}
              aria-label="下一页"
              className="btn-secondary !py-1.5 !px-3 !text-xs disabled:opacity-40">下一页</button>
          </div>
        </nav>
      )}

      {/* 模态框：state 全部在 modal 内部，parent 只控开关 + 接收完成事件 */}
      {showAdd && (
        <AddPersonModal
          initial={addPrefill ?? undefined}
          onClose={() => { setShowAdd(false); setAddPrefill(null) }}
          onSaved={load}
        />
      )}

      {editPerson && (
        <EditPersonModal
          person={editPerson}
          onClose={() => setEditPerson(null)}
          onSaved={load}
        />
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          onClose={() => setImportPreview(null)}
          onComplete={msg => { setImportMsg(msg); load() }}
        />
      )}

      {showBulk && (
        <BulkSocialModal
          onClose={() => setShowBulk(false)}
          onSynced={load}
        />
      )}
    </div>
  )
}
