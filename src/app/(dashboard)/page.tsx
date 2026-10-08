import Link from 'next/link'
import { getSession, decodeAccountCookie } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'
import { differenceInDays, parseISO } from 'date-fns'
import { DashboardCharts } from '@/components/dashboard-charts'
import { MonthlyChangeChart } from '@/components/monthly-change-chart'
import { DataReportLauncher } from '@/components/data-report-modal'
import { computeCertSocialStats } from '@/lib/cert-social-stats'
import { CHANGE_TYPES, computeMonthlyChange, reconstructTotals } from '@/lib/change-log-stats'
import { Sparkline } from '@/components/sparkline'

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
      changeType: { in: [CHANGE_TYPES.CERT_ADD, CHANGE_TYPES.CERT_REMOVE, CHANGE_TYPES.PERSON_ADD, CHANGE_TYPES.PERSON_REMOVE] },
      changeDate: { gte: sinceStr },
    },
    select: { changeType: true, certType: true, changeDate: true },
  })
  const monthly = computeMonthlyChange(monthlyRows, { now: nowDate, months: 12 })
  const thisMonth = monthly[monthly.length - 1] ?? { added: 0, removed: 0 }
  const peopleMonthly = computeMonthlyChange(monthlyRows, {
    now: nowDate, months: 12,
    kinds: { add: CHANGE_TYPES.PERSON_ADD, remove: CHANGE_TYPES.PERSON_REMOVE },
  })
  // 趋势小图：由当前总数 + 逐月增减倒推每月末的总数
  const certTrend = reconstructTotals(certs.length, monthly)
  const peopleTrend = reconstructTotals(people.length, peopleMonthly)
  const orgCount = new Set(people.map(p => p.orgName).filter(Boolean)).size

  const alertCerts = certs
    .filter(c => ['expired', 'urgent', 'warning'].includes(certStatus(c.expiryDate)))
    .sort((a, b) => {
      const da = a.expiryDate ? differenceInDays(parseISO(a.expiryDate), new Date()) : -9999
      const db = b.expiryDate ? differenceInDays(parseISO(b.expiryDate), new Date()) : -9999
      return da - db
    })
  const nearest = alertCerts.find(c => certStatus(c.expiryDate) !== 'expired')
  const nearestDays = nearest?.expiryDate ? differenceInDays(parseISO(nearest.expiryDate), new Date()) : null
  const segs = [
    { key: 'expired', label: '已过期',  n: expired, dot: 'bg-red-400',    bar: '#f87171' },
    { key: 'urgent',  label: '30 天内', n: urgent,  dot: 'bg-orange-400', bar: '#fb923c' },
    { key: 'warning', label: '90 天内', n: warning, dot: 'bg-amber-300',  bar: '#fcd34d' },
  ]

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

      {/* 驾驶舱：左侧主指标（需关注预警），右侧次要指标 + 趋势 */}
      <div className="grid grid-cols-12 gap-5 mb-8">
        <Link
          href="/alerts"
          className="col-span-12 lg:col-span-7 relative overflow-hidden rounded-[18px] p-7 text-white group block shadow-[var(--shadow-lg)]"
          style={{ background: 'linear-gradient(150deg, #1a3a63 0%, #0f2a4a 55%, #0a1d34 100%)' }}
        >
          {/* 纹理：细网格 + 金色弧 */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
            <defs>
              <pattern id="hero-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M36 0H0V36" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
            <circle cx="100%" cy="0" r="220" fill="none" stroke="rgba(224,198,119,0.22)" strokeWidth="1" />
            <circle cx="100%" cy="0" r="150" fill="none" stroke="rgba(224,198,119,0.14)" strokeWidth="1" />
          </svg>

          <div className="relative flex items-start justify-between gap-6">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.2em] text-gold-300/90">需关注证件</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[64px] font-extrabold leading-none tracking-tight tabular-nums">{alertN}</span>
                <span className="text-sm text-navy-200/80">本</span>
              </div>
              <div className="mt-2 text-[12.5px] text-navy-200/80">已过期或 90 天内到期</div>
            </div>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-medium text-white/90 group-hover:bg-white/[0.12] transition-colors whitespace-nowrap">
              查看预警 <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </div>

          {/* 比例条 */}
          <div className="relative mt-7 h-2 rounded-full bg-white/[0.08] overflow-hidden flex" aria-hidden="true">
            {alertN > 0 && segs.map(sg => sg.n > 0 && (
              <div key={sg.key} style={{ flexGrow: sg.n, background: sg.bar }} />
            ))}
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-4">
            {segs.map(sg => (
              <div key={sg.key}>
                <div className="flex items-center gap-1.5 text-[11.5px] text-navy-200/80">
                  <span className={`w-1.5 h-1.5 rounded-full ${sg.dot}`} />{sg.label}
                </div>
                <div className="mt-1 text-[22px] font-bold tabular-nums leading-none">{sg.n}</div>
              </div>
            ))}
          </div>

          <div className="relative mt-6 pt-4 border-t border-white/10 text-[12px] text-navy-200/80 truncate">
            {alertN === 0
              ? '所有证件均在有效期内，90 天内无到期'
              : nearest
                ? <>最近到期：<span className="text-white font-medium">{nearest.person.name}</span> · {nearest.certType ?? '未分类'} · <span className="text-gold-300 font-medium">还剩 {nearestDays} 天</span></>
                : <>共 <span className="text-white font-medium">{expired}</span> 本已过期，请尽快处理</>}
          </div>
        </Link>

        <div className="col-span-12 lg:col-span-5 grid grid-cols-2 gap-5">
          {/* 证件总数 + 12 个月趋势 */}
          <Link href="/personnel" className="col-span-2 card-elevated kpi-card p-5 block group">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 tracking-widest">证件总数</span>
              <span className="text-slate-300 group-hover:text-navy-600 transition-colors" aria-hidden="true">→</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="text-[40px] font-extrabold tracking-tight leading-none tabular-nums text-navy-900">{certs.length}</div>
                <div className="mt-2 text-[11.5px] text-slate-400 whitespace-nowrap">
                  本月 <span className="text-navy-700 font-semibold">+{thisMonth.added}</span>
                  <span className="mx-1">/</span>
                  <span className="text-gold-600 font-semibold">−{thisMonth.removed}</span> 本
                </div>
              </div>
              <Sparkline values={certTrend} width={170} height={52} color="#1f416b" className="min-w-0 shrink" label="近 12 个月证件总数趋势" />
            </div>
          </Link>

          {/* 员工总数 */}
          <Link href="/personnel" className="card-elevated kpi-card p-5 block group">
            <div className="text-[11px] font-bold text-slate-400 tracking-widest">员工总数</div>
            <div className="mt-2 text-[30px] font-extrabold tracking-tight leading-none tabular-nums text-slate-800">{people.length}</div>
            <div className="mt-2 text-[11.5px] text-slate-400">{orgCount} 个建制 · 人均 {people.length ? (certs.length / people.length).toFixed(1) : 0} 证</div>
            <Sparkline values={peopleTrend} width={150} height={28} color="#6b8bb3" fillOpacity={0.12} className="mt-3 w-full" label="近 12 个月员工数趋势" />
          </Link>

          {/* 参保率 */}
          <div className="card-elevated kpi-card p-5">
            <div className="text-[11px] font-bold text-slate-400 tracking-widest">证件参保率</div>
            <div className="mt-2 text-[30px] font-extrabold tracking-tight leading-none tabular-nums text-slate-800">
              {certSocial.paidPct.toFixed(1)}<span className="text-lg text-slate-400 ml-0.5">%</span>
            </div>
            <div className="mt-2 text-[11.5px] text-slate-400">{certSocial.paid} / {certSocial.total} 本已缴社保</div>
            <div className="mt-[22px] h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, certSocial.paidPct)}%`, background: 'linear-gradient(90deg, #e0c677, #c9a227)' }} />
            </div>
          </div>
        </div>
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
              <div className="text-3xl font-extrabold text-navy-700 tabular-nums leading-none">
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
