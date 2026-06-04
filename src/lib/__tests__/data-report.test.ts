import { describe, expect, it } from 'vitest'
import {
  certCategory,
  computeDataReport,
  formatPeriodLabel,
  buildReportSheet,
  type ReportCertInput,
  type ReportChangeInput,
} from '../data-report'
import { CHANGE_TYPES } from '../change-log-stats'

const cert = (certType: string | null, social: string | null): ReportCertInput =>
  ({ certType, person: { socialSecurity: social } })
const chg = (changeType: string, certType: string | null, orgName: string | null, changeDate: string | null): ReportChangeInput =>
  ({ changeType, certType, orgName, changeDate })

describe('certCategory', () => {
  it('A / B 原样', () => {
    expect(certCategory('A')).toBe('A')
    expect(certCategory('B')).toBe('B')
    expect(certCategory(' a ')).toBe('A')
  })
  it('C1 / C2 / C3 / C → C', () => {
    expect(certCategory('C1')).toBe('C')
    expect(certCategory('C2')).toBe('C')
    expect(certCategory('C3')).toBe('C')
    expect(certCategory('C')).toBe('C')
  })
  it('其它 → other', () => {
    expect(certCategory(null)).toBe('other')
    expect(certCategory('')).toBe('other')
    expect(certCategory('D')).toBe('other')
  })
})

describe('formatPeriodLabel', () => {
  it('全部 / 单月 / 区间 / 单边', () => {
    expect(formatPeriodLabel()).toBe('全部时间')
    expect(formatPeriodLabel('2026-05', '2026-05')).toBe('2026年5月')
    expect(formatPeriodLabel('2026-01', '2026-03')).toBe('2026年1月 ~ 2026年3月')
    expect(formatPeriodLabel('2026-01', undefined)).toBe('2026年1月 起')
    expect(formatPeriodLabel(undefined, '2026-03')).toBe('截至 2026年3月')
  })
})

describe('computeDataReport — 当前快照', () => {
  it('按 A/B/C 分类统计总数、缴纳、覆盖率', () => {
    const certs = [
      cert('A', '江安集团'), cert('A', '无'),            // A: 2 总, 1 缴 → 50%
      cert('B', '江安集团'),                              // B: 1 总, 1 缴 → 100%
      cert('C1', '江安集团'), cert('C2', '未参保'), cert('C3', '扬州分公司'), // C: 3 总, 2 缴 → 66.7%
      cert('D', '江安集团'),                              // other: 1 总, 1 缴
    ]
    const r = computeDataReport({ certs, changeRows: [] })
    expect(r.current.overall).toEqual({ total: 7, paid: 5, coverage: 71.4 })
    expect(r.current.A).toEqual({ total: 2, paid: 1, coverage: 50 })
    expect(r.current.B).toEqual({ total: 1, paid: 1, coverage: 100 })
    expect(r.current.C).toEqual({ total: 3, paid: 2, coverage: 66.7 })
    expect(r.current.other).toEqual({ total: 1, paid: 1, coverage: 100 })
  })

  it('空 certs → 全 0', () => {
    const r = computeDataReport({ certs: [], changeRows: [] })
    expect(r.current.overall).toEqual({ total: 0, paid: 0, coverage: 0 })
  })
})

describe('computeDataReport — 转入/转出 + 月份过滤', () => {
  const rows: ReportChangeInput[] = [
    chg(CHANGE_TYPES.CERT_ADD, 'A', '一连', '2026-05-03'),
    chg(CHANGE_TYPES.CERT_ADD, 'C1', '二连', '2026-05-20'),
    chg(CHANGE_TYPES.CERT_ADD, 'B', '一连', '2026-04-10'),     // 4月，区间外
    chg(CHANGE_TYPES.CERT_REMOVE, 'C2', '三连', '2026-05-15'),
    chg(CHANGE_TYPES.CERT_REMOVE, 'A', '一连', '2026-05-28'),
    chg(CHANGE_TYPES.CERT_UPDATE, 'A', '一连', '2026-05-01'),  // 更新，不计
    chg(CHANGE_TYPES.PERSON_ADD, null, '一连', '2026-05-01'),  // 入职，不计
  ]

  it('选定 2026-05：转入 2（A1+C1），转出 2（C1+A1）', () => {
    const r = computeDataReport({ certs: [], changeRows: rows, from: '2026-05', to: '2026-05' })
    expect(r.transferIn.total).toBe(2)
    expect(r.transferIn.A).toBe(1)
    expect(r.transferIn.C).toBe(1)
    expect(r.transferIn.B).toBe(0)
    // orgs 保留首次出现顺序
    expect(r.transferIn.orgs).toEqual(['一连', '二连'])

    expect(r.transferOut.total).toBe(2)
    expect(r.transferOut.A).toBe(1)
    expect(r.transferOut.C).toBe(1)
    expect(r.transferOut.orgs).toEqual(['三连', '一连'])
    expect(r.periodLabel).toBe('2026年5月')
  })

  it('全部时间：含 4 月那条 B 类转入', () => {
    const r = computeDataReport({ certs: [], changeRows: rows })
    expect(r.transferIn.total).toBe(3)
    expect(r.transferIn.B).toBe(1)
    expect(r.transferIn.orgs).toEqual(['一连', '二连'])
  })

  it('区间过滤 2026-04 ~ 2026-05', () => {
    const r = computeDataReport({ certs: [], changeRows: rows, from: '2026-04', to: '2026-05' })
    expect(r.transferIn.total).toBe(3)
  })

  it('窗口外月份 2026-06 → 0', () => {
    const r = computeDataReport({ certs: [], changeRows: rows, from: '2026-06', to: '2026-06' })
    expect(r.transferIn.total).toBe(0)
    expect(r.transferOut.total).toBe(0)
  })

  it('设了区间时，日期缺失/非法的行被排除', () => {
    const r = computeDataReport({
      certs: [],
      changeRows: [chg(CHANGE_TYPES.CERT_ADD, 'A', '一连', null), chg(CHANGE_TYPES.CERT_ADD, 'A', '一连', 'bad')],
      from: '2026-05', to: '2026-05',
    })
    expect(r.transferIn.total).toBe(0)
  })

  it('无区间时，日期缺失的行仍计入', () => {
    const r = computeDataReport({
      certs: [],
      changeRows: [chg(CHANGE_TYPES.CERT_ADD, 'A', '一连', null)],
    })
    expect(r.transferIn.total).toBe(1)
  })
})

describe('buildReportSheet', () => {
  it('生成可导出的行数组，含三大块', () => {
    const r = computeDataReport({
      certs: [cert('A', '江安集团'), cert('C1', '无')],
      changeRows: [chg(CHANGE_TYPES.CERT_ADD, 'A', '一连', '2026-05-01')],
      from: '2026-05', to: '2026-05',
    })
    const sheet = buildReportSheet(r)
    const flat = sheet.map(row => row.join('|')).join('\n')
    expect(flat).toContain('三类人员证件数据报告')
    expect(flat).toContain('2026年5月')
    expect(flat).toContain('A 类')
    expect(flat).toContain('转入证件')
    expect(flat).toContain('转出证件')
    expect(flat).toContain('一连')
  })
})
