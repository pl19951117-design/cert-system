'use client'

// 人员证件管理 — 编排层
// 关注点分布：
//   - 领域/派生数据 → @/lib/personnel/{types,precompute,filter,exporter,api}
//   - UI 原件      → @/components/MultiSelect
//   - 4 个模态框    → ./_components/*
// 本文件只负责：data state、filters state、table/filter/stats/pagination 的 JSX 编排

import { AlignedTable } from '@/components/aligned-table'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, Download, FileDown, FileUp, Plus, RefreshCw, Users } from 'lucide-react'
import { ActionMenu } from '@/components/action-menu'
import { toast } from '@/components/toast'
import { apiFetch } from '@/lib/api'
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
import type { FilterState, FlatRow, Person } from '@/lib/personnel/types'

import { AddPersonModal }        from './_components/AddPersonModal'
import { EditPersonModal }       from './_components/EditPersonModal'
import { ImportPreviewModal, type ImportPreviewData } from './_components/ImportPreviewModal'
import { BulkSocialModal }       from './_components/BulkSocialModal'
import { PersonDrawer }          from './_components/PersonDrawer'
import { groupRowsByOrg } from '@/lib/personnel/grouping'
import { ADD_PERSON_EVENT, OPEN_PERSON_EVENT } from '@/components/command-palette'

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

// Avatars use the shared neutral/brand palette rather than decorative colors.

const PAGE_SIZE = 50
// 分组视图：数据量超过这个行数且没有筛选时，默认把各建制收起（先看全局，再按需展开）
const AUTO_COLLAPSE_ROWS = 200

const COLUMNS = ['序号','归属建制','负责人','姓名','身份证号','年龄','学历','工程师','社保情况','证件类别','证件编号','有效期','证书状态','操作']

type ViewMode = 'grouped' | 'flat'

function subscribeToViewMode(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === 'personnel-view' || event.key === null) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}

function getSavedViewMode(): ViewMode {
  try { return localStorage.getItem('personnel-view') === 'flat' ? 'flat' : 'grouped' } catch { return 'grouped' }
}

const getServerViewMode = (): ViewMode => 'grouped'

function StatDot({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
      <span className={`w-1 h-1 rounded-full ${color}`} />
      {label}<span className="font-semibold text-slate-700 tabular-nums ml-0.5">{n}</span>
    </span>
  )
}

export default function PersonnelPage() {
  const searchParams = useSearchParams()
  // URL 指令只在本次挂载初始化时消费；清理 URL 不会清空已经填写的表单/筛选。
  const [initialCommand] = useState(() => {
    const add = searchParams.get('add') === '1'
    const prefill: Record<string, string> = {}
    if (add) {
      for (const key of ['name', 'orgName', 'manager', 'idCard'] as const) {
        const value = searchParams.get(key)
        if (value) prefill[key] = value
      }
    }
    const search = searchParams.get('search') || ''
    const candidate = Number(searchParams.get('open'))
    const personId = Number.isInteger(candidate) && candidate > 0 ? candidate : null
    return { add, prefill: add ? prefill : null, search, personId, consumed: add || !!search || personId !== null }
  })

  // === 数据 ===
  const [people, setPeople]   = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // === 模态/确认态（modal 的 form state 全部下沉到 modal 内部，这里只管开关）===
  const [showAdd, setShowAdd]               = useState(initialCommand.add)
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
  const [fName,       setFName]       = useState(initialCommand.search)
  const [fEducation,  setFEducation]  = useState('')
  const [fEngineer,   setFEngineer]   = useState('')
  const [fAge,        setFAge]        = useState('')
  const [fSocial,     setFSocial]     = useState('')
  const [fCertType,   setFCertType]   = useState<string[]>([])
  const [fCertStatus, setFCertStatus] = useState('')

  const [showStats, setShowStats] = useState(false)
  const [page, setPage]           = useState(1)
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [regrouping, setRegrouping] = useState(false)
  // 「转入转出登记」跳转过来时的添加预填
  const [addPrefill, setAddPrefill] = useState<Record<string, string> | null>(initialCommand.prefill)
  // 右侧详情抽屉
  const [drawerId, setDrawerId] = useState<number | null>(initialCommand.personId)

  // 视图：按建制分组 / 平铺列表（记住用户的选择）
  const savedViewMode = useSyncExternalStore(subscribeToViewMode, getSavedViewMode, getServerViewMode)
  const [viewChoice, setViewChoice] = useState<ViewMode | null>(null)
  const viewMode = viewChoice ?? savedViewMode
  function switchView(m: ViewMode) {
    setViewChoice(m)
    try { localStorage.setItem('personnel-view', m) } catch { /* 忽略 */ }
  }
  // 分组展开状态：'auto' 由数据量决定；用户点「全部展开/收起」或单组切换后记录覆盖值
  const [groupMode, setGroupMode] = useState<'auto' | 'open' | 'closed'>('auto')
  const [groupOverrides, setGroupOverrides] = useState<Map<string, boolean>>(new Map())

  // 筛选事件与分页/分组重置一起提交，避免先渲染旧页再用 effect 纠正。
  function resetFilterView() {
    setPage(1)
    setGroupMode('auto')
    setGroupOverrides(new Map())
  }

  function changeFilter<T>(setValue: React.Dispatch<React.SetStateAction<T>>, value: T) {
    setValue(value)
    resetFilterView()
  }

  // 接收登记页跳转指令：?add=1&name=..（打开添加弹窗并预填）或 ?search=..（按姓名筛选）
  useEffect(() => {
    // 清掉 query，避免刷新/返回时重复触发
    if (initialCommand.consumed) window.history.replaceState(null, '', '/personnel')
  }, [initialCommand])

  // 全局搜索（Ctrl+K）在本页选中人员 / 「添加人员」时，直接响应，无需跳转
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<number>).detail
      if (typeof id === 'number') setDrawerId(id)
    }
    const onAdd = () => setShowAdd(true)
    window.addEventListener(OPEN_PERSON_EVENT, onOpen)
    window.addEventListener(ADD_PERSON_EVENT, onAdd)
    return () => {
      window.removeEventListener(OPEN_PERSON_EVENT, onOpen)
      window.removeEventListener(ADD_PERSON_EVENT, onAdd)
    }
  }, [])

  // === 数据加载 ===
  async function load() {
    setLoading(true)
    setLoadError(false)
    try {
      const data = await personnelApi.list()
      setPeople(Array.isArray(data) ? data : [])
    } catch {
      setLoadError(true)
    }
    setLoading(false)
  }
  useEffect(() => {
    let active = true
    personnelApi.list()
      .then(data => { if (active) setPeople(Array.isArray(data) ? data : []) })
      .catch(() => { if (active) setLoadError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  // === 派生数据（precompute → filter → page）===
  const maps = useMemo(() => buildPrecomputedMaps(people), [people])
  const dropdowns = useMemo(() => buildDropdownOptions(people), [people])

  const filters: FilterState = useMemo(() => ({
    org: fOrg, manager: fManager, name: fName, education: fEducation, engineer: fEngineer,
    age: fAge, social: fSocial, certTypes: fCertType, certStatus: fCertStatus,
  }), [fOrg, fManager, fName, fEducation, fEngineer, fAge, fSocial, fCertType, fCertStatus])

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

  const groups = useMemo(
    () => (viewMode === 'grouped' ? groupRowsByOrg(flatRows, maps.certStatusMap) : []),
    [viewMode, flatRows, maps],
  )
  const defaultOpen =
    groupMode === 'open' ? true
    : groupMode === 'closed' ? false
    : hasFilter || flatRows.length <= AUTO_COLLAPSE_ROWS
  const isGroupOpen = (org: string) => groupOverrides.get(org) ?? defaultOpen
  function toggleGroup(org: string) {
    setGroupOverrides(prev => {
      const next = new Map(prev)
      next.set(org, !(prev.get(org) ?? defaultOpen))
      return next
    })
  }
  function setAllGroups(open: boolean) {
    setGroupMode(open ? 'open' : 'closed')
    setGroupOverrides(new Map())
  }
  const openGroupCount = groups.filter(g => isGroupOpen(g.org)).length

  const drawerPerson = drawerId !== null ? people.find(p => p.id === drawerId) ?? null : null

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

  /** 一键把同建制、同负责人的人员重排到一起 */
  async function regroup() {
    setRegrouping(true)
    try {
      const res = await apiFetch('/api/personnel/regroup', { method: 'POST' })
      const r = await res.json() as { total: number; moved: number }
      toast(r.moved === 0 ? '已经是归类好的顺序' : `已归类，调整了 ${r.moved} 人的位置`, 'success')
      await load()
    } catch { /* toast 已弹 */ }
    setRegrouping(false)
  }

  function resetFilters() {
    setFOrg(''); setFManager(''); setFName(''); setFEducation(''); setFEngineer('')
    setFAge(''); setFSocial(''); setFCertType([]); setFCertStatus('')
    resetFilterView()
  }

  /** 表格单行（平铺 / 分组两种视图共用）；grouped 时省略「归属建制」列 */
  function renderRow(row: FlatRow, seq: number, grouped: boolean) {
    const { person: p, cert: c } = row
    const age = maps.ageMap.get(p.id) ?? null
    const st: CertStatusKey = c ? (maps.certStatusMap.get(c.id) ?? 'none') : 'none'
    return (
      <tr key={`${p.id}-${c?.id ?? 'no'}`} className={drawerId === p.id ? '!bg-navy-50/80' : undefined}>
        <td className="text-slate-400 text-xs text-center tabular-nums">{seq}</td>
        {!grouped && <td className="text-xs">{p.orgName || '—'}</td>}
        <td className="text-xs">{p.manager || '—'}</td>
        <td className="font-medium text-slate-800">
          <button
            type="button"
            onClick={() => setDrawerId(p.id)}
            title="查看详情"
            aria-label={`查看 ${p.name} 的详情`}
            className="inline-flex items-center gap-2 hover:text-navy-700 group text-left"
          >
            <span className="group-hover:underline whitespace-nowrap">{p.name}</span>
          </button>
        </td>
        <td className="text-xs text-slate-500 tabular-nums">{p.idCard || '—'}</td>
        <td className="text-xs text-center">{age !== null ? age : '—'}</td>
        <td className="text-xs">{p.education || '—'}</td>
        <td className="text-xs">{p.engineer || '—'}</td>
        <td className="text-xs">{p.socialSecurity || '—'}</td>
        <td className="text-xs max-w-[140px] truncate" title={c?.certType || ''}>{c?.certType || '—'}</td>
        <td className="text-xs max-w-[150px] truncate" title={c?.certNo || ''}>{c?.certNo || '—'}</td>
        <td className={`text-xs tabular-nums ${EXPIRY_TEXT_CLASS[st]}`}>{c?.expiryDate || '—'}</td>
        <td>
          <span className={`badge ${STATUS_BADGE_CLASS[st]}`}>
            {statusLabel[st]}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={() => setEditPerson(p)} className="text-xs text-navy-700 hover:text-navy-900 font-medium whitespace-nowrap">编辑</button>
            <Link href={`/personnel/${p.id}`} className="text-xs text-navy-600 hover:text-navy-800 font-medium whitespace-nowrap">证件管理</Link>
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
                  <button onClick={() => setConfirmDelCert(c.id)} className="text-xs text-slate-400 hover:text-red-500 whitespace-nowrap">删除证件</button>
                )}
              </>
            ) : (
              confirmDel === p.id ? (
                <>
                  <button onClick={() => deletePerson(p.id)} className="text-xs text-red-500 font-semibold whitespace-nowrap">确认删除人员</button>
                  <button onClick={() => setConfirmDel(null)} className="text-xs text-slate-400">取消</button>
                </>
              ) : (
                <button onClick={() => setConfirmDel(p.id)} className="text-xs text-slate-400 hover:text-red-500 whitespace-nowrap">删除人员</button>
              )
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="personnel-ledger">
      {/* 页头 */}
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">人员证件管理</h1>
          <p className="text-xs text-slate-400 mt-0.5">共 {people.length} 人 · 已筛选 {filtered.length} 人</p>
        </div>
        <div className="self-center flex flex-wrap items-center gap-2">
          {importMsg && <span role="status" className="text-xs text-slate-500 bg-slate-100 rounded-md px-2.5 py-1">{importMsg}</span>}
          <ActionMenu label="数据工具">
            <button onClick={downloadImportTemplate}><FileDown size={16} aria-hidden="true" />下载导入模板</button>
            <button onClick={() => fileRef.current?.click()}><FileUp size={16} aria-hidden="true" />Excel 导入</button>
            <button onClick={exportExcel} disabled={loading || loadError || flatRows.length === 0}><Download size={16} aria-hidden="true" />导出 Excel</button>
          </ActionMenu>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          <button onClick={() => setShowBulk(true)} className="btn-secondary !py-2 !px-3 !text-xs">
            批量更新社保
          </button>
          <button
            onClick={regroup}
            disabled={regrouping}
            title="把同建制、同负责人的人员重新排到一起"
            className="btn-secondary !py-2 !px-3 !text-xs disabled:opacity-60"
          >
            {regrouping ? '整理中…' : '按建制归类'}
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary !py-2 !px-4 !text-sm">
            <Plus size={16} strokeWidth={1.7} aria-hidden="true" />添加人员
          </button>
        </div>
      </div>

      <section className="ledger-summary" aria-label="人员台账概况">
        <div><span>在册人员</span><strong>{loading || loadError ? '—' : people.length}<small>人</small></strong></div>
        <div><span>证件总数</span><strong>{loading || loadError ? '—' : people.reduce((n, person) => n + person.certificates.length, 0)}<small>本</small></strong></div>
        <div><span>归属建制</span><strong>{loading || loadError ? '—' : dropdowns.orgs.length}<small>个</small></strong></div>
        <div><span>当前筛选</span><strong>{loading || loadError ? '—' : filtered.length}<small>人</small></strong></div>
      </section>

      {/* 筛选栏 — 常用条件一行，低频条件折叠进「更多」 */}
      <div className="filter-bar">
        <div className="ledger-filter-title"><h2>筛选人员</h2><span>按姓名、建制或证件状态快速查找</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="person-f-name" className="block text-xs font-medium text-slate-500 mb-1">姓名</label>
            <input id="person-f-name" value={fName} onChange={e => changeFilter(setFName, e.target.value)} placeholder="输入姓名"
              className="input-refined !py-2 !px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="person-f-org" className="block text-xs font-medium text-slate-500 mb-1">归属建制</label>
            <input id="person-f-org" value={fOrg} onChange={e => changeFilter(setFOrg, e.target.value)} placeholder="输入建制名称"
              className="input-refined !py-2 !px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="person-f-manager" className="block text-xs font-medium text-slate-500 mb-1">负责人</label>
            <input id="person-f-manager" value={fManager} onChange={e => changeFilter(setFManager, e.target.value)} placeholder="输入负责人姓名"
              className="input-refined !py-2 !px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="person-f-type" className="block text-xs font-medium text-slate-500 mb-1">证件类别</label>
            <MultiSelect id="person-f-type" ariaLabel="证件类别" options={dropdowns.certTypes} selected={fCertType} onChange={value => changeFilter(setFCertType, value)} />
          </div>
          <div>
            <label htmlFor="person-f-status" className="block text-xs font-medium text-slate-500 mb-1">证件状态</label>
            <select id="person-f-status" value={fCertStatus} onChange={e => changeFilter(setFCertStatus, e.target.value)}
              className="input-refined !py-2 !px-3 text-sm">
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
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" htmlFor="person-more-education">学历</label>
              <select id="person-more-education" value={fEducation} onChange={e => changeFilter(setFEducation, e.target.value)}
                className="input-refined !py-2 !px-3 text-sm">
                <option value="">全部</option>
                {dropdowns.educations.map(ed => <option key={ed} value={ed}>{ed}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" htmlFor="person-more-engineer">工程师</label>
              <select id="person-more-engineer" value={fEngineer} onChange={e => changeFilter(setFEngineer, e.target.value)}
                className="input-refined !py-2 !px-3 text-sm">
                <option value="">全部</option>
                {dropdowns.engineers.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" htmlFor="person-more-age">年龄</label>
              <select id="person-more-age" value={fAge} onChange={e => changeFilter(setFAge, e.target.value)}
                className="input-refined !py-2 !px-3 text-sm">
                <option value="">全部</option>
                <option value="30-">30岁及以下</option>
                <option value="31-40">31-40岁</option>
                <option value="41-50">41-50岁</option>
                <option value="51-60">51-60岁</option>
                <option value="60+">60岁以上</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" htmlFor="person-more-social">社保情况</label>
              <select id="person-more-social" value={fSocial} onChange={e => changeFilter(setFSocial, e.target.value)}
                className="input-refined !py-2 !px-3 text-sm">
                <option value="">全部</option>
                {dropdowns.socials.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 mt-3">
          <button onClick={() => setShowMoreFilters(v => !v)}
            aria-expanded={showMoreFilters}
            className="text-xs text-slate-400 hover:text-slate-600 font-medium inline-flex items-center gap-1">
            {showMoreFilters ? '收起' : '更多筛选'}
            <svg className={`w-3 h-3 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            {!showMoreFilters && (fEducation || fEngineer || fAge || fSocial) && (
              <span className="w-1.5 h-1.5 rounded-full bg-navy-600" aria-label="有生效的隐藏筛选" />
            )}
          </button>
          {hasFilter && (
            <button onClick={resetFilters}
              className="text-xs text-navy-600 hover:text-navy-800 font-medium">
              清除所有筛选
            </button>
          )}
        </div>
      </div>

      <div className="ledger-status-tabs" role="group" aria-label="证件状态快捷筛选">
        {[{value:'',label:'全部人员'}, {value:'expired',label:'已过期'}, {value:'urgent',label:'30 天内到期'}, {value:'warning',label:'31–90 天内到期'}, {value:'none',label:'无证件'}].map(item => (
          <button key={item.value} type="button" aria-pressed={fCertStatus === item.value} onClick={() => changeFilter(setFCertStatus, item.value)}>{item.label}</button>
        ))}
      </div>

      {/* 证件统计 */}
      {!loading && totalCerts > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="section-label !mb-0">
              <div className="section-label-bar" />
              <span className="section-label-text">证件统计{hasFilter ? '（已筛选）' : ''} · 共 {totalCerts} 张</span>
            </div>
            <button onClick={() => setShowStats(s => !s)} aria-expanded={showStats} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-navy-700 font-medium">
              {showStats ? '收起分类统计' : '展开分类统计'}<ChevronDown size={14} aria-hidden="true" className={showStats ? 'rotate-180' : ''} />
            </button>
          </div>

          {showStats && (
            // auto-fit：证件类别（A/B/C1/C2/C3）自动挤进一行，窄屏才换行
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))' }}>
              {certStats.map(s => {
                const pct = totalCerts ? Math.round((s.total / totalCerts) * 100) : 0
                return (
                  <div key={s.type} className="cert-distribution-card card-elevated p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700 truncate" title={s.type}>{s.type}</span>
                      <span className="text-[10px] font-medium text-slate-400 tabular-nums shrink-0">{pct}%</span>
                    </div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-bold text-slate-900 tabular-nums leading-none">{s.total}</span>
                      <span className="text-[10px] text-slate-400">张</span>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
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
            <AlignedTable columns={COLUMNS} className="w-full table-premium table-compact">
              <thead>
                <tr>
                  {COLUMNS.map(h => (
                    <th key={h} scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TableRowSkeleton cols={COLUMNS.length} count={8} />
              </tbody>
            </AlignedTable>
          </div>
        </div>
      ) : loadError ? (
        <div className="card-elevated p-10 text-center" role="alert">
          <RefreshCw size={24} strokeWidth={1.5} className="mx-auto mb-3 text-slate-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-800">人员信息暂时无法加载</p>
          <p className="mt-1 text-xs text-slate-500">请检查连接后重试，当前筛选条件会保留。</p>
          <button className="btn-secondary mt-4" onClick={load}>重新加载</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-14 text-center" role="status">
          <Users size={32} strokeWidth={1.5} className="text-slate-400 mx-auto mb-3" aria-hidden="true" />
          <div className="text-sm font-semibold text-slate-600">
            {people.length === 0 ? '暂无人员' : '没有符合条件的人员'}
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            {people.length === 0 ? (
              <>
                <button onClick={() => setShowAdd(true)} className="text-xs text-navy-600 hover:text-navy-800 font-semibold">+ 添加第一个人员</button>
                <span className="text-slate-200">|</span>
                <button onClick={() => fileRef.current?.click()} className="text-xs text-slate-400 hover:text-slate-600 font-medium">导入 Excel</button>
              </>
            ) : (
              <button onClick={resetFilters} className="text-xs text-navy-600 hover:text-navy-800 font-semibold">清除所有筛选</button>
            )}
          </div>
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          {/* 表格工具条：视图切换 + 分组展开控制 */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--line)]">
            <div className="segmented" role="group" aria-label="表格视图">
              <button type="button" aria-pressed={viewMode === 'grouped'} onClick={() => switchView('grouped')}>按建制分组</button>
              <button type="button" aria-pressed={viewMode === 'flat'} onClick={() => switchView('flat')}>平铺列表</button>
            </div>
            {viewMode === 'grouped' ? (
              <>
                <span className="text-xs text-slate-400">
                  {groups.length} 个建制 · {filtered.length} 人 · 已展开 {openGroupCount} 个
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <button type="button" onClick={() => setAllGroups(true)} className="text-xs text-navy-600 hover:text-navy-800 font-medium">全部展开</button>
                  <span className="text-slate-200" aria-hidden="true">|</span>
                  <button type="button" onClick={() => setAllGroups(false)} className="text-xs text-navy-600 hover:text-navy-800 font-medium">全部收起</button>
                </div>
              </>
            ) : (
              <span className="text-xs text-slate-400">{flatRows.length} 行 · 每页 {PAGE_SIZE} 行</span>
            )}
          </div>

          <div className="overflow-x-auto">
          <AlignedTable columns={viewMode === 'grouped' ? COLUMNS.filter(h => h !== '归属建制') : COLUMNS} className="w-full table-premium table-compact">
            <caption className="sr-only">
              {viewMode === 'grouped'
                ? `人员证件列表，按归属建制分为 ${groups.length} 组，共 ${flatRows.length} 行`
                : `人员证件列表 — 第 ${(pageSafe - 1) * PAGE_SIZE + 1} 至 ${Math.min(pageSafe * PAGE_SIZE, flatRows.length)} 行，共 ${flatRows.length} 行`}
            </caption>
            {/* 分组全部收起时只剩组标题行，表头没有意义且会被拉散，隐藏 */}
            <thead className={viewMode === 'grouped' && openGroupCount === 0 ? 'sr-only' : undefined}>
              <tr>
                {(viewMode === 'grouped' ? COLUMNS.filter(h => h !== '归属建制') : COLUMNS).map(h => (
                  <th key={h} scope="col">{h}</th>
                ))}
              </tr>
            </thead>
            {viewMode === 'grouped' ? (
              groups.map(g => {
                const open = isGroupOpen(g.org)
                const clean = g.certs > 0 && g.expired + g.urgent + g.warning === 0
                return (
                  <tbody key={g.org}>
                    <tr className="group-row">
                      <td colSpan={COLUMNS.length - 1} className="!p-0">
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.org)}
                          aria-expanded={open}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                        >
                          <svg className={`w-3.5 h-3.5 text-navy-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          <span className="text-[13px] font-semibold text-navy-900 whitespace-nowrap">{g.org}</span>
                          <span className="text-[11.5px] text-slate-500 tabular-nums whitespace-nowrap">{g.people} 人 · {g.certs} 本</span>
                          {g.managers.length > 0 && (
                            <span className="text-[11.5px] text-slate-400 truncate min-w-0">
                              负责人：{g.managers.slice(0, 3).join('、')}{g.managers.length > 3 ? ` 等 ${g.managers.length} 人` : ''}
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                            {g.expired > 0 && <span className="badge badge-red">过期 {g.expired}</span>}
                            {g.urgent > 0  && <span className="badge badge-orange">紧急 {g.urgent}</span>}
                            {g.warning > 0 && <span className="badge badge-amber">预警 {g.warning}</span>}
                            {clean && <span className="text-[11px] font-medium text-emerald-600">✓ 均在有效期</span>}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {open && g.rows.map((row, i) => renderRow(row, i + 1, true))}
                  </tbody>
                )
              })
            ) : (
              <tbody>
                {pagedRows.map((row, i) => renderRow(row, (pageSafe - 1) * PAGE_SIZE + i + 1, false))}
              </tbody>
            )}
          </AlignedTable>
          </div>
        </div>
      )}

      {/* 分页 */}
      {!loading && viewMode === 'flat' && flatRows.length > PAGE_SIZE && (
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

      {drawerPerson && (
        <PersonDrawer
          key={drawerPerson.id}
          person={drawerPerson}
          maps={maps}
          onClose={() => setDrawerId(null)}
          onEdit={p => setEditPerson(p)}
        />
      )}

      {/* 模态框：state 全部在 modal 内部，parent 只控开关 + 接收完成事件 */}
      {showAdd && (
        <AddPersonModal
          initial={addPrefill ?? undefined}
          options={{ orgs: dropdowns.orgs, managers: dropdowns.managers, engineers: dropdowns.engineers }}
          onClose={() => { setShowAdd(false); setAddPrefill(null) }}
          onSaved={load}
        />
      )}

      {editPerson && (
        <EditPersonModal
          person={editPerson}
          options={{ orgs: dropdowns.orgs, managers: dropdowns.managers, engineers: dropdowns.engineers }}
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
