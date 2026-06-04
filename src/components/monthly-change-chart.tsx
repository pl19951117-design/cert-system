'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { MonthlyPoint } from '@/lib/change-log-stats'

type Props = { data: MonthlyPoint[] }

/** XAxis 标签：跨年时显示 'YY/M' 月，同年仅显示 'M月' */
function formatMonthLabel(month: string, all: MonthlyPoint[]): string {
  const years = new Set(all.map(p => p.month.slice(0, 4)))
  const m = Number(month.slice(5, 7))
  if (years.size <= 1) return `${m}月`
  return `${month.slice(2, 4)}/${m}`
}

export function MonthlyChangeChart({ data }: Props) {
  const hasAny = data.some(d => d.added > 0 || d.removed > 0)
  const totalAdded = data.reduce((s, d) => s + d.added, 0)
  const totalRemoved = data.reduce((s, d) => s + d.removed, 0)

  return (
    <div className="card-elevated p-5 mb-8">
      <div className="section-label">
        <div className="section-label-bar" />
        <span className="section-label-text">每月新增 / 减少证件（近 12 个月）</span>
        <span className="ml-auto text-[11px] text-slate-400">
          合计 <span className="text-emerald-600 font-semibold">+{totalAdded}</span>
          <span className="mx-1">/</span>
          <span className="text-red-500 font-semibold">−{totalRemoved}</span>
          <span className="ml-1">本</span>
        </span>
      </div>
      {!hasAny ? (
        <div className="h-52 flex items-center justify-center text-sm text-slate-400">
          暂无数据 —— 新增 / 删除人员或证件后会在此显示
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} barCategoryGap="20%" barGap={4} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={(m) => formatMonthLabel(m, data)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip
              labelFormatter={(label) => {
                const s = String(label ?? '')
                if (!/^\d{4}-\d{2}/.test(s)) return s
                return `${s.slice(0, 4)} 年 ${Number(s.slice(5, 7))} 月`
              }}
              formatter={(v, name) => [`${v} 本`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="added" name="新增" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="removed" name="减少" fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
