import { describe, expect, it } from 'vitest'
import { computeCertSocialStats, isSocialPaid, type CertWithSocial } from '../cert-social-stats'

const C = (certType: string | null, socialSecurity: string | null): CertWithSocial => ({
  certType, person: { socialSecurity },
})

describe('isSocialPaid', () => {
  it('缴纳单位名（公司/分公司/处）→ true', () => {
    expect(isSocialPaid('江安集团')).toBe(true)
    expect(isSocialPaid('扬州分公司')).toBe(true)
    expect(isSocialPaid('已参保')).toBe(true)
  })
  it('空 / 仅空白 / null / undefined → false', () => {
    expect(isSocialPaid('')).toBe(false)
    expect(isSocialPaid('   ')).toBe(false)
    expect(isSocialPaid(null)).toBe(false)
    expect(isSocialPaid(undefined)).toBe(false)
  })
  it('中文「未缴纳」哨兵集合 → false', () => {
    expect(isSocialPaid('未参保')).toBe(false)
    expect(isSocialPaid('  未参保  ')).toBe(false)
    expect(isSocialPaid('无')).toBe(false)          // ← 回归：曾被误判为已缴纳
    expect(isSocialPaid('无社保')).toBe(false)
    expect(isSocialPaid('未缴')).toBe(false)
    expect(isSocialPaid('未缴纳')).toBe(false)
    expect(isSocialPaid('未交')).toBe(false)
    expect(isSocialPaid('否')).toBe(false)
    expect(isSocialPaid('没有')).toBe(false)
  })
  it('英文/数字哨兵 → false（大小写不敏感）', () => {
    expect(isSocialPaid('0')).toBe(false)
    expect(isSocialPaid('no')).toBe(false)
    expect(isSocialPaid('No')).toBe(false)
    expect(isSocialPaid('N/A')).toBe(false)
    expect(isSocialPaid('none')).toBe(false)
  })
  it('哨兵只做精确匹配，合法单位名（如「无锡分公司」）不被误判', () => {
    expect(isSocialPaid('无锡分公司')).toBe(true)
    expect(isSocialPaid('未来集团')).toBe(true)
  })
})

describe('computeCertSocialStats', () => {
  it('空输入 → 0/0/0', () => {
    const s = computeCertSocialStats([])
    expect(s).toEqual({ total: 0, paid: 0, paidPct: 0, byType: [] })
  })

  it('总数 / 已缴 / 占比', () => {
    const certs = [
      C('C1', '江安集团'),
      C('C1', '未参保'),
      C('C2', '扬州分公司'),
      C('C2', ''),
      C('C2', '南京工程处'),
    ]
    const s = computeCertSocialStats(certs)
    expect(s.total).toBe(5)
    expect(s.paid).toBe(3)
    expect(s.paidPct).toBe(60.0) // 3/5
  })

  it('按证件类型自然顺序 A < B < C1 < C2 < C3（与总数无关）', () => {
    const certs = [
      C('C3', '丙'),
      C('C2', '甲'),  C('C2', '乙'),  C('C2', '未参保'),
      C('A',  '甲'),
      C('C1', '甲'),  C('C1', '未参保'),
      C('B',  '丁'),  C('B', '戊'),
    ]
    const s = computeCertSocialStats(certs)
    // 即便 C2 总数最多，类型顺序仍以「证件类别自然序」为准
    expect(s.byType.map(r => r.type)).toEqual(['A', 'B', 'C1', 'C2', 'C3'])
  })

  it('「未分类」永远沉底', () => {
    const certs = [
      C('C2', '甲'),
      C(null, '乙'),       // 未分类
      C('A', '丙'),
    ]
    const s = computeCertSocialStats(certs)
    expect(s.byType.map(r => r.type)).toEqual(['A', 'C2', '未分类'])
  })

  it('缺类型 / 空白类型 → 「未分类」', () => {
    const certs = [C(null, '甲'), C('', '未参保'), C('   ', '乙')]
    const s = computeCertSocialStats(certs)
    expect(s.byType).toHaveLength(1)
    expect(s.byType[0].type).toBe('未分类')
    expect(s.byType[0].total).toBe(3)
    expect(s.byType[0].paid).toBe(2)
  })

  it('百分比保留 1 位小数', () => {
    // 1/3 = 33.333… → 33.3
    const certs = [C('C1', '甲'), C('C1', '未参保'), C('C1', '未参保')]
    const s = computeCertSocialStats(certs)
    expect(s.paidPct).toBe(33.3)
    expect(s.byType[0].paidPct).toBe(33.3)
  })

  it('字母类型按字母序，「未分类」永远沉底', () => {
    const certs = [C('Beta', '甲'), C('Alpha', '甲'), C(null, '乙')]
    const s = computeCertSocialStats(certs)
    expect(s.byType.map(r => r.type)).toEqual(['Alpha', 'Beta', '未分类'])
  })
})
