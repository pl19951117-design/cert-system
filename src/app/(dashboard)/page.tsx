import { BusinessYearSummary } from '@/components/business-year-summary'
import { computeBusinessYearStats } from '@/lib/business-year-stats'
import { AlignedTable } from '@/components/aligned-table'
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
import { computeExamStats } from '@/lib/exam-stats'
import { ArrowUpRight, CircleAlert, FileCheck2, ShieldCheck, Users } from 'lucide-react'

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
  await getSession()
  const cookieStore = await cookies()
  const accounts = await prisma.account.findMany()
  const accountIds = accounts.map(a => a.id)
  const account = getAccount(accountIds, decodeAccountCookie(cookieStore.get('cert-account')?.value))

  if (!account) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">总览看板</h1>
        <p className="text-slate-500">暂无账套，请先在系统管理中创建账套。</p>
      </div>
    )
  }

  const [people, certs, exams, inspections, legalCases] = await Promise.all([
    prisma.person.findMany({ where: { accountId: account, deletedAt: null } }),
    prisma.certificate.findMany({
      where: { deletedAt: null, person: { accountId: account, deletedAt: null } },
      include: { person: true },
    }),
    prisma.exam.findMany({
      where: { accountId: account },
      select: { isPassed: true, certType: true, personId: true, regDate: true },
    }),
    prisma.safetyInspection.findMany({ where: { accountId: account }, select: { projectName: true, inspectionDate: true } }),
    prisma.legalCase.findMany({ where: { accountId: account }, select: { businessCategory: true, hearingDate: true } }),
  ])
  const businessStats = computeBusinessYearStats(inspections, legalCases, String(new Date().getFullYear()))
  // 考试情况（报名 / 通过率 / 按类别 / 待准入人员库）
  const examStats = computeExamStats(exams)

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
    { key: 'expired', label: '已过期', n: expired },
    { key: 'urgent', label: '30 天内', n: urgent },
    { key: 'warning', label: '31–90 天内', n: warning },
  ]

  return (
    <div className="overview-page">
      <div className="page-header overview-header">
        <div className="flex-1">
          <h1>总览看板</h1>
          <p>{account} · 人员与证件运行概况</p>
        </div>
        <DataReportLauncher />
      </div>

      <section className="overview-metrics" aria-label="账套核心指标">
        <Link href="/personnel" className="overview-metric">
          <div className="metric-label"><FileCheck2 size={17} aria-hidden="true" />证件总数</div>
          <div className="metric-number">{certs.length}<span>本</span></div>
          <div className="metric-foot"><span>本月 <b>+{thisMonth.added}</b> / −{thisMonth.removed}</span><Sparkline values={certTrend} width={88} height={24} color="#0071e3" label="近 12 个月证件总数趋势" /></div>
        </Link>
        <Link href="/personnel" className="overview-metric">
          <div className="metric-label"><Users size={17} aria-hidden="true" />在册人员</div>
          <div className="metric-number">{people.length}<span>人</span></div>
          <div className="metric-foot"><span>{orgCount} 个建制 · 人均 {people.length ? (certs.length / people.length).toFixed(1) : 0} 证</span><Sparkline values={peopleTrend} width={60} height={24} color="#98989d" label="近 12 个月员工数趋势" /></div>
        </Link>
        <div className="overview-metric">
          <div className="metric-label"><ShieldCheck size={17} aria-hidden="true" />证件参保率</div>
          <div className="metric-number">{certSocial.paidPct.toFixed(1)}<span>%</span></div>
          <div className="metric-foot"><span>{certSocial.paid} / {certSocial.total} 本已缴社保</span></div>
        </div>
        <Link href="/alerts" className="overview-metric">
          <div className="metric-label"><CircleAlert size={17} aria-hidden="true" />需关注证件</div>
          <div className={`metric-number ${alertN > 0 ? 'metric-attention' : ''}`}>{alertN}<span>本</span></div>
          <div className="metric-foot"><span>已过期 {expired} · 90 天内 {urgent + warning}</span><ArrowUpRight size={16} aria-hidden="true" /></div>
        </Link>
      </section>

      <BusinessYearSummary stats={businessStats} currentYear={String(now)} />

      <div className="overview-primary-grid">
        <section className="overview-trend-panel card-elevated">
          <MonthlyChangeChart data={monthly} embedded />
        </section>
        <section className="overview-attention card-elevated" aria-labelledby="attention-heading">
          <div className="panel-heading"><div><h2 id="attention-heading">需要你关注</h2><p>及时处理，让重要事项不遗漏</p></div><span className="panel-symbol"><CircleAlert size={19} aria-hidden="true" /></span></div>
          <div className="attention-list">
            {segs.map((segment, i) => (
              <Link key={segment.key} href={`/alerts?status=${segment.key}`} className="attention-row">
                <span className={`attention-dot attention-dot-${i}`} aria-hidden="true" />
                <span>{segment.label}{i > 0 ? '到期' : ''}</span><strong>{segment.n}<small>本</small></strong><ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <div className="attention-note">
            {nearest ? <><span>最近到期</span><p><b>{nearest.person.name}</b> · {nearest.certType ?? '未分类'}<strong>还剩 {nearestDays} 天</strong></p></> : <p>{alertN === 0 ? '90 天内暂无到期证件' : '请及时处理已过期证件'}</p>}
          </div>
          <Link href={examStats.pendingAdmission ? '/exams?filter=待准入' : '/exams'} className="admission-row">
            <span className="admission-icon"><Users size={18} aria-hidden="true" /></span>
            <span><b>考试人员准入</b><small>{examStats.pendingAdmission ? `${examStats.pendingAdmission} 名通过人员待入库` : '暂无待准入人员'}</small></span><ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>

      <div className="overview-details-grid">
        <section className="card-elevated overview-table-panel">
          <div className="panel-heading"><div><h2>证件与社保</h2><p>按证件类别查看社保覆盖情况</p></div><span className="panel-pill">{certSocial.paidPct.toFixed(1)}% 已参保</span></div>
          <div className="overflow-x-auto">
            <AlignedTable columns={['证件类别','证件总数','已缴社保','参保率']} className="table-premium w-full"><caption className="sr-only">当前账套按证件类别统计的社保缴纳情况</caption>
              <thead><tr><th>证件类别</th><th className="text-right">证件总数</th><th className="text-right">已缴社保</th><th className="text-right">参保率</th></tr></thead>
              <tbody>{certSocial.byType.length ? certSocial.byType.map(row => (
                <tr key={row.type}><td><span className="cert-type-token">{row.type}</span></td><td className="text-right">{row.total}</td><td className="text-right">{row.paid}</td><td className="text-right"><span className="inline-rate"><i aria-hidden="true"><i style={{width: `${Math.min(100, row.paidPct)}%`}} /></i>{row.paidPct.toFixed(1)}%</span></td></tr>
              )) : <tr><td colSpan={4} className="!py-10 text-center">暂无证件数据</td></tr>}</tbody>
            </AlignedTable>
          </div>
          <div className="panel-footer">按持有人的社保情况统计<Link href="/personnel">查看人员台账<ArrowUpRight size={13} aria-hidden="true" /></Link></div>
        </section>
        <section className="card-elevated overview-table-panel">
          <div className="panel-heading"><div><h2>考试与取证</h2><p>今年报名 {examStats.thisYear} 人次 · 已取证 {examStats.certified} 人</p></div><Link href="/exams" className="panel-text-link">查看报名<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
          <div className="exam-summary-row">
            {[
              {label:'报名人次',value:examStats.total}, {label:'待考',value:examStats.pending},
              {label:'通过',value:examStats.passed + examStats.certified}, {label:'未通过',value:examStats.failed},
            ].map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}
          </div>
          <div className="overflow-x-auto"><AlignedTable columns={['类别','报名','待考','通过','未通过','通过率']} className="table-premium w-full"><caption className="sr-only">按证件类别统计的考试报名及通过情况</caption>
            <thead><tr><th>类别</th><th className="text-right">报名</th><th className="text-right">待考</th><th className="text-right">通过</th><th className="text-right">未通过</th><th className="text-right">通过率</th></tr></thead>
            <tbody>{examStats.byType.length ? examStats.byType.map(row => <tr key={row.type}><td><span className="cert-type-token">{row.type}</span></td><td className="text-right">{row.total}</td><td className="text-right">{row.pending}</td><td className="text-right">{row.passed}</td><td className="text-right">{row.failed}</td><td className="text-right">{row.passed + row.failed ? `${row.passRate.toFixed(1)}%` : '—'}</td></tr>) : <tr><td colSpan={6} className="!py-10 text-center">暂无考试报名</td></tr>}</tbody>
          </AlignedTable></div>
          <div className="panel-footer">{examStats.decided} 人次已出结果<span>整体通过率 <b>{examStats.passRate.toFixed(1)}%</b></span></div>
        </section>
      </div>

      <DashboardCharts socialData={socialData} ageData={ageData} />

      <section className="card-elevated overview-table-panel">
        <div className="panel-heading"><div><h2>证件关注清单</h2><p>已过期及未来 90 天内到期的证件</p></div><Link href="/alerts" className="panel-text-link">全部预警<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
        {alertCerts.length === 0 ? <div className="empty-overview"><ShieldCheck size={30} strokeWidth={1.5} aria-hidden="true" /><h3>当前没有需要关注的证件</h3><p>90 天内暂无证件到期</p></div> : (
          <div className="overflow-x-auto"><AlignedTable columns={['归属建制','负责人','姓名','证件类别','证件编号','到期日期','状态','剩余天数']} className="w-full table-premium"><caption className="sr-only">按到期日期排序的证件关注清单</caption>
            <thead><tr>{['归属建制','负责人','姓名','证件类别','证件编号','到期日期','状态','剩余天数'].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{alertCerts.map(cert => {
              const status = certStatus(cert.expiryDate)
              const days = cert.expiryDate ? differenceInDays(parseISO(cert.expiryDate), new Date()) : null
              return <tr key={cert.id}><td>{cert.person.orgName ?? '—'}</td><td>{cert.person.manager ?? '—'}</td><td><Link href={`/personnel/${cert.person.id}`} className="font-medium text-slate-900 hover:text-navy-700">{cert.person.name}</Link></td><td>{cert.certType ?? '—'}</td><td className="text-xs text-slate-500">{cert.certNo ?? '—'}</td><td>{cert.expiryDate ?? '—'}</td><td><span className={`badge ${status === 'expired' ? 'badge-red' : status === 'urgent' ? 'badge-orange' : 'badge-amber'}`}>{status === 'expired' ? '已过期' : status === 'urgent' ? '紧急' : '预警'}</span></td><td>{days === null ? '—' : days < 0 ? `已超期 ${Math.abs(days)} 天` : `还剩 ${days} 天`}</td></tr>
            })}</tbody>
          </AlignedTable></div>
        )}
      </section>
    </div>
  )
}
