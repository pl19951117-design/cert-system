import { describe, expect, it } from 'vitest'
import { safetySchema, legalSchema } from '../business-records'

describe('business record validation', () => {
  it('requires the identifying field and accepts empty optional fields', () => {
    expect(safetySchema.safeParse({ projectName: ' ' }).success).toBe(false)
    expect(legalSchema.safeParse({ caseNo: '' }).success).toBe(false)
    expect(safetySchema.parse({ projectName: ' 项目甲 ' })).toMatchObject({ projectName: '项目甲', amount: null, inspectionDate: null })
    expect(legalSchema.parse({ caseNo: '民初001', amount: '20.5' })).toMatchObject({ amount: '20.50', hearingDate: null })
  })
  it('rejects dates that look valid but do not exist', () => {
    for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-01-32']) {
      expect(safetySchema.safeParse({ projectName: '项目甲', inspectionDate: date }).success).toBe(false)
      expect(legalSchema.safeParse({ caseNo: '民初001', hearingDate: date }).success).toBe(false)
    }
    expect(safetySchema.parse({ projectName: '项目甲', inspectionDate: '2028-2-29' }).inspectionDate).toBe('2028-02-29')
  })
})
