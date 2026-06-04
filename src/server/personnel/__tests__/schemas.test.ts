import { describe, expect, it } from 'vitest'
import { certCreateSchema, certUpdateSchema, personCreateSchema, personUpdateSchema } from '../schemas'

describe('personCreateSchema', () => {
  it('最小合法输入', () => {
    const r = personCreateSchema.parse({ name: '张三' })
    expect(r.name).toBe('张三')
  })

  it('name trim 后空 → 报错', () => {
    expect(() => personCreateSchema.parse({ name: '   ' })).toThrow(/姓名/)
  })

  it('name 缺失 → 报错', () => {
    expect(() => personCreateSchema.parse({})).toThrow()
  })

  it('birthYear 越界 → 报错', () => {
    expect(() => personCreateSchema.parse({ name: 'x', birthYear: 1800 })).toThrow(/出生年份/)
    expect(() => personCreateSchema.parse({ name: 'x', birthYear: 9999 })).toThrow(/出生年份/)
  })

  it('birthYear 字符串自动转数字', () => {
    const r = personCreateSchema.parse({ name: 'x', birthYear: '1990' })
    expect(r.birthYear).toBe(1990)
  })

  it('空串字段被归一化为 null', () => {
    const r = personCreateSchema.parse({ name: 'x', orgName: '', manager: '   ' })
    expect(r.orgName).toBeNull()
    expect(r.manager).toBeNull()
  })

  it('未知字段被静默丢弃（如客户端附带的 certType）', () => {
    const r = personCreateSchema.parse({ name: 'x', certType: 'A', certNo: 'NO1' } as Record<string, unknown>)
    expect((r as Record<string, unknown>).certType).toBeUndefined()
    expect((r as Record<string, unknown>).certNo).toBeUndefined()
  })

  it('name 过长 → 报错', () => {
    expect(() => personCreateSchema.parse({ name: 'a'.repeat(101) })).toThrow(/姓名过长/)
  })
})

describe('personUpdateSchema', () => {
  it('与 create 同样要求 name', () => {
    expect(() => personUpdateSchema.parse({ name: '' })).toThrow()
  })
})

describe('certCreateSchema / certUpdateSchema', () => {
  it('全空通过', () => {
    expect(certCreateSchema.parse({})).toEqual({})
  })

  it('日期合法且归一化', () => {
    const r = certCreateSchema.parse({ expiryDate: '2026-6-3' })
    expect(r.expiryDate).toBe('2026-06-03')
  })

  it('日期非法 → 报错', () => {
    expect(() => certCreateSchema.parse({ expiryDate: '2026/06/03' })).toThrow()
  })

  it('字段 trim + 空串归 null', () => {
    const r = certUpdateSchema.parse({ certType: '  A  ', certNo: '', issuer: null })
    expect(r.certType).toBe('A')
    expect(r.certNo).toBeNull()
    expect(r.issuer).toBeNull()
  })
})
