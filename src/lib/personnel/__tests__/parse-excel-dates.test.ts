import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcelRows } from '../exporter'

// 用内存 workbook 模拟用户上传的 Excel，证明 parseExcelRows 会把日期列
// （Excel 序列号 / 斜杠 / 点 / 中文格式）统一归一化为 YYYY-MM-DD，
// 且不影响非日期列。
function makeFile(aoa: unknown[][]): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  // parseExcelRows 只用到 file.arrayBuffer()，用最小桩对象即可（不依赖 File 全局）
  return { arrayBuffer: async () => buf } as unknown as File
}

describe('parseExcelRows 日期归一化', () => {
  it('序列号 / 斜杠 / 点 / 中文 → YYYY-MM-DD，非日期列原样', async () => {
    const file = makeFile([
      ['姓名', '到期日期', '发证日期', '证件编号'],
      ['张三', 45658, '2025/6/3', 'NO-1'],        // 45658 = 2025-01-01（Excel 1900 系）
      ['李四', '2026.7.8', '2024年2月1日', 'NO-2'],
    ])
    const rows = await parseExcelRows(file)

    expect(rows[0]['到期日期']).toBe('2025-01-01')
    expect(rows[0]['发证日期']).toBe('2025-06-03')
    expect(rows[0]['姓名']).toBe('张三')
    expect(rows[0]['证件编号']).toBe('NO-1')

    expect(rows[1]['到期日期']).toBe('2026-07-08')
    expect(rows[1]['发证日期']).toBe('2024-02-01')
  })

  it('空日期单元格 → 空串', async () => {
    const file = makeFile([
      ['姓名', '到期日期'],
      ['王五', ''],
    ])
    const rows = await parseExcelRows(file)
    expect(rows[0]['到期日期']).toBe('')
  })
})
