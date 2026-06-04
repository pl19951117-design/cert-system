import { describe, expect, it } from 'vitest'
import { normalizeDate } from '../normalize-date'

describe('normalizeDate', () => {
  it('已是 YYYY-MM-DD → 原样（幂等）', () => {
    expect(normalizeDate('2025-01-03')).toBe('2025-01-03')
  })

  it('单位数月日补零', () => {
    expect(normalizeDate('2025-1-3')).toBe('2025-01-03')
    expect(normalizeDate('2026-12-1')).toBe('2026-12-01')
  })

  it('斜杠 / 点 / 中文分隔符', () => {
    expect(normalizeDate('2025/1/3')).toBe('2025-01-03')
    expect(normalizeDate('2025.1.3')).toBe('2025-01-03')
    expect(normalizeDate('2025年1月3日')).toBe('2025-01-03')
    expect(normalizeDate('2025/01/03')).toBe('2025-01-03')
  })

  it('带时间后缀也能取到日期部分', () => {
    expect(normalizeDate('2025-01-03 00:00:00')).toBe('2025-01-03')
    expect(normalizeDate('2025-01-03T12:30:00.000Z')).toBe('2025-01-03')
  })

  it('Date 对象 → 本地年月日', () => {
    expect(normalizeDate(new Date(2025, 0, 3))).toBe('2025-01-03')
  })

  it('Excel 日期序列号 → YYYY-MM-DD', () => {
    expect(normalizeDate(45658)).toBe('2025-01-01') // Excel 1900 系
    expect(normalizeDate(43831)).toBe('2020-01-01')
    expect(normalizeDate('45658')).toBe('2025-01-01') // 数字字符串同样处理
  })

  it('纯年份不会被误当作序列号', () => {
    expect(normalizeDate('2025')).toBeNull()
    expect(normalizeDate(2025)).toBeNull()
  })

  it('空 / null / undefined / 纯空白 → null', () => {
    expect(normalizeDate('')).toBeNull()
    expect(normalizeDate('   ')).toBeNull()
    expect(normalizeDate(null)).toBeNull()
    expect(normalizeDate(undefined)).toBeNull()
  })

  it('非法月份 / 乱码 → null', () => {
    expect(normalizeDate('2025-13-01')).toBeNull()
    expect(normalizeDate('2025-00-10')).toBeNull()
    expect(normalizeDate('abc')).toBeNull()
    expect(normalizeDate('不是日期')).toBeNull()
  })

  it('非法 Date → null', () => {
    expect(normalizeDate(new Date('invalid'))).toBeNull()
  })
})
