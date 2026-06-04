'use client'

import { useEffect, useState } from 'react'
import { getJSON } from '@/lib/api'

type Op = { id: number; username: string | null; action: string | null; target: string | null; detail: string | null; ts: string }

function fmt(s: string) {
  const d = new Date(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function renderDetail(detail: string | null): string {
  if (!detail) return '—'
  try {
    const o = JSON.parse(detail)
    if (o.changes) {
      return Object.entries(o.changes)
        .map(([k, v]) => {
          const c = v as { from: unknown; to: unknown }
          return `${k}: ${c.from ?? '空'} → ${c.to ?? '空'}`
        })
        .join('；')
    }
    if (o.after) return Object.entries(o.after).map(([k, v]) => `${k}=${v ?? '空'}`).join('，')
    return Object.entries(o).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join('，')
  } catch {
    return detail
  }
}

const actionBadge: Record<string, string> = {
  新增人员: 'badge-green', 修改人员: 'badge-blue', 删除人员: 'badge-red',
  新增证件: 'badge-green', 修改证件: 'badge-blue', 删除证件: 'badge-red',
  批量延期: 'badge-amber', 恢复人员: 'badge-green', 恢复证件: 'badge-green',
  彻底删除人员: 'badge-red', 彻底删除证件: 'badge-red', 导入人员: 'badge-amber', 社保同步: 'badge-amber',
}

export default function AuditPage() {
  const [logs, setLogs] = useState<Op[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setLogs(await getJSON<Op[]>('/api/audit'))
      } catch (e) {
        if (String(e).includes('403') || String(e).includes('超级管理员')) setDenied(true)
      }
      setLoading(false)
    })()
  }, [])

  const filtered = logs.filter(l =>
    !q || (l.username || '').includes(q) || (l.action || '').includes(q) || (l.target || '').includes(q)
  )

  if (denied) return <div className="card-elevated p-12 text-center text-sm font-semibold text-slate-600">仅超级管理员可查看操作审计</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">操作审计</h1>
          <p className="text-xs text-slate-400 mt-0.5">记录增删改与批量操作的执行人、时间与变更前后值（最近 500 条）</p>
        </div>
      </div>

      <div className="filter-bar flex items-center gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索操作人 / 动作 / 对象…"
          className="input-refined !w-64 !py-1.5 !px-3 !text-xs" />
        {q && <button onClick={() => setQ('')} className="text-xs text-amber-500 hover:text-amber-600 font-medium">清除</button>}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-slate-400">暂无审计记录</div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <table className="w-full table-premium">
            <thead><tr>{['时间', '操作人', '动作', '对象', '变更详情'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id}>
                  <td className="text-xs whitespace-nowrap">{fmt(l.ts)}</td>
                  <td className="text-xs">{l.username || '—'}</td>
                  <td><span className={`badge ${actionBadge[l.action || ''] || 'badge-slate'}`}>{l.action || '—'}</span></td>
                  <td className="text-xs">{l.target || '—'}</td>
                  <td className="text-xs text-slate-500 max-w-md break-words">{renderDetail(l.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
