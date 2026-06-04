// 数据报告聚合 —— 纯函数，便于单测。
//
// 报告由两部分组成：
//   1) 当前快照（current）：以「现存有效证件」为口径，统计总数 / 缴纳社保数 / 覆盖率，
//      并按 三类人员 A / B / C 分类（C = C1 + C2 + C3）。
//   2) 期间流水（transferIn / transferOut）：以 ChangeLog 的「证件新增 / 证件注销」
//      为口径，统计选定月份范围内的转入 / 转出本数、ABC 分类、涉及建制。
//
// 「三类人员」是建筑施工企业安全生产管理人员的 A（主要负责人）/ B（项目负责人）/
// C（专职安全员，含 C1/C2/C3）分类。

import { isSocialPaid } from './cert-social-stats'
import { CHANGE_TYPES } from './change-log-stats'

export type ReportCategory = 'A' | 'B' | 'C' | 'other'

/** 把证件类别归并到 A / B / C / other（C 含 C1 C2 C3） */
export function certCategory(certType: string | null | undefined): ReportCategory {
  const t = (certType ?? '').trim().toUpperCase()
  if (t === 'A') return 'A'
  if (t === 'B') return 'B'
  if (t === 'C' || t === 'C1' || t === 'C2' || t === 'C3') return 'C'
  return 'other'
}

export type CoverageStat = {
  total: number
  paid: number
  /** 覆盖率 0–100，保留 1 位小数；total=0 时为 0 */
  coverage: number
}

export type FlowStat = {
  total: number
  A: number
  B: number
  C: number
  other: number
  /** 涉及的建制（去重、按中文排序） */
  orgs: string[]
}

export type DataReport = {
  periodLabel: string
  current: {
    overall: CoverageStat
    A: CoverageStat
    B: CoverageStat
    C: CoverageStat
    other: CoverageStat
  }
  transferIn: FlowStat
  transferOut: FlowStat
}

export type ReportCertInput = {
  certType: string | null
  person: { socialSecurity: string | null }
}

export type ReportChangeInput = {
  changeType: string | null
  certType: string | null
  orgName: string | null
  changeDate: string | null
}

function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10
}

/** 把 'YYYY-MM' 起止格式化成中文区间标签 */
export function formatPeriodLabel(from?: string, to?: string): string {
  const fmt = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5, 7))}月`
  if (!from && !to) return '全部时间'
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} ~ ${fmt(to)}`
  if (from) return `${fmt(from)} 起`
  return `截至 ${fmt(to!)}`
}

function inPeriod(changeDate: string | null, from?: string, to?: string): boolean {
  // 无区间 → 全部纳入（含日期缺失/异常的行）
  if (!from && !to) return true
  if (!changeDate || !/^\d{4}-\d{2}-\d{2}$/.test(changeDate)) return false
  const ym = changeDate.slice(0, 7)
  if (from && ym < from) return false
  if (to && ym > to) return false
  return true
}

export function computeDataReport(input: {
  certs: readonly ReportCertInput[]
  changeRows: readonly ReportChangeInput[]
  from?: string   // 'YYYY-MM' 含
  to?: string     // 'YYYY-MM' 含
}): DataReport {
  const from = input.from || undefined
  const to = input.to || undefined

  // ===== 当前快照 =====
  const acc: Record<'overall' | ReportCategory, { t: number; p: number }> = {
    overall: { t: 0, p: 0 }, A: { t: 0, p: 0 }, B: { t: 0, p: 0 }, C: { t: 0, p: 0 }, other: { t: 0, p: 0 },
  }
  for (const c of input.certs) {
    const cat = certCategory(c.certType)
    const paid = isSocialPaid(c.person.socialSecurity)
    acc.overall.t++; if (paid) acc.overall.p++
    acc[cat].t++; if (paid) acc[cat].p++
  }
  const toStat = (x: { t: number; p: number }): CoverageStat => ({ total: x.t, paid: x.p, coverage: pct(x.p, x.t) })

  // ===== 期间流水 =====
  const mk = () => ({ total: 0, A: 0, B: 0, C: 0, other: 0, orgs: new Set<string>() })
  const tin = mk()
  const tout = mk()
  for (const r of input.changeRows) {
    if (!inPeriod(r.changeDate, from, to)) continue
    const isAdd = r.changeType === CHANGE_TYPES.CERT_ADD
    const isRem = r.changeType === CHANGE_TYPES.CERT_REMOVE
    if (!isAdd && !isRem) continue
    const cat = certCategory(r.certType)
    const org = (r.orgName ?? '').trim()
    const bucket = isAdd ? tin : tout
    bucket.total++
    bucket[cat]++
    if (org) bucket.orgs.add(org)
  }
  // orgs 保留「首次出现顺序」（Set 天然如此），避免拼音排序把「一连/二连/三连」
  // 排成「二、三、一」这种反直觉顺序。
  const finish = (f: ReturnType<typeof mk>): FlowStat => ({
    total: f.total, A: f.A, B: f.B, C: f.C, other: f.other,
    orgs: [...f.orgs],
  })

  return {
    periodLabel: formatPeriodLabel(from, to),
    current: {
      overall: toStat(acc.overall),
      A: toStat(acc.A), B: toStat(acc.B), C: toStat(acc.C), other: toStat(acc.other),
    },
    transferIn: finish(tin),
    transferOut: finish(tout),
  }
}

/**
 * 把报告渲染成「行数组」（aoa），供 Excel 导出。纯数据、不依赖 xlsx。
 */
export function buildReportSheet(report: DataReport): (string | number)[][] {
  const cov = (s: CoverageStat) => `${s.coverage}%`
  const rows: (string | number)[][] = []
  rows.push(['三类人员证件数据报告'])
  rows.push(['统计期间（转入/转出）', report.periodLabel])
  rows.push([])
  rows.push(['一、当前证件与社保覆盖（现存有效证件）'])
  rows.push(['类别', '证件总数(本)', '缴纳社保(本)', '社保覆盖率'])
  rows.push(['全部', report.current.overall.total, report.current.overall.paid, cov(report.current.overall)])
  rows.push(['A 类', report.current.A.total, report.current.A.paid, cov(report.current.A)])
  rows.push(['B 类', report.current.B.total, report.current.B.paid, cov(report.current.B)])
  rows.push(['C 类(C1+C2+C3)', report.current.C.total, report.current.C.paid, cov(report.current.C)])
  if (report.current.other.total > 0) {
    rows.push(['其他类别', report.current.other.total, report.current.other.paid, cov(report.current.other)])
  }
  rows.push([])
  rows.push([`二、转入证件（证件新增）— ${report.periodLabel}`])
  rows.push(['合计(本)', 'A 类', 'B 类', 'C 类', ...(report.transferIn.other > 0 ? ['其他'] : [])])
  rows.push([
    report.transferIn.total, report.transferIn.A, report.transferIn.B, report.transferIn.C,
    ...(report.transferIn.other > 0 ? [report.transferIn.other] : []),
  ])
  rows.push(['涉及建制', report.transferIn.orgs.join('、') || '无'])
  rows.push([])
  rows.push([`三、转出证件（证件注销）— ${report.periodLabel}`])
  rows.push(['合计(本)', 'A 类', 'B 类', 'C 类', ...(report.transferOut.other > 0 ? ['其他'] : [])])
  rows.push([
    report.transferOut.total, report.transferOut.A, report.transferOut.B, report.transferOut.C,
    ...(report.transferOut.other > 0 ? [report.transferOut.other] : []),
  ])
  rows.push(['涉及建制', report.transferOut.orgs.join('、') || '无'])
  return rows
}
