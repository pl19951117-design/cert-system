import { describe, expect, it } from 'vitest'
import {
  buildEducationExportRows, buildEducationRows, buildEducationSummaryRows, computeEducationStats,
  defaultEduYear, EMPTY_EDU_FILTER, filterEducationRows, groupEducationRows,
  type EduPerson, type EduRecord,
} from '../education'

const C = (id: number, certType: string | null, expiryDate: string | null) =>
  ({ id, certType, certNo: `NO${id}`, expiryDate })
const P = (id: number, orgName: string | null, certs: EduPerson['certificates'], manager: string | null = '王工'): EduPerson =>
  ({ id, name: `人${id}`, orgName, manager, idCard: null, certificates: certs })
const R = (certId: number, attended: boolean, attendedDate: string | null = null, note: string | null = null): EduRecord =>
  ({ certId, attended, attendedDate, note, updatedBy: 'admin', updatedAt: null })

describe('defaultEduYear', () => {
  it('默认下一整年', () => {
    expect(defaultEduYear(new Date(2026, 10, 12))).toBe(2027)
  })
})

describe('buildEducationRows', () => {
  const people = [
    P(1, '一分队', [C(12, 'C1', '2027-05-01'), C(11, 'B', '2027-12-31')]),
    P(2, '二分队', [C(21, 'A', '2028-01-01'), C(22, 'C2', '2026-12-31')]),
    P(3, '一分队', [C(31, 'C3', '2027-01-01'), C(32, 'A', null)]),
  ]

  it('只取有效期在该年度的证件；保持人员顺序，同人按类别 A<B<C1', () => {
    const rows = buildEducationRows(people, [], 2027)
    expect(rows.map(r => r.certId)).toEqual([11, 12, 31])
    expect(rows.every(r => !r.attended && !r.outOfYear)).toBe(true)
  })

  it('合并登记记录', () => {
    const rows = buildEducationRows(people, [R(12, true, '2027-03-01', '线上')], 2027)
    const r = rows.find(x => x.certId === 12)!
    expect(r).toMatchObject({ attended: true, attendedDate: '2027-03-01', note: '线上' })
  })

  it('登记过但有效期已改到别的年度的证件仍保留，标 outOfYear', () => {
    const rows = buildEducationRows(people, [R(21, true)], 2027)
    expect(rows.map(r => r.certId)).toEqual([11, 12, 21, 31])
    expect(rows.find(r => r.certId === 21)!.outOfYear).toBe(true)
  })
})

describe('filterEducationRows', () => {
  const rows = buildEducationRows([
    P(1, '一分队', [C(11, 'B', '2027-03-01')], '张工'),
    P(2, '二分队', [C(21, 'C2', '2027-08-15')], '李工'),
    P(3, '二分队', [C(31, 'A', '2030-01-01')]),
  ], [R(11, true), R(31, true)], 2027)

  it('姓名 / 建制 / 负责人 / 类别', () => {
    expect(filterEducationRows(rows, { ...EMPTY_EDU_FILTER, org: '二' }).map(r => r.certId)).toEqual([21, 31])
    expect(filterEducationRows(rows, { ...EMPTY_EDU_FILTER, manager: '张' }).map(r => r.certId)).toEqual([11])
    expect(filterEducationRows(rows, { ...EMPTY_EDU_FILTER, name: '人2' }).map(r => r.certId)).toEqual([21])
    expect(filterEducationRows(rows, { ...EMPTY_EDU_FILTER, certType: 'C2' }).map(r => r.certId)).toEqual([21])
  })

  it('登记状态', () => {
    expect(filterEducationRows(rows, { ...EMPTY_EDU_FILTER, status: 'attended' }).map(r => r.certId)).toEqual([11, 31])
    expect(filterEducationRows(rows, { ...EMPTY_EDU_FILTER, status: 'pending' }).map(r => r.certId)).toEqual([21])
  })

  it('到期月份：不含有效期已改到别的年度的行', () => {
    expect(filterEducationRows(rows, { ...EMPTY_EDU_FILTER, month: '08' }).map(r => r.certId)).toEqual([21])
    expect(filterEducationRows(rows, { ...EMPTY_EDU_FILTER, month: '01' })).toEqual([])
  })
})

describe('computeEducationStats / groupEducationRows', () => {
  const rows = buildEducationRows([
    P(1, '一分队', [C(11, 'B', '2027-03-01'), C(12, 'C1', '2027-04-01')]),
    P(2, '二分队', [C(21, 'B', '2027-08-15')]),
    P(3, '一分队', [C(31, null, '2027-09-01')]),
  ], [R(11, true), R(21, true), R(31, false)], 2027)

  it('统计：本数、人数、已参加、完成率、按类别（未分类最后）', () => {
    const s = computeEducationStats(rows)
    expect(s).toMatchObject({ certs: 4, people: 3, attended: 2, pending: 2, attendedPct: 50 })
    expect(s.byType).toEqual([
      { type: 'B', total: 2, attended: 2 },
      { type: 'C1', total: 1, attended: 0 },
      { type: '未分类', total: 1, attended: 0 },
    ])
  })

  it('空名单 → 全 0', () => {
    expect(computeEducationStats([])).toMatchObject({ certs: 0, people: 0, attendedPct: 0, byType: [] })
  })

  it('按建制分组：首次出现顺序，人数去重', () => {
    const g = groupEducationRows(rows)
    expect(g.map(x => [x.org, x.people, x.rows.length, x.attended, x.pending])).toEqual([
      ['一分队', 2, 3, 1, 2],
      ['二分队', 1, 1, 1, 0],
    ])
  })
})

describe('导出', () => {
  it('名单行：状态文字、序号、有效期变更写进备注', () => {
    const rows = buildEducationRows([P(1, '一分队', [C(11, 'B', '2027-03-01'), C(12, 'A', '2030-01-01')])],
      [R(11, true, '2027-02-01', '线上'), R(12, true)], 2027)
    const out = buildEducationExportRows(rows)
    expect(out[0]).toMatchObject({ '序号': 1, '证件类别': 'A', '继续教育': '已参加', '备注': '有效期已变更' })
    expect(out[1]).toMatchObject({ '序号': 2, '证件类别': 'B', '参加日期': '2027-02-01', '备注': '线上' })
  })

  it('汇总行：按类别 + 合计', () => {
    const s = computeEducationStats(buildEducationRows([P(1, 'x', [C(1, 'A', '2027-01-01'), C(2, 'A', '2027-02-01')])], [R(1, true)], 2027))
    expect(buildEducationSummaryRows(s)).toEqual([
      { '证件类别': 'A', '应参加（本）': 2, '已参加': 1, '未参加': 1, '完成率': '50.0%' },
      { '证件类别': '合计', '应参加（本）': 2, '已参加': 1, '未参加': 1, '完成率': '50.0%' },
    ])
  })
})
