// 验证 derivePersonnelView 的核心契约 — 这是表格 / 导出 / 统计的唯一事实源
// 重点覆盖：AND-within 一致性、无证件占位语义、多人多证场景、stats 与 flatRows 同源

import { describe, expect, it } from 'vitest'
import { buildPrecomputedMaps } from '../precompute'
import { derivePersonnelView, EMPTY_FILTERS } from '../filter'
import type { Cert, Person } from '../types'

const FIXED_NOW = new Date('2026-01-01T00:00:00Z')

// 锚定的过期日期：以 FIXED_NOW 算
//   2025-12-01 → 已过期
//   2026-01-15 → 紧急（14天）
//   2026-02-15 → 紧急（45天 → 实际属 warning，调整）
//   2026-03-15 → warning（73天）
//   2026-12-01 → ok（>90天）
const D = {
  expired: '2025-12-01',
  urgent:  '2026-01-15', // 14 天
  warning: '2026-03-15', // ~73 天
  ok:      '2026-12-01',
}

function cert(id: number, certType: string, expiryDate: string | null): Cert {
  return { id, certType, certNo: `NO${id}`, issueDate: null, expiryDate, issuer: null }
}

function person(id: number, name: string, certs: Cert[], extra: Partial<Person> = {}): Person {
  return {
    id, name,
    orgName: null, manager: null, idCard: null, birthYear: null,
    education: null, socialSecurity: null, sortOrder: null,
    certificates: certs,
    ...extra,
  }
}

describe('derivePersonnelView', () => {
  it('无任何筛选时：每本证件展开一行 + 无证件人员占位', () => {
    const people: Person[] = [
      person(1, '张三', [cert(11, 'A', D.ok), cert(12, 'B', D.urgent)]),
      person(2, '李四', []),
    ]
    const maps = buildPrecomputedMaps(people, FIXED_NOW)
    const v = derivePersonnelView(people, EMPTY_FILTERS, maps)

    expect(v.flatRows).toHaveLength(3)
    expect(v.flatRows[0]).toMatchObject({ person: { id: 1 }, cert: { id: 11 } })
    expect(v.flatRows[1]).toMatchObject({ person: { id: 1 }, cert: { id: 12 } })
    expect(v.flatRows[2]).toMatchObject({ person: { id: 2 }, cert: null })
    expect(v.totalCerts).toBe(2)
  })

  it('筛选「紧急」状态：只显示紧急证件的那一行（用户原 bug）', () => {
    const people = [
      person(1, '贺志清', [
        cert(11, 'B',  D.ok),
        cert(12, 'C2', D.urgent),
      ]),
    ]
    const maps = buildPrecomputedMaps(people, FIXED_NOW)
    const v = derivePersonnelView(people, { ...EMPTY_FILTERS, certStatus: 'urgent' }, maps)

    expect(v.flatRows).toHaveLength(1)
    expect(v.flatRows[0].cert?.id).toBe(12)
    expect(v.flatRows[0].cert?.certType).toBe('C2')
  })

  it('AND-within：类别 B + 状态紧急，不会因为「有 B」+「有别的紧急」就误命中', () => {
    const people = [
      person(1, '张三', [
        cert(11, 'B',  D.expired),  // B 但过期
        cert(12, 'C2', D.urgent),    // 紧急但 C2
      ]),
    ]
    const maps = buildPrecomputedMaps(people, FIXED_NOW)
    const v = derivePersonnelView(people, { ...EMPTY_FILTERS, certTypes: ['B'], certStatus: 'urgent' }, maps)

    // 没有一本证件同时满足"B" + "紧急"
    expect(v.filtered).toHaveLength(0)
    expect(v.flatRows).toHaveLength(0)
  })

  it('AND-within 正例：类别 B + 状态过期', () => {
    const people = [
      person(1, '张三', [cert(11, 'B', D.expired), cert(12, 'C2', D.urgent)]),
    ]
    const maps = buildPrecomputedMaps(people, FIXED_NOW)
    const v = derivePersonnelView(people, { ...EMPTY_FILTERS, certTypes: ['B'], certStatus: 'expired' }, maps)

    expect(v.flatRows).toHaveLength(1)
    expect(v.flatRows[0].cert?.id).toBe(11)
  })

  it('「无证件」筛选：保留人员无证件占位 + 证件无到期日的行', () => {
    const people = [
      person(1, '无证人', []),
      person(2, '有证人', [cert(21, 'A', null), cert(22, 'B', D.ok)]),
    ]
    const maps = buildPrecomputedMaps(people, FIXED_NOW)
    const v = derivePersonnelView(people, { ...EMPTY_FILTERS, certStatus: 'none' }, maps)

    expect(v.flatRows).toHaveLength(2)
    expect(v.flatRows[0]).toMatchObject({ person: { id: 1 }, cert: null })
    expect(v.flatRows[1].cert?.id).toBe(21) // 无到期日的那一本
  })

  it('「无证件」+ 证件类别筛选：无证件人员不该出现', () => {
    const people = [person(1, '无证人', [])]
    const maps = buildPrecomputedMaps(people, FIXED_NOW)
    const v = derivePersonnelView(people, { ...EMPTY_FILTERS, certTypes: ['A'], certStatus: 'none' }, maps)
    expect(v.flatRows).toHaveLength(0)
  })

  it('stats 与 flatRows 完全同源（计数等于行数）', () => {
    const people = [
      person(1, '张三', [cert(11, 'A', D.ok), cert(12, 'A', D.urgent), cert(13, 'B', D.expired)]),
      person(2, '李四', [cert(21, 'B', D.warning)]),
    ]
    const maps = buildPrecomputedMaps(people, FIXED_NOW)
    const v = derivePersonnelView(people, EMPTY_FILTERS, maps)
    const rowCount = v.flatRows.filter(r => r.cert).length
    expect(v.totalCerts).toBe(rowCount)
    expect(v.certStats.reduce((s, x) => s + x.total, 0)).toBe(rowCount)
  })

  it('人员属性筛选：org / manager / name / education / social / age 全部生效', () => {
    const people = [
      person(1, '张三', [], { orgName: '一公司', manager: '王工', education: '本科', socialSecurity: '已参保', idCard: '320000198001011234' }),
      person(2, '李四', [], { orgName: '二公司', manager: '李工', education: '大专', socialSecurity: '未参保', idCard: '320000199501011234' }),
    ]
    const maps = buildPrecomputedMaps(people, FIXED_NOW)

    expect(derivePersonnelView(people, { ...EMPTY_FILTERS, org: '一' }, maps).filtered.map(p => p.id)).toEqual([1])
    expect(derivePersonnelView(people, { ...EMPTY_FILTERS, manager: '李' }, maps).filtered.map(p => p.id)).toEqual([2])
    expect(derivePersonnelView(people, { ...EMPTY_FILTERS, name: '张' }, maps).filtered.map(p => p.id)).toEqual([1])
    expect(derivePersonnelView(people, { ...EMPTY_FILTERS, education: '大专' }, maps).filtered.map(p => p.id)).toEqual([2])
    expect(derivePersonnelView(people, { ...EMPTY_FILTERS, social: '已参保' }, maps).filtered.map(p => p.id)).toEqual([1])
    // 1980年生 — 2026 算 46 岁
    expect(derivePersonnelView(people, { ...EMPTY_FILTERS, age: '41-50' }, maps).filtered.map(p => p.id)).toEqual([1])
  })
})
