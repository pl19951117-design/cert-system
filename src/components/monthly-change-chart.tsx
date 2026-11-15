'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { MonthlyPoint } from '@/lib/change-log-stats'

type Props = { data: MonthlyPoint[]; embedded?: boolean }

/** XAxis 标签：跨年时显示 'YY/M' 月，同年仅显示 'M月' */
function formatMonthLabel(month: string, all: MonthlyPoint[]): string {
  const years = new Set(all.map(p => p.month.slice(0, 4)))
  const m = Number(month.slice(5, 7))
  if (years.size <= 1) return `${m}月`
  return `${month.slice(2, 4)}/${m}`
}

export function MonthlyChangeChart({ data, embedded = false }: Props) {
  const hasAny = data.some(d => d.added > 0 || d.removed > 0)
  const totalAdded = data.reduce((s, d) => s + d.added, 0)
  const totalRemoved = data.reduce((s, d) => s + d.removed, 0)

  return (
    <div className={embedded ? 'monthly-chart-embedded' : 'card-elevated min-w-0 p-6 mb-8'}>
      <div className="section-label chart-panel-title flex-wrap gap-y-2">
        <div className="section-label-bar" />
        <div><h2 className="section-label-text">证件变动趋势</h2><p className="mt-1 text-xs text-slate-500">近 12 个月的新增与减少</p></div>
        <span className="ml-auto text-xs text-slate-500">
          合计 <span className="text-navy-700 font-semibold">+{totalAdded}</span>
          <span className="mx-1">/</span>
          <span className="text-slate-700 font-semibold">−{totalRemoved}</span>
          <span className="ml-1">本</span>
        </span>
      </div>
      {!hasAny ? (
        <div className="h-52 flex items-center justify-center text-sm text-slate-500">
          暂无变动记录，新增或删除人员、证件后会在此显示。
        </div>
      ) : (
        <>
          <ul className="sr-only">
            {data.map(d => <li key={d.month}>{d.month}：新增 {d.added} 本，减少 {d.removed} 本</li>)}
          </ul>
          <ResponsiveContainer width="100%" height={embedded ? 230 : 260}>
          <BarChart data={data} barCategoryGap="24%" accessibilityLayer barGap={4} margin={{ top: 8, right: 8, left: -24, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke="#edf0f3" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickFormatter={(m) => formatMonthLabel(m, data)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: '#f1f4f8' }}
              contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 2px 8px rgb(15 23 42 / 6%)', fontSize: 12, color: '#334155' }}
              labelFormatter={(label) => {
                const s = String(label ?? '')
                if (!/^\d{4}-\d{2}/.test(s)) return s
                return `${s.slice(0, 4)} 年 ${Number(s.slice(5, 7))} 月`
              }}
              formatter={(v, name) => [`${v} 本`, name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="square" iconSize={8} formatter={value => <span className="ml-1 text-slate-600">{value}</span>} />
            <Bar dataKey="added" name="新增" fill="#0071e3" maxBarSize={16} isAnimationActive={false} radius={[4, 4, 0, 0]} />
            <Bar dataKey="removed" name="减少" fill="#d2d2d7" maxBarSize={16} isAnimationActive={false} radius={[4, 4, 0, 0]} />
          </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}
