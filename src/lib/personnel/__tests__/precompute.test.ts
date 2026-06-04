import { describe, expect, it } from 'vitest'
import { buildDropdownOptions, buildPrecomputedMaps } from '../precompute'
import type { Person } from '../types'

const p = (id: number, over: Partial<Person> = {}): Person => ({
  id, name: `P${id}`,
  orgName: null, manager: null, idCard: null, birthYear: null,
  education: null, socialSecurity: null, sortOrder: null,
  certificates: [],
  ...over,
})

describe('buildPrecomputedMaps', () => {
  it('certStatusMap 以 cert.id 为键', () => {
    const people = [p(1, { certificates: [
      { id: 10, certType: 'A', certNo: null, issueDate: null, expiryDate: '2025-01-01', issuer: null },
      { id: 11, certType: 'A', certNo: null, issueDate: null, expiryDate: null, issuer: null },
    ]})]
    const maps = buildPrecomputedMaps(people, new Date('2026-01-01'))
    expect(maps.certStatusMap.get(10)).toBe('expired')
    expect(maps.certStatusMap.get(11)).toBe('none')
  })

  it('ageMap 优先用身份证年份，回落到 birthYear', () => {
    const people = [
      p(1, { idCard: '320000198001011234' }),  // 1980
      p(2, { idCard: null, birthYear: 1995 }),
      p(3, { idCard: null, birthYear: null }),
    ]
    const maps = buildPrecomputedMaps(people, new Date('2026-06-01'))
    expect(maps.ageMap.get(1)).toBe(46)
    expect(maps.ageMap.get(2)).toBe(31)
    expect(maps.ageMap.get(3)).toBeNull()
  })

  it('同一 now 注入 → 多次调用结果稳定', () => {
    const people = [p(1, { certificates: [
      { id: 10, certType: null, certNo: null, issueDate: null, expiryDate: '2026-02-15', issuer: null },
    ]})]
    const now = new Date('2026-01-01')
    const a = buildPrecomputedMaps(people, now)
    const b = buildPrecomputedMaps(people, now)
    expect(a.certStatusMap.get(10)).toBe(b.certStatusMap.get(10))
  })
})

describe('buildDropdownOptions', () => {
  it('去重 + null 过滤 + certTypes 排序', () => {
    const people = [
      p(1, { orgName: '一公司', manager: '王', certificates: [
        { id: 1, certType: 'C2', certNo: null, issueDate: null, expiryDate: null, issuer: null },
        { id: 2, certType: 'A',  certNo: null, issueDate: null, expiryDate: null, issuer: null },
      ]}),
      p(2, { orgName: '一公司', manager: null, certificates: [
        { id: 3, certType: 'B',  certNo: null, issueDate: null, expiryDate: null, issuer: null },
        { id: 4, certType: 'C1', certNo: null, issueDate: null, expiryDate: null, issuer: null },
      ]}),
    ]
    const d = buildDropdownOptions(people)
    expect(d.orgs).toEqual(['一公司'])
    expect(d.managers).toEqual(['王'])
    // 自然排序：C1 < C2，且 A < B < C
    expect(d.certTypes).toEqual(['A', 'B', 'C1', 'C2'])
  })
})
