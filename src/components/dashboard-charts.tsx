'use client'

import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'

type Props = {
  socialData: { name: string; value: number }[]
  ageData: { name: string; value: number }[]
}

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#6b7280']

export function DashboardCharts({ socialData, ageData }: Props) {
  return (
    <div className="grid grid-cols-2 gap-5 mb-8">
      {/* 社保情况饼状图 + 占比列表 */}
      <div className="card-elevated p-5">
        <div className="section-label">
          <div className="section-label-bar" />
          <span className="section-label-text">社保情况</span>
        </div>
        {socialData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
        ) : (
          (() => {
            const total = socialData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="flex items-center gap-3" style={{ height: 240 }}>
                {/* 饼图 */}
                <div className="flex-shrink-0" style={{ width: 200, height: 240 }}>
                  <PieChart width={200} height={240}>
                    <Pie
                      data={socialData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={82}
                      paddingAngle={1.5}
                      dataKey="value"
                      nameKey="name"
                    >
                      {socialData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${v} 人`} />
                  </PieChart>
                </div>
                {/* 占比列表 */}
                <div className="flex-1 min-w-0 max-h-[224px] overflow-y-auto pr-1 space-y-1.5">
                  {socialData.map((d, idx) => {
                    const pct = total ? (d.value / total) * 100 : 0
                    return (
                      <div key={d.name} className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                        <span className="text-xs text-slate-600 truncate flex-1" title={d.name}>{d.name}</span>
                        <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">{d.value} 人</span>
                        <span className="text-xs font-semibold text-slate-700 tabular-nums flex-shrink-0 w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()
        )}
      </div>

      {/* 年龄结构柱状图 */}
      <div className="card-elevated p-5">
        <div className="section-label">
          <div className="section-label-bar" />
          <span className="section-label-text">人员年龄结构</span>
        </div>
        {ageData.every(d => d.value === 0) ? (
          <div className="h-52 flex items-center justify-center text-sm text-slate-400">暂无数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ageData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => `${v} 人`} />
              <Bar dataKey="value" name="人数" radius={[4, 4, 0, 0]}>
                {ageData.map((_, idx) => (
                  <Cell key={idx} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 5]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
