import { describe, expect, it } from 'vitest'
import { computeBusinessYearStats, matchesBusinessYear } from '../business-year-stats'
describe('business annual summaries', () => {
  it('deduplicates inspected projects within a year, keeps years separate and excludes undated records', () => {
    const result = computeBusinessYearStats([
      { projectName: '甲', inspectionDate: '2025-01-01' }, { projectName: '甲 ', inspectionDate: '2025-12-01' },
      { projectName: '乙', inspectionDate: '2025-05-01' }, { projectName: '甲', inspectionDate: '2026-01-01' },
      { projectName: '无日期', inspectionDate: null },
    ], [
      { businessCategory: '起诉', hearingDate: '2025-01-01' }, { businessCategory: '应诉', hearingDate: '2025-02-01' },
      { businessCategory: null, hearingDate: '2025-02-01' }, { businessCategory: '起诉', hearingDate: null },
    ], '2026')
    expect(result.years).toEqual([
      { year: '2026', projects: 1, prosecutions: 0, defenses: 0, unclassified: 0 },
      { year: '2025', projects: 2, prosecutions: 1, defenses: 1, unclassified: 1 },
    ])
    expect(result.undatedInspections).toBe(1)
    expect(result.undatedCases).toBe(1)
  })
  it('shows the current year with zero totals in an empty account', () => {
    expect(computeBusinessYearStats([], [], '2026').years[0]).toMatchObject({ year: '2026', projects: 0, prosecutions: 0, defenses: 0 })
  })
  it('uses the same boundaries for ledger filtering', () => {
    expect(matchesBusinessYear('2025-12-31', '2026')).toBe(false)
    expect(matchesBusinessYear('2026-01-01', '2026')).toBe(true)
    expect(matchesBusinessYear(null, '2026')).toBe(false)
    expect(matchesBusinessYear(null, 'undated')).toBe(true)
    expect(matchesBusinessYear(null, '')).toBe(true)
  })
})
