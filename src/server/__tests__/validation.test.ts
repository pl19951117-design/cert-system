import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { HttpError } from '../http'
import { intNullable, isoDateNullable, parseId, trimmedNullable } from '../validation'

describe('parseId', () => {
  it('正整数通过', () => {
    expect(parseId('123')).toBe(123)
    expect(parseId('1')).toBe(1)
  })

  it('非法值抛 400', () => {
    for (const v of ['abc', '', '0', '-1', '1.5', 'NaN', '1e10000']) {
      expect(() => parseId(v)).toThrow(HttpError)
      try { parseId(v) } catch (e) {
        expect((e as HttpError).status).toBe(400)
        expect((e as HttpError).code).toBe('bad_request')
      }
    }
  })

  it('使用 field 名提示', () => {
    try { parseId('abc', 'certId') } catch (e) {
      expect((e as HttpError).message).toContain('certId')
    }
  })
})

describe('trimmedNullable', () => {
  const s = trimmedNullable
  it('空串/null/undefined → null', () => {
    expect(s.parse('')).toBeNull()
    expect(s.parse('   ')).toBeNull()
    expect(s.parse(null)).toBeNull()
    expect(s.parse(undefined)).toBeNull()
  })
  it('字符串两端 trim 后保留', () => {
    expect(s.parse('  hello  ')).toBe('hello')
  })
})

describe('isoDateNullable', () => {
  const s = isoDateNullable
  it('合法 YYYY-MM-DD 通过', () => {
    expect(s.parse('2026-01-15')).toBe('2026-01-15')
  })
  it('单位数字月日自动补 0', () => {
    expect(s.parse('2026-1-3')).toBe('2026-01-03')
    expect(s.parse('2026-12-1')).toBe('2026-12-01')
  })
  it('空串/null → null', () => {
    expect(s.parse('')).toBeNull()
    expect(s.parse(null)).toBeNull()
  })
  it('非法格式抛 ZodError', () => {
    expect(() => s.parse('2026/01/15')).toThrow()
    expect(() => s.parse('abcd')).toThrow()
  })
})

describe('intNullable', () => {
  it('数字/数字字符串通过', () => {
    expect(intNullable().parse(42)).toBe(42)
    expect(intNullable().parse('42')).toBe(42)
    expect(intNullable().parse('  42  ')).toBe(42)
  })
  it('空串/null → null', () => {
    expect(intNullable().parse('')).toBeNull()
    expect(intNullable().parse(null)).toBeNull()
  })
  it('非整数 / 非数字抛错', () => {
    expect(() => intNullable().parse('abc')).toThrow()
    expect(() => intNullable().parse('1.5')).toThrow()
  })
  it('min/max 边界', () => {
    const s = intNullable({ min: 1, max: 100 })
    expect(s.parse(50)).toBe(50)
    expect(() => s.parse(0)).toThrow()
    expect(() => s.parse(101)).toThrow()
  })
})

describe('HttpError unwrap shape', () => {
  it('zod 错误能通过 schema 触发', () => {
    const schema = z.object({ name: z.string().min(1) })
    try { schema.parse({ name: '' }) } catch (e) {
      expect((e as Error).name).toBe('ZodError')
    }
  })
})
