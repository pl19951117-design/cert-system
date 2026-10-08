import { describe, expect, it } from 'vitest'
import type { CertStatusKey } from '@/lib/cert-status'
import { groupKeyOf, groupRowsByOrg, UNGROUPED_ORG } from '../grouping'
import type { Cert, FlatRow, Person } from '../types'

const P = (id: number, orgName: string | null, manager: string | null = null): Person => ({
  id, name: `人${id}`, orgName, manager, idCard: null, birthYear: null,
  education: null, socialSecurity: null, sortOrder: id, certificates: [],
})
const C = (id: number): Cert => ({ id, certType: 'A', certNo: null, issueDate: null, expiryDate: null, issuer: null })
const row = (person: Person, cert: Cert | null): FlatRow => ({ person, cert })

describe('groupKeyOf', () => {
  it('去空格；空值归入未填写建制', () => {
    expect(groupKeyOf(' 一分队 ')).toBe('一分队')
    expect(groupKeyOf('')).toBe(UNGROUPED_ORG)
    expect(groupKeyOf('   ')).toBe(UNGROUPED_ORG)
    expect(groupKeyOf(null)).toBe(UNGROUPED_ORG)
  })
})

describe('groupRowsByOrg', () => {
  it('空输入 → 空数组', () => {
    expect(groupRowsByOrg([], new Map())).toEqual([])
  })

  it('按首次出现顺序分组；人数去重、证件数只计真实证件', () => {
    const a1 = P(1, '二分队', '张')
    const a2 = P(2, '二分队', '李')
    const b1 = P(3, '一分队', '王')
    const rows = [
      row(a1, C(11)), row(a1, C(12)),
      row(b1, null),
      row(a2, C(13)),
    ]
    const groups = groupRowsByOrg(rows, new Map())
    expect(groups.map(g => g.org)).toEqual(['二分队', '一分队'])
    expect(groups[0]).toMatchObject({ people: 2, certs: 3, managers: ['张', '李'] })
    expect(groups[0].rows).toHaveLength(3)
    expect(groups[1]).toMatchObject({ people: 1, certs: 0, managers: ['王'] })
  })

  it('统计过期 / 紧急 / 预警', () => {
    const p = P(1, '一分队')
    const status = new Map<number, CertStatusKey>([[1, 'expired'], [2, 'urgent'], [3, 'warning'], [4, 'ok'], [5, 'warning']])
    const g = groupRowsByOrg([1, 2, 3, 4, 5].map(i => row(p, C(i))), status)[0]
    expect(g).toMatchObject({ expired: 1, urgent: 1, warning: 2, certs: 5 })
  })

  it('建制名前后空格视为同一组；空建制单独成组', () => {
    const groups = groupRowsByOrg([
      row(P(1, '一分队'), null),
      row(P(2, ' 一分队 '), null),
      row(P(3, null), null),
    ], new Map())
    expect(groups.map(g => [g.org, g.people])).toEqual([['一分队', 2], [UNGROUPED_ORG, 1]])
  })
})
