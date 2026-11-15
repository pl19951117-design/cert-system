import { describe, expect, it } from 'vitest'
import { normalizeMoney, formatMoney } from '../business-records'
import { columnAlignment } from '@/components/aligned-table'

describe('ledger amounts', () => {
  it('preserves cents and formats yuan consistently', () => {
    expect(normalizeMoney('001,234.5')).toBe('1234.50')
    expect(normalizeMoney('0')).toBe('0.00')
    expect(normalizeMoney('999999999999.99')).toBe('999999999999.99')
    expect(formatMoney('1234567.80')).toBe('1,234,567.80')
    expect(formatMoney(null)).toBe('—')
    expect(normalizeMoney(' ')).toBeNull()
  })
  it('rejects negatives, fractional cents and unsafe large values', () => {
    for (const value of ['-1', '1.001', '1e6', 'NaN', '1000000000000', 'abc', {}, true]) {
      expect(() => normalizeMoney(value)).toThrow()
    }
  })
})

describe('column alignment', () => {
  it('keeps identities and narrative information left aligned', () => {
    for (const label of ['姓名', '归属建制', '负责人', '身份证号', '案件编号', '项目名称', '整改情况', '案件结果', '证件编号']) expect(columnAlignment(label)).toBe('left')
  })
  it('centers dates, states and operations regardless of column position', () => {
    for (const label of ['序号', '选择', '检查时间', '开庭时间', '有效期至', '状态', '操作']) expect(columnAlignment(label)).toBe('center')
  })
  it('right aligns money and comparable numeric values', () => {
    for (const label of ['合同金额', '涉案金额', '证件总数', '年龄', '剩余天数', '大小']) expect(columnAlignment(label)).toBe('right')
  })
})
