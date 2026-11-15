'use client'

import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'

type Props = {
  socialData: { name: string; value: number }[]
  ageData: { name: string; value: number }[]
}

// 品牌蓝与中性灰；类别标签和文字占比提供颜色以外的信息。
const PIE_COLORS = ['#0071e3', '#a8b8cc', '#d2d2d7', '#e5e5ea', '#6e6e73', '#ececf0']
// 同类数据使用相同蓝色；未知年龄以中性灰显示。
const TOOLTIP_STYLE = { border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 2px 8px rgb(15 23 42 / 6%)', fontSize: 12, color: '#334155' }

export function DashboardCharts({ socialData, ageData }: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
      {/* 社保情况饼状图 + 占比列表 */}
      <div className="card-elevated min-w-0 p-5">
        <div className="section-label">
          <div className="section-label-bar" />
          <h2 className="section-label-text">社保情况</h2>
        </div>
        {socialData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-sm text-slate-500">暂无数据</div>
        ) : (
          (() => {
            const total = socialData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* 饼图 */}
                <div className="flex-shrink-0" style={{ width: 200, height: 240 }}>
                  <PieChart width={200} height={240} accessibilityLayer={false}>
                    <Pie
                      data={socialData}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={82}
                      paddingAngle={1.5}
                      dataKey="value"
                      nameKey="name"
                      isAnimationActive={false}
                    >
                      {socialData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <text x="100" y="115" textAnchor="middle" fill="#1d1d1f" fontSize={27} fontWeight={500}>{total}</text>
                    <text x="100" y="137" textAnchor="middle" fill="#6e6e73" fontSize={11}>在册人员</text>
                    <Tooltip formatter={(v) => `${v} 人`} contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </div>
                {/* 占比列表 */}
                <div className="flex-1 min-w-0 w-full space-y-4">
                  {socialData.map((d, idx) => {
                    const pct = total ? (d.value / total) * 100 : 0
                    return (
                      <div key={d.name} className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} aria-hidden="true" />
                        <span className="text-xs text-slate-600 break-words flex-1">{d.name}</span>
                        <span className="text-xs text-slate-500 tabular-nums flex-shrink-0">{d.value} 人</span>
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
      <div className="card-elevated min-w-0 p-5">
        <div className="section-label">
          <div className="section-label-bar" />
          <h2 className="section-label-text">人员年龄结构</h2>
        </div>
        {ageData.every(d => d.value === 0) ? (
          <div className="h-52 flex items-center justify-center text-sm text-slate-500">暂无数据</div>
        ) : (
          <>
            <ul className="sr-only">
              {ageData.map(d => <li key={d.name}>{d.name}：{d.value} 人</li>)}
            </ul>
            <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ageData} barSize={28} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="#edf0f3" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#f1f4f8' }} formatter={(v) => `${v} 人`} contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" name="人数" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {ageData.map(d => (
                  <Cell key={d.name} fill={d.name === '未知' ? '#cbd5e1' : '#6aa5e7'} />
                ))}
              </Bar>
            </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  )
}
