'use client'

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { getJSON } from '@/lib/api'
import {
  computeDataReport, buildReportSheet,
  type DataReport, type ReportCertInput, type ReportChangeInput, type CoverageStat,
} from '@/lib/data-report'

type PersonLite = { socialSecurity: string | null; certificates: { certType: string | null }[] }
type LogLite = { changeType: string | null; certType: string | null; orgName: string | null; changeDate: string | null }

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 当前快照一行 */
function CoverageRow({ label, stat, accent }: { label: string; stat: CoverageStat; accent?: boolean }) {
  return (
    <tr className={accent ? 'bg-slate-50/60 font-semibold' : ''}>
      <td className="font-medium text-slate-800">{label}</td>
      <td className="text-right tabular-nums">{stat.total}</td>
      <td className="text-right tabular-nums text-emerald-700">{stat.paid}</td>
      <td className="text-right">
        <div className="flex items-center gap-2 justify-end">
          <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full bg-emerald-500/80" style={{ width: `${Math.min(100, stat.coverage)}%` }} aria-hidden="true" />
          </div>
          <span className="tabular-nums text-xs font-semibold text-slate-700 w-12 text-right">{stat.coverage}%</span>
        </div>
      </td>
    </tr>
  )
}

/** 转入/转出一块 */
function FlowBlock({ title, tone, flow, hasOther }: {
  title: string; tone: 'in' | 'out'
  flow: DataReport['transferIn']; hasOther: boolean
}) {
  const color = tone === 'in' ? 'text-emerald-600' : 'text-red-500'
  const sign = tone === 'in' ? '+' : '−'
  return (
    <div className="card-elevated p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-sm font-bold text-slate-700">{title}</span>
        <span className={`text-2xl font-extrabold tabular-nums ${color}`}>{sign}{flow.total}<span className="text-xs text-slate-400 ml-1">本</span></span>
      </div>
      <div className={`grid ${hasOther ? 'grid-cols-4' : 'grid-cols-3'} gap-2 mb-3`}>
        {([['A 类', flow.A], ['B 类', flow.B], ['C 类', flow.C], ...(hasOther ? [['其他', flow.other] as const] : [])] as const).map(([lbl, v]) => (
          <div key={lbl} className="bg-slate-50 rounded-lg p-2 text-center">
            <div className="text-[11px] text-slate-400">{lbl}</div>
            <div className={`text-lg font-bold tabular-nums ${color}`}>{v}</div>
          </div>
        ))}
      </div>
      {/* 按建制细分 */}
      {flow.byOrg.length === 0 ? (
        <div className="text-xs text-slate-400">该期间无记录</div>
      ) : (
        <div className="border border-slate-100 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-400">
                <th className="text-left font-semibold px-2.5 py-1.5">建制</th>
                <th className="text-right font-semibold px-2.5 py-1.5">A</th>
                <th className="text-right font-semibold px-2.5 py-1.5">B</th>
                <th className="text-right font-semibold px-2.5 py-1.5">C</th>
                {hasOther && <th className="text-right font-semibold px-2.5 py-1.5">其他</th>}
                <th className="text-right font-semibold px-2.5 py-1.5">小计</th>
              </tr>
            </thead>
            <tbody>
              {flow.byOrg.map(o => (
                <tr key={o.org} className="border-t border-slate-50">
                  <td className="px-2.5 py-1.5 text-slate-700 font-medium truncate max-w-[140px]" title={o.org}>{o.org}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-500">{o.A || '—'}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-500">{o.B || '—'}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-500">{o.C || '—'}</td>
                  {hasOther && <td className="px-2.5 py-1.5 text-right tabular-nums text-slate-500">{o.other || '—'}</td>}
                  <td className={`px-2.5 py-1.5 text-right tabular-nums font-semibold ${color}`}>{sign}{o.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function DataReportModal({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState<string>(currentMonth())
  const [to, setTo] = useState<string>(currentMonth())
  const [allTime, setAllTime] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [report, setReport] = useState<DataReport | null>(null)

  async function generate() {
    setLoading(true); setErr(''); setReport(null)
    try {
      const [people, logs] = await Promise.all([
        getJSON<PersonLite[]>('/api/personnel'),
        getJSON<LogLite[]>('/api/logs'),
      ])
      const certs: ReportCertInput[] = []
      for (const p of people) {
        for (const c of p.certificates) certs.push({ certType: c.certType, person: { socialSecurity: p.socialSecurity } })
      }
      const changeRows: ReportChangeInput[] = logs.map(l => ({
        changeType: l.changeType, certType: l.certType, orgName: l.orgName, changeDate: l.changeDate,
      }))
      const f = allTime ? undefined : (from || undefined)
      const t = allTime ? undefined : (to || undefined)
      if (f && t && f > t) { setErr('起始月份不能晚于结束月份'); setLoading(false); return }
      setReport(computeDataReport({ certs, changeRows, from: f, to: t }))
    } catch {
      setErr('生成失败，请稍后重试')
    }
    setLoading(false)
  }

  function exportExcel() {
    if (!report) return
    const ws = XLSX.utils.aoa_to_sheet(buildReportSheet(report))
    ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '数据报告')
    const tag = allTime ? '全部' : (from === to ? from : `${from}_${to}`)
    XLSX.writeFile(wb, `三类人员证件数据报告_${tag}.xlsx`)
  }

  const hasOtherIn = useMemo(() => !!report && report.transferIn.other > 0, [report])
  const hasOtherOut = useMemo(() => !!report && report.transferOut.other > 0, [report])
  const showOtherCurrent = !!report && report.current.other.total > 0

  return (
    <Modal onClose={onClose} title="一键生成数据报告" size="xl">
      <div className="p-6">
        {/* 月份选择 */}
        <div className="card-elevated p-4 mb-5">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">统计月份（影响「转入 / 转出」）</div>
          <div className="flex items-end gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={allTime} onChange={e => setAllTime(e.target.checked)} className="accent-navy-700 cursor-pointer" />
              全部时间
            </label>
            <div className={allTime ? 'opacity-40 pointer-events-none' : ''}>
              <label className="block text-[11px] text-slate-400 mb-1">起始月份</label>
              <input type="month" value={from} onChange={e => setFrom(e.target.value)} className="input-refined !w-40 !py-1.5 !text-xs" />
            </div>
            <div className={allTime ? 'opacity-40 pointer-events-none' : ''}>
              <label className="block text-[11px] text-slate-400 mb-1">结束月份</label>
              <input type="month" value={to} onChange={e => setTo(e.target.value)} className="input-refined !w-40 !py-1.5 !text-xs" />
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => { setAllTime(false); setFrom(currentMonth()); setTo(currentMonth()) }}
                className="text-[11px] px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">本月</button>
              <button type="button" onClick={() => { const y = new Date().getFullYear(); setAllTime(false); setFrom(`${y}-01`); setTo(`${y}-12`) }}
                className="text-[11px] px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200">本年</button>
            </div>
            <button type="button" onClick={generate} disabled={loading} aria-busy={loading}
              className="btn-primary !py-2 !px-5 !text-sm ml-auto flex items-center gap-2 disabled:opacity-60">
              {loading && <Spinner size={14} label="生成中" />}
              {loading ? '生成中…' : (report ? '重新生成' : '生成报告')}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">「当前证件 / 社保覆盖」为现存有效证件的即时快照，不受月份影响；「转入 / 转出」按所选月份统计。</p>
        </div>

        {err && <div role="alert" className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{err}</div>}

        {report && (
          <div className="space-y-5">
            {/* 一、当前快照 */}
            <div>
              <div className="section-label">
                <div className="section-label-bar" />
                <span className="section-label-text">一、当前证件与社保覆盖（现存有效证件）</span>
                <button onClick={exportExcel} className="ml-auto text-xs px-3 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold hover:bg-emerald-100">
                  导出 Excel
                </button>
              </div>
              <div className="card-elevated overflow-hidden">
                <table className="w-full table-premium">
                  <thead>
                    <tr><th>类别</th><th className="text-right">证件总数</th><th className="text-right">缴纳社保</th><th className="text-right w-[34%]">社保覆盖率</th></tr>
                  </thead>
                  <tbody>
                    <CoverageRow label="全部" stat={report.current.overall} accent />
                    <CoverageRow label="A 类" stat={report.current.A} />
                    <CoverageRow label="B 类" stat={report.current.B} />
                    <CoverageRow label="C 类（C1+C2+C3）" stat={report.current.C} />
                    {showOtherCurrent && <CoverageRow label="其他类别" stat={report.current.other} />}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 二、转入 / 转出 */}
            <div>
              <div className="section-label">
                <div className="section-label-bar" />
                <span className="section-label-text">二、证件转入 / 转出 · {report.periodLabel}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FlowBlock title="转入证件（证件新增）" tone="in" flow={report.transferIn} hasOther={hasOtherIn} />
                <FlowBlock title="转出证件（证件注销）" tone="out" flow={report.transferOut} hasOther={hasOtherOut} />
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-3">
          {report && (
            <button onClick={exportExcel} className="btn-secondary flex-1">导出 Excel</button>
          )}
          <button onClick={onClose} className="btn-secondary flex-1">关闭</button>
        </div>
      </div>
    </Modal>
  )
}

/** 仪表盘上的入口按钮 + 弹窗装载 */
export function DataReportLauncher() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary self-center !py-2 !px-4 !text-sm flex items-center gap-1.5">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        一键生成数据报告
      </button>
      {open && <DataReportModal onClose={() => setOpen(false)} />}
    </>
  )
}
