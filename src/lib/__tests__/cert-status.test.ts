import { describe, it, expect } from 'vitest'
import { certStatus, worstStatus, getAge, compareCertType } from '@/lib/cert-status'

function dayStr(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

describe('certStatus', () => {
  it('无到期日 → none', () => expect(certStatus(null)).toBe('none'))
  it('已过期 → expired', () => expect(certStatus(dayStr(-10))).toBe('expired'))
  it('30 天内 → urgent', () => expect(certStatus(dayStr(10))).toBe('urgent'))
  it('90 天内 → warning', () => expect(certStatus(dayStr(60))).toBe('warning'))
  it('充裕 → ok', () => expect(certStatus(dayStr(200))).toBe('ok'))
  it('非法日期 → none', () => expect(certStatus('not-a-date')).toBe('none'))
})

describe('worstStatus', () => {
  it('空 → none', () => expect(worstStatus([])).toBe('none'))
  it('取最差：过期优先', () => {
    expect(worstStatus([{ expiryDate: dayStr(200) }, { expiryDate: dayStr(-1) }])).toBe('expired')
  })
  it('预警优先于正常', () => {
    expect(worstStatus([{ expiryDate: dayStr(200) }, { expiryDate: dayStr(60) }])).toBe('warning')
  })
  it('全部正常 → ok', () => {
    expect(worstStatus([{ expiryDate: dayStr(200) }])).toBe('ok')
  })
})

describe('getAge', () => {
  const year = new Date().getFullYear()
  it('从 18 位身份证取出生年算年龄', () => {
    expect(getAge('110101199003077358', null)).toBe(year - 1990)
  })
  it('身份证缺失时用 birthYear', () => {
    expect(getAge(null, 1985)).toBe(year - 1985)
  })
  it('都没有 → null', () => expect(getAge(null, null)).toBeNull())
  it('身份证年份非法时回退/为 null', () => expect(getAge('000000300003077358', null)).toBeNull())
})

describe('compareCertType', () => {
  it('英文+数字自然排序：A,B,C1,C2,C3', () => {
    expect(['C2', 'B', 'C1', 'C3', 'A'].sort(compareCertType)).toEqual(['A', 'B', 'C1', 'C2', 'C3'])
  })
  it('数字按数值而非字典序：C1 < C2 < C10', () => {
    expect(['C10', 'C2', 'C1'].sort(compareCertType)).toEqual(['C1', 'C2', 'C10'])
  })
  it('中文按拼音首字母：安(a) < 电(d)', () => {
    expect(['电工证', '安全员证'].sort(compareCertType)).toEqual(['安全员证', '电工证'])
  })
})
