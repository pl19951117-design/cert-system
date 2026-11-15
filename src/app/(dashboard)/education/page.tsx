'use client'

// 继续教育：按年度列出有效期到期的证件，登记是否已参加继续教育，可导出 Excel。
// 排列与人员库一致：按建制分组（可折叠），组内沿用人员库「建制 → 负责人 → 姓名」的顺序。

import { AlignedTable } from '@/components/aligned-table'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Download, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'
import { differenceInDays, parseISO } from 'date-fns'
import { apiFetch, getJSON } from '@/lib/api'
import { toast } from '@/components/toast'
import { Modal } from '@/components/Modal'
import { TableRowSkeleton } from '@/components/Skeleton'
import { Spinner } from '@/components/Spinner'
import { todayYMD } from '@/lib/change-log-stats'
import {
  buildEducationExportRows, buildEducationSummaryRows, computeEducationStats, defaultEduYear, eduYearOptions,
  EMPTY_EDU_FILTER, filterEducationRows, groupEducationRows, hasEduFilter,
  type EduFilter, type EduRow, type EduStats,
} from '@/lib/education'

// 数据量超过这个行数且没有筛选时，默认把各建制收起
const AUTO_COLLAPSE_ROWS = 200
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

function remain(r: EduRow): { text: string; cls: string } {
  if (r.outOfYear) return { text: '有效期已变更', cls: 'text-slate-400' }
  if (!r.expiryDate) return { text: '—', cls: 'text-slate-400' }
  let d: number
  try { d = differenceInDays(parseISO(r.expiryDate), new Date()) } catch { return { text: '—', cls: 'text-slate-400' } }
  if (Number.isNaN(d)) return { text: '—', cls: 'text-slate-400' }
  if (d < 0) return { text: `已过期 ${-d} 天`, cls: 'text-red-500 font-semibold' }
  if (d <= 90) return { text: `还剩 ${d} 天`, cls: 'text-amber-600 font-semibold' }
  return { text: `还剩 ${d} 天`, cls: 'text-slate-500' }
}

function exportExcel(rows: EduRow[], stats: EduStats, year: number, filtered: boolean) {
  const wb = XLSX.utils.book_new()
  const list = XLSX.utils.json_to_sheet(buildEducationExportRows(rows))
  list['!cols'] = [6, 16, 10, 10, 21, 9, 22, 12, 10, 12, 24].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, list, '继续教育名单')
  const sum = XLSX.utils.json_to_sheet(buildEducationSummaryRows(stats))
  sum['!cols'] = [10, 12, 8, 8, 8].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, sum, '汇总')
  XLSX.writeFile(wb, `继续教育名单_${year}年度到期${filtered ? '_筛选' : ''}_${todayYMD()}.xlsx`)
}

type RegisterTarget = { rows: EduRow[]; batch: boolean }

function RegisterModal({ target, year, onClose, onDone }: {
  target: RegisterTarget; year: number; onClose: () => void; onDone: () => void
}) {
  const first = target.rows[0]
  const [attended, setAttended] = useState(true)
  const [date, setDate] = useState(() => (!target.batch && first.attendedDate) || todayYMD())
  const [note, setNote] = useState(() => (!target.batch && first.note) || '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      await apiFetch('/api/education', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          certIds: target.rows.map(r => r.certId),
          attended,
          attendedDate: attended ? date || null : null,
          // 批量登记时备注留空 = 不改原备注
          note: target.batch && !note.trim() ? undefined : note,
        }),
      })
      toast(`已登记 ${target.rows.length} 本：${attended ? '已参加' : '未参加'}`, 'success')
      onDone()
      onClose()
    } catch { setSaveError('登记未能保存，请检查连接后重试。') }
    setSaving(false)
  }

  const names = Array.from(new Set(target.rows.map(r => r.name)))
  return (
    <Modal onClose={onClose} title={target.batch ? `批量登记继续教育 · ${target.rows.length} 本` : `登记继续教育 · ${first.name}`} size="sm">
      <form onSubmit={submit} className="p-6 space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed -mt-1">
          {target.batch
            ? <>{names.slice(0, 6).join('、')}{names.length > 6 ? ` 等 ${names.length} 人` : ''}</>
            : <>{first.certType || '未分类'} 证 · {first.certNo || '无编号'} · 有效期至 {first.expiryDate || '—'}</>}
        </p>

        <div>
          <div className="block text-xs font-semibold text-slate-600 mb-1.5">是否已参加 {year} 年度继续教育</div>
          <div className="segmented w-full" role="group" aria-label="是否已参加">
            {[true, false].map(v => (
              <button key={String(v)} type="button" aria-pressed={attended === v} disabled={saving}
                onClick={() => setAttended(v)} className="flex-1">
                {v ? '已参加' : '未参加'}
              </button>
            ))}
          </div>
        </div>

        {attended && (
          <div>
            <label htmlFor="edu-date" className="block text-xs font-semibold text-slate-600 mb-1">参加日期</label>
            <input id="edu-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="input-refined" />
          </div>
        )}

        <div>
          <label htmlFor="edu-note" className="block text-xs font-semibold text-slate-600 mb-1">备注</label>
          <input id="edu-note" value={note} onChange={e => setNote(e.target.value)}
            placeholder={target.batch ? '留空则不修改原备注' : '如：线上学习、培训机构、学时等'} className="input-refined" />
        </div>

        {saveError && <p role="alert" className="form-error">{saveError}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">取消</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving && <Spinner size={15} />}{saving ? '保存中…' : '确认登记'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function EducationPage() {
  const years = useMemo(() => eduYearOptions(), [])
  const [year, setYear] = useState(defaultEduYear)
  const [data, setData] = useState<{ year: number; rows: EduRow[] } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [failedYear, setFailedYear] = useState<number | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [filter, setFilter] = useState<EduFilter>(EMPTY_EDU_FILTER)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [target, setTarget] = useState<RegisterTarget | null>(null)
  const [groupMode, setGroupMode] = useState<'auto' | 'open' | 'closed'>('auto')
  const [groupOverrides, setGroupOverrides] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    let alive = true
    getJSON<{ year: number; rows: EduRow[] }>(`/api/education?year=${year}`)
      .then(d => { if (alive) { setData(d); setFailedYear(null) } })
      .catch(() => { if (alive) { setData({ year, rows: [] }); setFailedYear(year) } })
    return () => { alive = false }
  }, [year, reloadKey])

  useEffect(() => {
    fetch('/api/auth/me').then(r => (r.ok ? r.json() : null))
      .then(me => setCanEdit(!!me && me.role !== 'viewer'))
      .catch(() => setCanEdit(false))
  }, [])

  const loading = data?.year !== year
  const loadError = failedYear === year
  const allRows = useMemo(() => (data && data.year === year ? data.rows : []), [data, year])
  const rows = useMemo(() => filterEducationRows(allRows, filter), [allRows, filter])
  const stats = useMemo(() => computeEducationStats(rows), [rows])
  const groups = useMemo(() => groupEducationRows(rows), [rows])
  const certTypes = useMemo(
    () => computeEducationStats(allRows).byType.map(t => t.type).filter(t => t !== '未分类'),
    [allRows],
  )
  const filtered = hasEduFilter(filter)

  const defaultOpen = groupMode === 'open' ? true : groupMode === 'closed' ? false : filtered || rows.length <= AUTO_COLLAPSE_ROWS
  const isOpen = (org: string) => groupOverrides.get(org) ?? defaultOpen
  const openCount = groups.filter(g => isOpen(g.org)).length

  function changeYear(y: number) {
    setYear(y)
    setSelected(new Set())
    setGroupMode('auto'); setGroupOverrides(new Map())
  }
  function updateFilter(patch: Partial<EduFilter>) {
    setFilter(f => ({ ...f, ...patch }))
    setSelected(new Set())                        // 避免批量登记到看不见的行
    setGroupMode('auto'); setGroupOverrides(new Map())
  }
  function toggleGroup(org: string) {
    setGroupOverrides(prev => new Map(prev).set(org, !(prev.get(org) ?? defaultOpen)))
  }
  function setAllGroups(open: boolean) {
    setGroupMode(open ? 'open' : 'closed'); setGroupOverrides(new Map())
  }

  function toggleSelect(ids: number[], on: boolean) {
    setSelected(prev => {
      const next = new Set(prev)
      for (const id of ids) { if (on) next.add(id); else next.delete(id) }
      return next
    })
  }
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.certId))
  const selectedRows = rows.filter(r => selected.has(r.certId))

  function onRegistered() {
    setSelected(new Set())
    setReloadKey(k => k + 1)
  }

  const cols = canEdit ? 13 : 11

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">继续教育</h1>
          <p className="text-xs text-slate-400 mt-0.5">有效期在 {year} 年内到期的证件，需在到期前完成继续教育</p>
        </div>
        <div className="self-center flex flex-wrap items-center gap-3">
          <div className="segmented" role="group" aria-label="到期年度">
            {years.map(y => (
              <button key={y} type="button" aria-pressed={year === y} onClick={() => changeYear(y)}>{y} 年度</button>
            ))}
          </div>
          <button onClick={() => exportExcel(rows, stats, year, filtered)} disabled={loading || loadError || rows.length === 0}
            className="btn-secondary !py-2 !px-3 !text-xs disabled:opacity-50">
            <Download size={16} strokeWidth={1.7} aria-hidden="true" />导出 Excel{filtered ? '（筛选结果）' : ''}
          </button>
        </div>
      </div>

      {/* 统计 */}
      <div className="card-elevated education-summary mb-5 overflow-hidden" aria-busy={loading}>
        <div className="grid grid-cols-2 md:grid-cols-4">
          <div className="p-5">
            <div className="text-[11px] font-bold text-slate-400 tracking-widest mb-2">应参加{filtered ? '（已筛选）' : ''}</div>
            <div className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">{loading || loadError ? '—' : stats.certs}<span className="text-sm font-semibold text-slate-400 ml-1">本</span></div>
            <div className="text-[11px] text-slate-400 mt-2">涉及 {loading || loadError ? '—' : stats.people} 人</div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-bold text-slate-400 tracking-widest mb-2">已参加</div>
            <div className="text-3xl font-semibold text-slate-900 tabular-nums leading-none">{loading || loadError ? '—' : stats.attended}</div>
            <div className="text-[11px] text-slate-400 mt-2">已登记参加继续教育</div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-bold text-slate-400 tracking-widest mb-2">未参加</div>
            <div className="text-3xl font-semibold text-slate-900 tabular-nums leading-none">{loading || loadError ? '—' : stats.pending}</div>
            <div className="text-[11px] text-slate-400 mt-2">需安排参加</div>
          </div>
          <div className="p-5">
            <div className="text-[11px] font-bold text-slate-400 tracking-widest mb-2">完成率</div>
            <div className="text-3xl font-extrabold text-navy-700 tabular-nums leading-none">
              {loading || loadError ? '—' : stats.attendedPct.toFixed(1)}<span className="text-xl">%</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-navy-600" style={{ width: `${loading ? 0 : stats.attendedPct}%` }} />
            </div>
          </div>
        </div>
        {!loading && stats.byType.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-xs">
            <span className="text-slate-400">按证件类别（已参加 / 应参加）：</span>
            {stats.byType.map(t => (
              <span key={t.type} className="text-slate-600">
                <span className="font-semibold text-slate-800">{t.type}</span>
                <span className="ml-1.5 tabular-nums"><span className="text-emerald-600 font-semibold">{t.attended}</span> / {t.total}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 筛选 */}
      <div className="filter-bar">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {([['name', '姓名'], ['org', '归属建制'], ['manager', '负责人']] as const).map(([k, label]) => (
            <div key={k}>
              <label htmlFor={`edu-f-${k}`} className="block text-[10px] font-bold text-slate-400 tracking-widest mb-1">{label}</label>
              <input id={`edu-f-${k}`} value={filter[k]} onChange={e => updateFilter({ [k]: e.target.value })}
                placeholder="输入关键字…" className="input-refined !py-2 !px-3 text-sm" />
            </div>
          ))}
          <div>
            <label htmlFor="edu-f-type" className="block text-[10px] font-bold text-slate-400 tracking-widest mb-1">证件类别</label>
            <select id="edu-f-type" value={filter.certType} onChange={e => updateFilter({ certType: e.target.value })} className="input-refined !py-2 !px-3 text-sm">
              <option value="">全部</option>
              {certTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="edu-f-status" className="block text-[10px] font-bold text-slate-400 tracking-widest mb-1">登记状态</label>
            <select id="edu-f-status" value={filter.status} onChange={e => updateFilter({ status: e.target.value as EduFilter['status'] })} className="input-refined !py-2 !px-3 text-sm">
              <option value="">全部</option>
              <option value="pending">未参加</option>
              <option value="attended">已参加</option>
            </select>
          </div>
          <div>
            <label htmlFor="edu-f-month" className="block text-[10px] font-bold text-slate-400 tracking-widest mb-1">到期月份</label>
            <select id="edu-f-month" value={filter.month} onChange={e => updateFilter({ month: e.target.value })} className="input-refined !py-2 !px-3 text-sm">
              <option value="">全年</option>
              {MONTHS.map(m => <option key={m} value={m}>{Number(m)} 月</option>)}
            </select>
          </div>
        </div>
        {filtered && (
          <button onClick={() => updateFilter(EMPTY_EDU_FILTER)} className="mt-3 text-xs text-navy-600 hover:text-navy-800 font-medium">清除所有筛选</button>
        )}
      </div>

      {/* 名单 */}
      <div className="card-elevated overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--line)] min-h-[52px]">
          {selected.size > 0 ? (
            <>
              <span className="text-xs font-semibold text-navy-800">已选 {selected.size} 本</span>
              <button onClick={() => setTarget({ rows: selectedRows, batch: true })}
                className="px-3 py-1.5 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-xs font-semibold transition-colors">
                批量登记
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 hover:text-slate-600">取消选择</button>
            </>
          ) : (
            <span className="text-xs text-slate-400">
              {loading ? '加载中…' : `${groups.length} 个建制 · ${stats.people} 人 · ${stats.certs} 本 · 已展开 ${openCount} 个`}
              {canEdit && !loading && rows.length > 0 && <span className="ml-2 text-slate-300">勾选多行可批量登记</span>}
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button type="button" onClick={() => setAllGroups(true)} className="text-xs text-navy-600 hover:text-navy-800 font-medium">全部展开</button>
            <span className="text-slate-200" aria-hidden="true">|</span>
            <button type="button" onClick={() => setAllGroups(false)} className="text-xs text-navy-600 hover:text-navy-800 font-medium">全部收起</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <AlignedTable columns={[...(canEdit ? ['选择'] : []), '序号','负责人','姓名','身份证号','证件类别','证件编号','有效期至','剩余','继续教育','参加日期','备注', ...(canEdit ? ['操作'] : [])]} className="w-full table-premium table-compact">
            <caption className="sr-only">{year} 年度到期证件继续教育名单，按归属建制分组</caption>
            <thead className={!loading && rows.length > 0 && openCount === 0 ? 'sr-only' : undefined}>
              <tr>
                {canEdit && (
                  <th scope="col" className="w-10">
                    <input type="checkbox" aria-label="全选" checked={allSelected} disabled={rows.length === 0}
                      onChange={e => toggleSelect(rows.map(r => r.certId), e.target.checked)} className="accent-navy-700 cursor-pointer" />
                  </th>
                )}
                {['序号', '负责人', '姓名', '身份证号', '证件类别', '证件编号', '有效期至', '剩余', '继续教育', '参加日期', '备注'].map(h => (
                  <th key={h} scope="col">{h}</th>
                ))}
                {canEdit && <th scope="col">操作</th>}
              </tr>
            </thead>
            {loadError ? (
              <tbody><tr><td colSpan={cols} className="!py-10 text-center">
                <div role="alert">
                  <RefreshCw size={24} strokeWidth={1.5} className="mx-auto mb-3 text-slate-400" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-800">继续教育名单暂时无法加载</p>
                  <p className="mt-1 text-xs text-slate-500">当前年度和筛选条件已保留，请重试。</p>
                  <button className="btn-secondary mt-4" onClick={() => { setFailedYear(null); setData(null); setReloadKey(k => k + 1) }}>重新加载</button>
                </div>
              </td></tr></tbody>
            ) : loading ? (
              <tbody><TableRowSkeleton cols={cols} count={6} /></tbody>
            ) : rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={cols} className="!py-14 text-center">
                    <div className="text-sm font-semibold text-slate-600">
                      {filtered ? '没有符合条件的证件' : `${year} 年没有到期的证件`}
                    </div>
                    {filtered && (
                      <button onClick={() => updateFilter(EMPTY_EDU_FILTER)} className="mt-2 text-xs text-navy-600 hover:text-navy-800 font-semibold">清除所有筛选</button>
                    )}
                  </td>
                </tr>
              </tbody>
            ) : groups.map(g => {
              const open = isOpen(g.org)
              const ids = g.rows.map(r => r.certId)
              const groupAll = ids.every(id => selected.has(id))
              return (
                <tbody key={g.org}>
                  <tr className="group-row">
                    <td colSpan={cols} className="!p-0">
                      <div className="flex items-center">
                        {canEdit && (
                          <span className="pl-4 flex items-center">
                            <input type="checkbox" aria-label={`选择 ${g.org} 全部`} checked={groupAll}
                              onChange={e => toggleSelect(ids, e.target.checked)} className="accent-navy-700 cursor-pointer" />
                          </span>
                        )}
                        <button type="button" onClick={() => toggleGroup(g.org)} aria-expanded={open}
                          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2.5 text-left">
                          <svg className={`w-3.5 h-3.5 text-navy-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          <span className="text-[13px] font-semibold text-navy-900 whitespace-nowrap">{g.org}</span>
                          <span className="text-[11.5px] text-slate-500 tabular-nums whitespace-nowrap">{g.people} 人 · {g.rows.length} 本</span>
                          {g.managers.length > 0 && (
                            <span className="text-[11.5px] text-slate-400 truncate min-w-0">
                              负责人：{g.managers.slice(0, 3).join('、')}{g.managers.length > 3 ? ` 等 ${g.managers.length} 人` : ''}
                            </span>
                          )}
                          <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                            {g.pending === 0
                              ? <span className="text-[11px] font-medium text-emerald-600">✓ 全部已参加</span>
                              : <>
                                  {g.attended > 0 && <span className="badge badge-green">已参加 {g.attended}</span>}
                                  <span className="badge badge-amber">未参加 {g.pending}</span>
                                </>}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && g.rows.map((r, i) => {
                    const rm = remain(r)
                    return (
                      <tr key={r.certId} className={selected.has(r.certId) ? '!bg-navy-50/70' : undefined}>
                        {canEdit && (
                          <td>
                            <input type="checkbox" aria-label={`选择 ${r.name} ${r.certType || ''}`} checked={selected.has(r.certId)}
                              onChange={e => toggleSelect([r.certId], e.target.checked)} className="accent-navy-700 cursor-pointer" />
                          </td>
                        )}
                        <td className="text-slate-400 text-xs text-center tabular-nums">{i + 1}</td>
                        <td className="text-xs">{r.manager || '—'}</td>
                        <td className="font-medium text-slate-800">
                          <Link href={`/personnel?open=${r.personId}`} className="hover:text-navy-700 hover:underline" title="查看人员详情">{r.name}</Link>
                        </td>
                        <td className="text-xs text-slate-500">{r.idCard || '—'}</td>
                        <td className="text-xs font-semibold text-slate-700">{r.certType || '—'}</td>
                        <td className="text-xs text-slate-500 max-w-[160px] truncate" title={r.certNo || ''}>{r.certNo || '—'}</td>
                        <td className="text-xs tabular-nums">{r.expiryDate || '—'}</td>
                        <td className={`text-xs tabular-nums ${rm.cls}`}>{rm.text}</td>
                        <td>
                          <span className={`badge ${r.attended ? 'badge-green' : 'badge-slate'}`}>{r.attended ? '已参加' : '未参加'}</span>
                        </td>
                        <td className="text-xs tabular-nums text-slate-600">{r.attendedDate || '—'}</td>
                        <td className="text-xs text-slate-500 max-w-[180px] truncate" title={r.note || ''}>{r.note || '—'}</td>
                        {canEdit && (
                          <td>
                            <button onClick={() => setTarget({ rows: [r], batch: false })} className="text-xs text-navy-600 hover:text-navy-800 font-semibold">
                              {r.attended ? '修改' : '登记'}
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              )
            })}
          </AlignedTable>
        </div>
      </div>

      {target && <RegisterModal key={target.rows.map(r => r.certId).join(',')} target={target} year={year} onClose={() => setTarget(null)} onDone={onRegistered} />}
    </div>
  )
}
