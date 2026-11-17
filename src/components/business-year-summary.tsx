'use client'
import { useState } from 'react'
import type { computeBusinessYearStats } from '@/lib/business-year-stats'
export function BusinessYearSummary({ stats, currentYear }: { stats: ReturnType<typeof computeBusinessYearStats>; currentYear: string }) {
  const [year, setYear] = useState(currentYear)
  const selected = stats.years.find(row => row.year === year)
  return <section className="card-elevated p-6 space-y-4" aria-label="安全与法务年度统计">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">安全与法务年度统计</h2><label className="flex items-center gap-2 text-sm">统计年度<select className="input-refined" value={year} onChange={e => setYear(e.target.value)}>{stats.years.map(row => <option key={row.year} value={row.year}>{row.year} 年</option>)}</select></label></div>
    <div className="grid gap-4 sm:grid-cols-2" aria-live="polite">
      <div className="rounded-xl bg-slate-50 p-5"><h3 className="text-sm text-slate-500">年度检查项目</h3><p className="text-3xl font-semibold mt-3">{selected?.projects ?? 0}<span className="ml-2 text-sm font-normal">个</span></p><p className="text-xs text-slate-500 mt-3">按检查时间，同年度同名项目去重</p></div>
      <div className="rounded-xl bg-slate-50 p-5"><h3 className="text-sm text-slate-500">年度法务案件</h3><div className="flex gap-8 mt-3"><p>起诉 <strong className="text-3xl">{selected?.prosecutions ?? 0}</strong> 件</p><p>应诉 <strong className="text-3xl">{selected?.defenses ?? 0}</strong> 件</p></div><p className="text-xs text-slate-500 mt-3">按开庭时间；未分类 {selected?.unclassified ?? 0} 件</p></div>
    </div>
    <p className="text-xs text-slate-500">未填业务日期的检查记录 {stats.undatedInspections} 条、法务案件 {stats.undatedCases} 件，未计入年度统计。</p>
  </section>
}
