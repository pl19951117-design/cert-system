import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { yuanToWan, wanToYuan, type BusinessRecord } from '../business-records'
import { ledgerWorkbook, parseLedgerSheet } from '../ledger-excel'
import { validateChoices } from '@/server/business-records'

describe('ledger units and Excel', () => {
  it('preserves every cent when converting existing yuan values', () => {
    for (const value of ['0.00', '0.01', '10000.00', '123456.78', '999999999999.99']) {
      expect(wanToYuan(yuanToWan(value))).toBe(value)
    }
    expect(yuanToWan('10000.00')).toBe('1')
    expect(wanToYuan('1.234567')).toBe('12345.67')
    expect(() => wanToYuan('-1')).toThrow()
    expect(() => wanToYuan('0.0000001')).toThrow()
  })
  it('round trips safety amounts through actual Excel bytes in 万元', () => {
    const row = { id: 1, orgName: '甲', manager: '乙', projectName: '项目', amount: '12345.67', inspectionDate: '2026-11-17', rectification: '整改中' } satisfies BusinessRecord
    const bytes = XLSX.write(ledgerWorkbook('safety-inspections', [row]), { type: 'buffer', bookType: 'xlsx' })
    expect(parseLedgerSheet('safety-inspections', XLSX.read(bytes))[0]).toMatchObject({ projectName: '项目', amount: '12345.67', rectification: '整改中', inspectionDate: '2026-11-17' })
  })
  it('round trips category, type and 万元 amounts for legal cases', () => {
    const row = { id: 1, orgName: null, manager: null, caseNo: '001', businessCategory: '应诉', caseType: '工伤纠纷', amount: '25.00' } satisfies BusinessRecord
    const book = ledgerWorkbook('legal-cases', [row])
    expect(book.Sheets['台账'].F1.v).toBe('涉案金额（万元）')
    expect(book.Sheets['台账'].F2.v).toBe('0.0025')
    expect(parseLedgerSheet('legal-cases', book)[0]).toMatchObject({ caseNo: '001', businessCategory: '应诉', caseType: '工伤纠纷', amount: '25.00' })
  })
  it('provides an empty template and rejects wrong-unit headers', () => {
    const book = ledgerWorkbook('safety-inspections', [], true)
    expect(book.SheetNames).toEqual(['台账', '填写说明'])
    expect(() => parseLedgerSheet('safety-inspections', book)).toThrow('1 至 1000')
    book.Sheets['台账'].D1.v = '合同金额（元）'
    expect(() => parseLedgerSheet('safety-inspections', book)).toThrow('表头')
  })
  it('rejects new invalid options while preserving unchanged historical text', () => {
    expect(() => validateChoices('safety-inspections', { rectification: '历史备注' })).toThrow()
    expect(() => validateChoices('safety-inspections', { rectification: '历史备注' }, { rectification: '历史备注' })).not.toThrow()
    expect(() => validateChoices('legal-cases', { businessCategory: '其他' })).toThrow()
    expect(() => validateChoices('legal-cases', { businessCategory: '起诉', caseType: '合同纠纷' })).not.toThrow()
  })
})

import JSZip from 'jszip'
import { templateBytes } from '../ledger-template'

it.each([
  ['safety-inspections', '未整改,整改中,已整改'],
  ['legal-cases', '起诉,应诉'],
  ['exams', '待考,已通过,未通过,已取证'],
  ['education', '已参加,未参加'],
] as const)('writes a blank %s workbook with selectable values', async (kind, options) => {
  const bytes = await templateBytes(kind)
  const book = XLSX.read(bytes)
  expect(book.SheetNames).toEqual(['台账', '填写说明'])
  expect(XLSX.utils.sheet_to_json(book.Sheets['台账'])).toHaveLength(0)
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  expect(xml).toContain('<formula1>"' + options + '"</formula1>')
})

it('preserves exam identifiers and statuses through an Excel export and import', () => {
  const row = { name: '王明', idCard: '012345678901234567', certNo: '0003', isPassed: '已取证', regDate: '2026-11-19' }
  const bytes = XLSX.write(ledgerWorkbook('exams', [row]), { type: 'buffer', bookType: 'xlsx' })
  expect(parseLedgerSheet('exams', XLSX.read(bytes))[0]).toMatchObject(row)
})
