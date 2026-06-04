import { describe, it, expect } from 'vitest'
import { isValidIdCard } from '@/lib/idcard'

// 独立再实现校验码计算，用于生成测试用例（与被测实现分离）
function checkDigit(prefix17: string): string {
  const W = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
  const C = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
  let s = 0
  for (let i = 0; i < 17; i++) s += parseInt(prefix17[i]) * W[i]
  return C[s % 11]
}

const PREFIX = '11010119900307735' // 北京 1990-03-07，17 位
const VALID = PREFIX + checkDigit(PREFIX)

describe('isValidIdCard', () => {
  it('接受校验码正确的 18 位身份证', () => {
    expect(isValidIdCard(VALID)).toBe(true)
  })

  it('校验码错误时拒绝', () => {
    const wrong = checkDigit(PREFIX) === '0' ? '1' : '0'
    expect(isValidIdCard(PREFIX + wrong)).toBe(false)
  })

  it('拒绝长度/格式不对的输入', () => {
    expect(isValidIdCard('123')).toBe(false)
    expect(isValidIdCard(PREFIX)).toBe(false)            // 17 位
    expect(isValidIdCard(PREFIX + 'Y')).toBe(false)      // 非法末位
    expect(isValidIdCard('')).toBe(false)
    expect(isValidIdCard(null)).toBe(false)
    expect(isValidIdCard(undefined)).toBe(false)
  })

  it('拒绝非法出生日期', () => {
    const badMonth = '11010119901307735' // 13 月
    const badYear = '11010130000307735'  // 年份过大
    expect(isValidIdCard(badMonth + checkDigit(badMonth))).toBe(false)
    expect(isValidIdCard(badYear + checkDigit(badYear))).toBe(false)
  })

  it('容忍大小写与首尾空格', () => {
    expect(isValidIdCard(`  ${VALID.toLowerCase()}  `)).toBe(true)
  })
})
