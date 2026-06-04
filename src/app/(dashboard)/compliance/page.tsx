'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getJSON } from '@/lib/api'

type Summary = { totalPeople: number; totalWithReq: number; compliant: number; rate: number }
type OrgRow = { orgName: string; total: number; compliant: number; rate: number }
type BadRow = { personId: number; name: string; orgName: string | null; missing: string[]; expired: string[] }
type Data = { requirements: unknown[]; summary: Summary | null; byOrg: OrgRow[]; nonCompliant: BadRow[] }

function rateColor(rate: number) {
  if (rate >= 90) return 'text-emerald-600'
  if (rate >= 70) return 'text-amber-600'
  return 'text-red-600'
}

export default function CompliancePage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try { setData(await getJSON<Data>('/api/compliance')) } catch { /* toast 已弹 */ }
      setLoading(false)
    })()
  }, [])

  if (loading) return <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>

  const noReq = !data || data.requirements.length === 0
  const s = data?.summary

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">合规报表</h1>
          <p className="text-xs text-slate-400 mt-0.5">按「证件要求」核对每人应持证件，标出缺证与过期</p>
        </div>
      </div>

      {noReq ? (
        <div className="card-elevated p-10 text-center">
          <div className="text-sm font-semibold text-slate-600">尚未设置证件要求</div>
          <div className="text-xs text-slate-400 mt-1.5">请到「系统管理 → 证件要求」设定某建制/全账套必须持有的证件，本页会自动计算合规情况。</div>
          <Link href="/admin" className="btn-primary inline-block mt-4 !text-xs !py-2 !px-4">前往设置</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 总览 */}
          <div className="grid grid-cols-4 gap-5">
            <div className="card-elevated p-5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">总体合规率</div>
              <div className={`text-4xl font-extrabold tabular-nums leading-none ${rateColor(s?.rate ?? 0)}`}>{s?.rate ?? 0}%</div>
            </div>
            <div className="card-elevated p-5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">需持证人数</div>
              <div className="text-4xl font-extrabold text-slate-900 tabular-nums leading-none">{s?.totalWithReq ?? 0}</div>
              <div className="text-[11px] text-slate-400 mt-2">全部 {s?.totalPeople ?? 0} 人</div>
            </div>
            <div className="card-elevated p-5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">合规人数</div>
              <div className="text-4xl font-extrabold text-emerald-600 tabular-nums leading-none">{s?.compliant ?? 0}</div>
            </div>
            <div className="card-elevated p-5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">不合规人数</div>
              <div className="text-4xl font-extrabold text-red-600 tabular-nums leading-none">{data?.nonCompliant.length ?? 0}</div>
            </div>
          </div>

          {/* 按建制 */}
          <div>
            <div className="section-label"><div className="section-label-bar" /><span className="section-label-text">按建制合规率</span></div>
            <div className="card-elevated overflow-hidden">
              <table className="w-full table-premium">
                <thead><tr>{['归属建制', '需持证', '合规', '合规率'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {data!.byOrg.map(o => (
                    <tr key={o.orgName}>
                      <td className="font-medium text-slate-800">{o.orgName}</td>
                      <td className="text-xs tabular-nums">{o.total}</td>
                      <td className="text-xs tabular-nums">{o.compliant}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div className={o.rate >= 90 ? 'bg-emerald-400' : o.rate >= 70 ? 'bg-amber-400' : 'bg-red-400'} style={{ width: `${o.rate}%`, height: '100%' }} />
                          </div>
                          <span className={`text-xs font-semibold tabular-nums ${rateColor(o.rate)}`}>{o.rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 不合规清单 */}
          <div>
            <div className="section-label"><div className="section-label-bar" /><span className="section-label-text">不合规清单 · {data!.nonCompliant.length} 人</span></div>
            {data!.nonCompliant.length === 0 ? (
              <div className="card-elevated p-8 text-center">
                <div className="text-3xl mb-2">✓</div>
                <div className="text-sm font-semibold text-slate-600">全部合规</div>
              </div>
            ) : (
              <div className="card-elevated overflow-hidden">
                <table className="w-full table-premium">
                  <thead><tr>{['姓名', '归属建制', '缺失证件', '已过期证件'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data!.nonCompliant.map(r => (
                      <tr key={r.personId}>
                        <td className="font-medium text-slate-800">
                          <Link href={`/personnel/${r.personId}`} className="hover:text-amber-600 hover:underline">{r.name}</Link>
                        </td>
                        <td className="text-xs">{r.orgName || '—'}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {r.missing.length === 0 ? <span className="text-xs text-slate-300">—</span>
                              : r.missing.map(m => <span key={m} className="badge badge-red">{m}</span>)}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {r.expired.length === 0 ? <span className="text-xs text-slate-300">—</span>
                              : r.expired.map(m => <span key={m} className="badge badge-orange">{m}</span>)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
