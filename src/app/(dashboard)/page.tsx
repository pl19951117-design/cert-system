import { getSession, decodeAccountCookie } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { differenceInDays, parseISO } from 'date-fns'
import { DashboardCharts } from '@/components/dashboard-charts'
import { MonthlyChangeChart } from '@/components/monthly-change-chart'
import { DataReportLauncher } from '@/components/data-report-modal'
import { computeCertSocialStats } from '@/lib/cert-social-stats'
import { CHANGE_TYPES, computeMonthlyChange } from '@/lib/change-log-stats'

function getAccount(accountIds: string[], saved?: string) {
  return accountIds.includes(saved ?? '') ? (saved as string) : (accountIds[0] ?? '')
}

function certStatus(expiry: string | null) {
  if (!expiry) return 'unknown'
  const days = differenceInDays(parseISO(expiry), new Date())
  if (days < 0) return 'expired'
  if (days <= 30) return 'urgent'
  if (days <= 90) return 'warning'
  return 'ok'
}

export default async function DashboardPage() {
  const session = await getSession()
  const cookieStore = await cookies()
  const accounts = await prisma.account.findMany()
  const accountIds = accounts.map(a => a.id)
  const account = getAccount(accountIds, decodeAccountCookie(cookieStore.get('cert-account')?.value))

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">总览看板</h1>
        <p className="text-slate-500">暂无账套，请先在系统管理中创建账套。</p>
      </div>
    )
  }

  const [people, certs] = await Promise.all([
    prisma.person.findMany({ where: { accountId: account, deletedAt: null } }),
    prisma.certificate.findMany({
      where: { deletedAt: null, person: { accountId: account, deletedAt: null } },
      include: { person: true },
    }),
  ])

  const expired = certs.filter(c => certStatus(c.expiryDate) === 'expired').length
  const urgent  = certs.filter(c => certStatus(c.expiryDate) === 'urgent').length
  const warning = certs.filter(c => certStatus(c.expiryDate) === 'warning').length
  const alertN  = expired + urgent + warning

  const kpis = [
    { label: '员工总数', value: people.length, sub: `共 ${new Set(people.map(p => p.orgName).filter(Boolean)).size} 个建制`, color: '#334155', border: 'border-l-slate-500' },
    { label: '证件总数', value: certs.length,  sub: `人均 ${people.length ? (certs.length / people.length).toFixed(1) : 0} 张`, color: '#d97706', border: 'border-l-amber-500' },
    { label: '需关注预警', value: alertN, sub: `过期 ${expired} · 紧急 ${urgent} · 预警 ${warning}`, color: '#dc2626', border: 'border-l-red-500' },
  ]

  const socialMap = new Map<string, number>()
  for (const p of people) {
    const key = p.socialSecurity?.trim() || '未填写'
    socialMap.set(key, (socialMap.get(key) || 0) + 1)
  }
  const socialData = Array.from(socialMap, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const now = new Date().getFullYear()
  function getAgeFromPerson(p: { idCard: string | null; birthYear: number | null }) {
    if (p.idCard && p.idCard.length === 18) {
      const y = parseInt(p.idCard.substring(6, 10))
      if (y > 1900 && y <= now) return now - y
    }
    if (p.birthYear && p.birthYear > 1900) return now - p.birthYear
    return null
  }
  const ageBuckets = { '30岁以下': 0, '31-40岁': 0, '41-50岁': 0, '51-60岁': 0, '60岁以上': 0, '未知': 0 }
  for (const p of people) {
    const age = getAgeFromPerson(p)
    if (age === null) ageBuckets['未知']++
    else if (age <= 30) ageBuckets['30岁以下']++
    else if (age <= 40) ageBuckets['31-40岁']++
    else if (age <= 50) ageBuckets['41-50岁']++
    else if (age <= 60) ageBuckets['51-60岁']++
    else ageBuckets['60岁以上']++
  }
  const ageData = Object.entries(ageBuckets)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))

  // 证件 × 社保 聚合（总数、缴纳社保数、占比；以及按类型分组的同口径数据）
  const certSocial = computeCertSocialStats(certs)

  // 每月新增 / 减少证件（近 12 个月，含当月）—— 仅取窗口内的相关行，减少 IO
  const nowDate = new Date()
  const sinceDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - 11, 1)
  const sinceStr = `${sinceDate.getFullYear()}-${String(sinceDate.getMonth() + 1).padStart(2, '0')}-01`
  const monthlyRows = await prisma.changeLog.findMany({
    where: {
      accountId: account,
      changeType: { in: [CHANGE_TYPES.CERT_ADD, CHANGE_TYPES.CERT_REMOVE] },
      changeDate: { gte: sinceStr },
    },
    select: { changeType: true, certType: true, changeDate: true },
  })
  const monthly = computeMonthlyChange(monthlyRows, { now: nowDate, months: 12 })

  const alertCerts = certs
    .filter(c => ['expired', 'urgent', 'warning'].includes(certStatus(c.expiryDate)))
    .sort((a, b) => {
      const da = a.expiryDate ? differenceInDays(parseISO(a.expiryDate), new Date()) : -9999
      const db = b.expiryDate ? differenceInDays(parseISO(b.expiryDate), new Date()) : -9999
      return da - db
    })

  return (
    <div>
      {/* 页头 */}
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">总览看板</h1>
          <p className="text-xs text-slate-400 mt-0.5">账套：{account}</p>
        </div>
        <DataReportLauncher />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        {kpis.map(k => (
          <div key={k.label} className={`card-elevated kpi-card border-l-[3px] ${k.border} p-5`}>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">{k.label}</div>
            <div className="text-4xl font-extrabold text-slate-900 tracking-tight leading-none tabular-nums" style={{ color: k.color }}>{k.value}</div>
            <div className="h-px bg-slate-100 my-3" />
            <div className="text-[11px] text-slate-400">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* 证件 × 社保 */}
      <div className="mb-8">
        <div className="section-label">
          <div className="section-label-bar" />
          <span className="section-label-text">证件 × 社保统计</span>
        </div>
        <div className="card-elevated overflow-hidden">
          {/* 总计行 */}
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 bg-slate-50/40">
            <div className="p-5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">证件总数</div>
              <div className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">{certSocial.total}</div>
              <div className="text-[11px] text-slate-400 mt-2">本</div>
            </div>
            <div className="p-5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">已缴纳社保</div>
              <div className="text-3xl font-extrabold text-emerald-600 tabular-nums leading-none">{certSocial.paid}</div>
              <div className="text-[11px] text-slate-400 mt-2">本（按持有人）</div>
            </div>
            <div className="p-5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">参保率</div>
              <div className="text-3xl font-extrabold text-amber-600 tabular-nums leading-none">
                {certSocial.paidPct.toFixed(1)}<span className="text-xl">%</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2">已缴纳 / 总数</div>
            </div>
          </div>

          {/* 按类型分组 */}
          {certSocial.byType.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">暂无证件数据</div>
          ) : (
            <table className="w-full table-premium">
              <thead>
                <tr>
                  <th>证件类别</th>
                  <th className="text-right">总数</th>
                  <th className="text-right">已缴纳社保</th>
                  <th className="text-right w-[28%]">本类型参保率</th>
                </tr>
              </thead>
              <tbody>
                {certSocial.byType.map(r => (
                  <tr key={r.type}>
                    <td className="font-medium text-slate-800">{r.type}</td>
                    <td className="text-right tabular-nums">{r.total}</td>
                    <td className="text-right tabular-nums text-emerald-700">{r.paid}</td>
                    <td className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex-1 max-w-[180px] h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500/80"
                            style={{ width: `${Math.min(100, r.paidPct)}%` }}
                            aria-hidden="true"
                          />
                        </div>
                        <span className="tabular-nums text-xs font-semibold text-slate-700 w-12 text-right">
                          {r.paidPct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 每月新增 / 减少证件柱状图 */}
      <MonthlyChangeChart data={monthly} />

      {/* 图表 */}
      <DashboardCharts socialData={socialData} ageData={ageData} />

      {/* 预警清单 */}
      <div>
        <div className="section-label">
          <div className="section-label-bar" />
          <span className="section-label-text">需关注证件清单（90天内到期 + 已过期）</span>
        </div>

        {alertCerts.length === 0 ? (
          <div className="card-elevated p-10 text-center">
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
                {alertCerts.map((c, i) => {
                  const st = certStatus(c.expiryDate)
                  const days = c.expiryDate ? differenceInDays(parseISO(c.expiryDate), new Date()) : null
                  const daysStr = days === null ? '—' : days < 0 ? `已超期 ${Math.abs(days)} 天` : `还剩 ${days} 天`
                  const badgeCls = st === 'expired' ? 'badge badge-red' : st === 'urgent' ? 'badge badge-orange' : 'badge badge-amber'
                  const label = st === 'expired' ? '已过期' : st === 'urgent' ? '紧急' : '预警'
                  const rowBg = st === 'expired' ? 'bg-red-50/30' : st === 'urgent' ? 'bg-orange-50/30' : ''
                  return (
                    <tr key={c.id} className={rowBg}>
                      <td>{c.person.orgName ?? '—'}</td>
                      <td>{c.person.manager ?? '—'}</td>
                      <td className="font-medium text-slate-800">{c.person.name}</td>
                      <td>{c.certType ?? '—'}</td>
                      <td className="font-mono text-xs text-slate-500">{c.certNo ?? '—'}</td>
                      <td>{c.expiryDate ?? '—'}</td>
                      <td><span className={badgeCls}>{label}</span></td>
                      <td className="text-xs text-slate-500">{daysStr}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
