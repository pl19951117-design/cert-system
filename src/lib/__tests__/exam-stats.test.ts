import { describe, expect, it } from 'vitest'
import { canAdmit, computeExamStats, isExamPassed, type ExamLike } from '../exam-stats'

const E = (isPassed: string | null, certType: string | null, personId: number | null = null, regDate: string | null = null): ExamLike =>
  ({ isPassed, certType, personId, regDate })

describe('isExamPassed / canAdmit', () => {
  it('已通过、已取证算通过；待考、未通过不算', () => {
    expect(isExamPassed('已通过')).toBe(true)
    expect(isExamPassed('已取证')).toBe(true)
    expect(isExamPassed('待考')).toBe(false)
    expect(isExamPassed('未通过')).toBe(false)
    expect(isExamPassed(null)).toBe(false)
  })

  it('通过且未关联人员才可准入', () => {
    expect(canAdmit({ isPassed: '已通过', personId: null })).toBe(true)
    expect(canAdmit({ isPassed: '已取证', personId: null })).toBe(true)
    expect(canAdmit({ isPassed: '已通过', personId: 5 })).toBe(false)
    expect(canAdmit({ isPassed: '未通过', personId: null })).toBe(false)
    expect(canAdmit({ isPassed: '待考', personId: null })).toBe(false)
  })
})

describe('computeExamStats', () => {
  it('空输入 → 全 0', () => {
    const s = computeExamStats([], { year: 2026 })
    expect(s).toMatchObject({ total: 0, passRate: 0, decided: 0, pendingAdmission: 0, byType: [] })
  })

  it('状态计数、通过率只按已出结果算', () => {
    const s = computeExamStats([
      E('待考', 'A'), E('待考', 'A'),
      E('已通过', 'A'), E('已取证', 'B', 3),
      E('未通过', 'B'),
    ], { year: 2026 })
    expect(s).toMatchObject({ total: 5, pending: 2, passed: 1, certified: 1, failed: 1, decided: 3 })
    expect(s.passRate).toBe(66.7)
  })

  it('待准入 = 通过但未关联人员', () => {
    const s = computeExamStats([
      E('已通过', 'A'), E('已取证', 'B'), E('已通过', 'C1', 9), E('未通过', 'C2'),
    ], { year: 2026 })
    expect(s.pendingAdmission).toBe(2)
  })

  it('按类别分组：A < B < C1 < C2 < C3，未分类最后，各自通过率', () => {
    const s = computeExamStats([
      E('已通过', 'C3'), E('未通过', 'C1'), E('已通过', null), E('已取证', 'A'),
      E('未通过', 'A'), E('待考', 'B'), E('已通过', 'C1'), E('已通过', 'C2'),
    ], { year: 2026 })
    expect(s.byType.map(r => r.type)).toEqual(['A', 'B', 'C1', 'C2', 'C3', '未分类'])
    expect(s.byType[0]).toMatchObject({ total: 2, passed: 1, failed: 1, passRate: 50 })
    expect(s.byType[1]).toMatchObject({ total: 1, pending: 1, passRate: 0 })
  })

  it('空状态按待考计；类别去空格', () => {
    const s = computeExamStats([E(null, ' B '), E('', 'B')], { year: 2026 })
    expect(s.pending).toBe(2)
    expect(s.byType).toHaveLength(1)
    expect(s.byType[0].type).toBe('B')
  })

  it('今年报名人次按报名日期年份', () => {
    const s = computeExamStats([
      E('待考', 'A', null, '2026-03-01'), E('待考', 'A', null, '2025-12-31'), E('待考', 'A', null, null),
    ], { year: 2026 })
    expect(s.thisYear).toBe(1)
  })
})
