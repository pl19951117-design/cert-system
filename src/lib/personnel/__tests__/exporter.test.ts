import { describe, expect, it } from 'vitest'
import { buildPersonnelExportRows } from '../exporter'
import { buildPrecomputedMaps } from '../precompute'
import type { Cert, FlatRow, Person } from '../types'

const cert = (id: number, certType: string, expiryDate: string | null): Cert => ({
  id, certType, certNo: `NO${id}`, issueDate: null, expiryDate, issuer: null,
})
const person = (id: number, over: Partial<Person> = {}): Person => ({
  id, name: `P${id}`, orgName: '一公司', manager: '王工',
  idCard: '320000198001011234', birthYear: null,
  education: '本科', socialSecurity: '已参保', sortOrder: null,
  certificates: [], ...over,
})

describe('buildPersonnelExportRows', () => {
  it('行数等于 flatRows 长度（不再受人员-证件 1:N 影响）', () => {
    const p = person(1, { certificates: [cert(11, 'A', '2026-12-01'), cert(12, 'B', '2025-01-01')] })
    const maps = buildPrecomputedMaps([p], new Date('2026-01-01'))
    const flat: FlatRow[] = [
      { person: p, cert: cert(11, 'A', '2026-12-01') },
      { person: p, cert: cert(12, 'B', '2025-01-01') },
    ]
    const rows = buildPersonnelExportRows(flat, maps)
    expect(rows).toHaveLength(2)
    expect(rows[0]['证件类别']).toBe('A')
    expect(rows[1]['证件类别']).toBe('B')
    expect(rows[0]['证书状态']).toBe('正常')
    expect(rows[1]['证书状态']).toBe('已过期')
  })

  it('序号从 1 开始连续递增', () => {
    const p = person(1)
    const flat: FlatRow[] = [
      { person: p, cert: null },
      { person: p, cert: null },
      { person: p, cert: null },
    ]
    const rows = buildPersonnelExportRows(flat, buildPrecomputedMaps([p]))
    expect(rows.map(r => r['序号'])).toEqual([1, 2, 3])
  })

  it('无证件占位行：证件相关列为空，状态显示「无证件」', () => {
    const p = person(1, { certificates: [] })
    const flat: FlatRow[] = [{ person: p, cert: null }]
    const rows = buildPersonnelExportRows(flat, buildPrecomputedMaps([p]))
    expect(rows[0]['证件类别']).toBe('')
    expect(rows[0]['证件编号']).toBe('')
    expect(rows[0]['有效期']).toBe('')
    expect(rows[0]['证书状态']).toBe('无证件')
  })
})
