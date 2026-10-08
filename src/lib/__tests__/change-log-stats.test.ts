import { describe, expect, it } from 'vitest'
import {
  CHANGE_TYPES,
  computeChangeStats,
  computeMonthlyChange,
  reconstructTotals,
  todayYMD,
  type ChangeLogRow,
} from '../change-log-stats'

const R = (changeType: string | null, certType: string | null, changeDate: string | null): ChangeLogRow =>
  ({ changeType, certType, changeDate })

describe('computeChangeStats', () => {
  it('空输入 → 0/0/[]', () => {
    expect(computeChangeStats([])).toEqual({ added: 0, removed: 0, byType: [] })
  })

  it('只统计 证件新增 / 证件注销，其他类型忽略', () => {
    const s = computeChangeStats([
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2026-01-01'),
      R(CHANGE_TYPES.CERT_REMOVE, 'C1', '2026-01-02'),
      R(CHANGE_TYPES.PERSON_ADD, null, '2026-01-03'),
      R(CHANGE_TYPES.PERSON_REMOVE, null, '2026-01-03'),
      R(CHANGE_TYPES.CERT_UPDATE, 'C1', '2026-01-04'), // 不计
      R('信息变更', 'C2', '2026-01-04'),                // 不计
    ])
    expect(s.added).toBe(1)
    expect(s.removed).toBe(1)
    expect(s.byType).toEqual([{ type: 'C1', added: 1, removed: 1 }])
  })

  it('按类型分组，按总活跃度降序', () => {
    const s = computeChangeStats([
      R(CHANGE_TYPES.CERT_ADD, 'C2', '2026-01-01'),
      R(CHANGE_TYPES.CERT_ADD, 'C2', '2026-01-01'),
      R(CHANGE_TYPES.CERT_REMOVE, 'C2', '2026-01-02'),
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2026-01-03'),
      R(CHANGE_TYPES.CERT_REMOVE, 'A', '2026-01-04'),
    ])
    expect(s.added).toBe(3)
    expect(s.removed).toBe(2)
    expect(s.byType.map(r => r.type)).toEqual(['C2', 'A', 'C1'])
    expect(s.byType[0]).toEqual({ type: 'C2', added: 2, removed: 1 })
  })

  it('缺类型 / 空白类型 → 「未分类」', () => {
    const s = computeChangeStats([
      R(CHANGE_TYPES.CERT_ADD, null, '2026-01-01'),
      R(CHANGE_TYPES.CERT_ADD, '', '2026-01-02'),
      R(CHANGE_TYPES.CERT_ADD, '   ', '2026-01-03'),
    ])
    expect(s.byType).toEqual([{ type: '未分类', added: 3, removed: 0 }])
  })
})

describe('computeMonthlyChange', () => {
  const now = new Date(2026, 4, 15) // 2026-05-15

  it('生成最近 N 个月（含当月），从旧到新', () => {
    const out = computeMonthlyChange([], { now, months: 3 })
    expect(out.map(p => p.month)).toEqual(['2026-03', '2026-04', '2026-05'])
    expect(out.every(p => p.added === 0 && p.removed === 0)).toBe(true)
  })

  it('正确分桶到对应月份', () => {
    const out = computeMonthlyChange([
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2026-03-05'),
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2026-05-31'),
      R(CHANGE_TYPES.CERT_REMOVE, 'C2', '2026-04-01'),
      R(CHANGE_TYPES.CERT_REMOVE, 'C2', '2026-05-15'),
    ], { now, months: 3 })
    expect(out).toEqual([
      { month: '2026-03', added: 1, removed: 0 },
      { month: '2026-04', added: 0, removed: 1 },
      { month: '2026-05', added: 1, removed: 1 },
    ])
  })

  it('窗口外的行被忽略', () => {
    const out = computeMonthlyChange([
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2025-12-01'), // 在 3 个月窗口外
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2026-05-01'),
    ], { now, months: 3 })
    expect(out.find(p => p.month === '2026-05')!.added).toBe(1)
    expect(out.reduce((s, p) => s + p.added, 0)).toBe(1)
  })

  it('changeDate 非法格式被忽略', () => {
    const out = computeMonthlyChange([
      R(CHANGE_TYPES.CERT_ADD, 'C1', null),
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2026/05/01'),
      R(CHANGE_TYPES.CERT_ADD, 'C1', 'abc'),
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2026-05-15'),
    ], { now, months: 3 })
    expect(out.find(p => p.month === '2026-05')!.added).toBe(1)
  })

  it('跨年也能正确生成', () => {
    const out = computeMonthlyChange([], { now: new Date(2026, 1, 10), months: 4 })
    expect(out.map(p => p.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('默认 months=12', () => {
    const out = computeMonthlyChange([], { now })
    expect(out).toHaveLength(12)
    expect(out[11].month).toBe('2026-05')
  })

  it('忽略非新增/注销的类型', () => {
    const out = computeMonthlyChange([
      R(CHANGE_TYPES.CERT_UPDATE, 'C1', '2026-05-01'),
      R(CHANGE_TYPES.PERSON_ADD, null, '2026-05-02'),
    ], { now, months: 1 })
    expect(out[0]).toEqual({ month: '2026-05', added: 0, removed: 0 })
  })
})

describe('todayYMD', () => {
  it('给定日期 → 本地 YYYY-MM-DD', () => {
    expect(todayYMD(new Date(2026, 0, 3))).toBe('2026-01-03')
    expect(todayYMD(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('computeMonthlyChange · kinds（人员口径）', () => {
  it('传入入职/离职时只统计人员流水', () => {
    const now = new Date(2026, 4, 15)
    const out = computeMonthlyChange([
      R(CHANGE_TYPES.PERSON_ADD, null, '2026-05-02'),
      R(CHANGE_TYPES.PERSON_ADD, null, '2026-05-03'),
      R(CHANGE_TYPES.PERSON_REMOVE, null, '2026-05-04'),
      R(CHANGE_TYPES.CERT_ADD, 'C1', '2026-05-05'),
    ], { now, months: 1, kinds: { add: CHANGE_TYPES.PERSON_ADD, remove: CHANGE_TYPES.PERSON_REMOVE } })
    expect(out[0]).toEqual({ month: '2026-05', added: 2, removed: 1 })
  })
})

describe('reconstructTotals', () => {
  it('由当前总数倒推每月末总数，末项即当前', () => {
    expect(reconstructTotals(100, [
      { added: 5, removed: 0 },
      { added: 0, removed: 3 },
      { added: 10, removed: 2 },
    ])).toEqual([95, 92, 100])
  })
  it('空数组 → 空', () => {
    expect(reconstructTotals(10, [])).toEqual([])
  })
  it('流水不全导致倒推为负时截到 0', () => {
    expect(reconstructTotals(2, [{ added: 0, removed: 0 }, { added: 5, removed: 0 }])).toEqual([0, 2])
  })
})
