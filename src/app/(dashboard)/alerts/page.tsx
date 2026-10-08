'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { differenceInDays, parseISO } from 'date-fns'
import * as XLSX from 'xlsx'

type Cert = {
  id: number; certType: string | null; certNo: string | null; expiryDate: string | null
  person: { name: string; orgName: string | null; manager: string | null }
  personId: number
}

function certStatus(expiryDate: string | null) {
  if (!expiryDate) return 'none'
  const days = differenceInDays(parseISO(expiryDate), new Date())
  if (days < 0) return 'expired'
  if (days <= 30) return 'urgent'
  if (days <= 90) return 'warning'
  return 'ok'
}

const badge: Record<string, string> = {
  expired: 'bg-red-50 text-red-600 border-red-200',
  urgent:  'bg-orange-50 text-orange-600 border-orange-200',
  warning: 'bg-amber-50 text-amber-600 border-amber-200',
  ok:      'bg-emerald-50 text-emerald-600 border-emerald-200',
}
const label: Record<string, string> = { expired: '已过期', urgent: '紧急', warning: '预警', ok: '正常' }

export default function AlertsPage() {
  const [certs, setCerts] = useState<Cert[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('alert')
  const [orgFilter, setOrgFilter] = useState('')

  useEffect(() => {
    fetch('/api/alerts').then(r => r.json()).then(d => {
      setCerts(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [])

  const orgs = Array.from(new Set(certs.map(c => c.person.orgName).filter(Boolean))) as string[]

  const filtered = certs.filter(c => {
    const st = certStatus(c.expiryDate)
    const matchStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'alert'
      ? ['expired', 'urgent', 'warning'].includes(st)
      : st === statusFilter
    const matchOrg = !orgFilter || c.person.orgName === orgFilter
    return matchStatus && matchOrg && st !== 'none'
  }).sort((a, b) => {
    const da = a.expiryDate ? differenceInDays(parseISO(a.expiryDate), new Date()) : -9999
    const db = b.expiryDate ? differenceInDays(parseISO(b.expiryDate), new Date()) : -9999
    return da - db
  })

  const counts = {
    expired: certs.filter(c => certStatus(c.expiryDate) === 'expired').length,
    urgent:  certs.filter(c => certStatus(c.expiryDate) === 'urgent').length,
    warning: certs.filter(c => certStatus(c.expiryDate) === 'warning').length,
  }

  function exportExcel() {
    const rows = filtered.map((c, i) => {
      const st = certStatus(c.expiryDate)
      const days = c.expiryDate ? differenceInDays(parseISO(c.expiryDate), new Date()) : null
      return {
        '序号':     i + 1,
        '归属建制': c.person.orgName || '',
        '负责人':   c.person.manager || '',
        '姓名':     c.person.name,
        '证件类别': c.certType || '',
        '证件编号': c.certNo || '',
        '到期日期': c.expiryDate || '',
        '状态':     label[st] || '',
        '剩余天数': days === null ? '' : days < 0 ? `超期 ${Math.abs(days)} 天` : `还剩 ${days} 天`,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '到期预警')
    XLSX.writeFile(wb, `到期预警_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">到期预警</h1>
          <p className="text-xs text-slate-400 mt-0.5">已过期 {counts.expired} · 紧急（30天内）{counts.urgent} · 预警（90天内）{counts.warning}</p>
        </div>
        <button
          onClick={exportExcel}
          disabled={filtered.length === 0}
          className="self-center btn-secondary !py-2 !px-3 !text-xs disabled:opacity-50"
        >
          导出 Excel
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { key: 'expired', label: '已过期', count: counts.expired, color: '#dc2626', border: 'border-l-red-500' },
          { key: 'urgent',  label: '30天内到期', count: counts.urgent,  color: '#ea580c', border: 'border-l-orange-500' },
          { key: 'warning', label: '90天内到期', count: counts.warning, color: '#d97706', border: 'border-l-amber-500' },
        ].map(k => (
          <button
            key={k.key}
            onClick={() => setStatusFilter(statusFilter === k.key ? 'alert' : k.key)}
            className={`card-elevated kpi-card border-l-[3px] ${k.border} p-4 text-left transition-all ${statusFilter === k.key ? 'ring-2 ring-navy-400' : 'hover:shadow-md'}`}
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{k.label}</div>
            <div className="text-3xl font-extrabold tabular-nums" style={{ color: k.color }}>{k.count}</div>
          </button>
        ))}
      </div>

      {/* 筛选 */}
      <div className="filter-bar flex items-center gap-3">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { key: 'alert', label: '需关注' },
            { key: 'all', label: '全部证件' },
          ].map(t => (
            <button key={t.key} onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${statusFilter === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)}
          className="input-refined !w-auto !py-1.5 !px-3 !text-xs">
          <option value="">全部建制</option>
          {orgs.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {/* 表格 */}
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-12 text-center">
          <div className="text-3xl mb-3">✓</div>
          <div className="text-sm font-semibold text-slate-600">当前无需关注的证件</div>
          <div className="text-xs text-slate-400 mt-1">90天内所有证件均在有效期内</div>
        </div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <table className="w-full table-premium">
            <thead>
              <tr>
                {['归属建制','负责人','姓名','证件类别','证件编号','到期日期','状态','剩余天数'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const st = certStatus(c.expiryDate)
                const days = c.expiryDate ? differenceInDays(parseISO(c.expiryDate), new Date()) : null
                const daysStr = days === null ? '—' : days < 0 ? `超期 ${Math.abs(days)} 天` : `还剩 ${days} 天`
                const rowBg = st === 'expired' ? 'bg-red-50/30' : st === 'urgent' ? 'bg-orange-50/30' : ''
                const badgeCls = st === 'expired' ? 'badge badge-red' : st === 'urgent' ? 'badge badge-orange' : st === 'warning' ? 'badge badge-amber' : 'badge badge-green'
                return (
                  <tr key={c.id} className={rowBg}>
                    <td>{c.person.orgName || '—'}</td>
                    <td>{c.person.manager || '—'}</td>
                    <td className="font-medium text-slate-800">
                      <Link href={`/personnel/${c.personId}`} className="hover:text-navy-700 hover:underline">{c.person.name}</Link>
                    </td>
                    <td>{c.certType || '—'}</td>
                    <td className="font-mono text-xs text-slate-500">{c.certNo || '—'}</td>
                    <td>{c.expiryDate || '—'}</td>
                    <td>
                      {badge[st] && <span className={badgeCls}>{label[st]}</span>}
                    </td>
                    <td className="text-xs text-slate-500">{daysStr}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
