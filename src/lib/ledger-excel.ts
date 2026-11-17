import * as XLSX from 'xlsx'
import { type BusinessKind, type BusinessRecord, yuanToWan, wanToYuan } from './business-records'

export function ledgerColumns(kind: BusinessKind): [string, string][] {
  const common: [string, string][] = [['orgName', '归属建制'], ['manager', '负责人']]
  return [...common, ...(kind === 'safety-inspections' ? [
    ['projectName', '项目名称'], ['amount', '合同金额（万元）'], ['inspectionDate', '检查时间'], ['rectification', '整改情况'],
  ] : [
    ['caseNo', '案件编号'], ['businessCategory', '业务类别'], ['caseType', '案件类型'], ['amount', '涉案金额（万元）'], ['hearingDate', '开庭时间'], ['result', '案件结果'],
  ]) as [string, string][]]
}
export function ledgerWorkbook(kind: BusinessKind, records: BusinessRecord[] = [], template = false) {
  const columns = ledgerColumns(kind)
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(c => c[1]), ...records.map(row => columns.map(([key]) => key === 'amount' ? yuanToWan(row.amount) : row[key as keyof BusinessRecord] ?? ''))])
  sheet['!cols'] = columns.map(() => ({ wch: 24 }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '台账')
  if (template) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['填写说明'], ['保留台账第一行表头，从第二行开始填写；导入只新增，不覆盖已有记录。'],
    ['项目名称或案件编号必填；日期格式 YYYY-MM-DD；金额必须为非负数。'],
    [kind === 'safety-inspections' ? '合同金额单位：万元；整改情况：未整改、整改中、已整改。' : '涉案金额单位：万元；业务类别：起诉、应诉；案件类型：合同纠纷、分包合同纠纷、工资纠纷、工伤纠纷、其他。'],
    ['Excel 不包含检查报告附件；附件请进入记录详情上传。单次最多 1000 行。'],
  ]), '填写说明')
  return book
}
export function parseLedgerSheet(kind: BusinessKind, book: XLSX.WorkBook) {
  const sheet = book.Sheets['台账'] || book.Sheets[book.SheetNames[0]]
  if (!sheet) throw new Error('未找到台账工作表')
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true })
  const columns = ledgerColumns(kind)
  const header = (grid[0] || []).map(v => String(v).trim())
  for (const [, title] of columns) if (header.filter(v => v === title).length !== 1) throw new Error(`缺少或重复表头：${title}，请使用导入模板`)
  const rows: Record<string, unknown>[] = []
  grid.slice(1).forEach((cells, index) => {
    if (cells.every(v => v === '' || v == null)) return
    const row: Record<string, unknown> = { _row: index + 2 }
    for (const [key, title] of columns) {
      const value = cells[header.indexOf(title)] ?? ''
      let text = String(value).trim()
      if (key.endsWith('Date') && typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value, { date1904: !!book.Workbook?.WBProps?.date1904 })
        if (!date) throw new Error(`第 ${index + 2} 行日期无效`)
        text = `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
      }
      try { row[key] = key === 'amount' ? wanToYuan(text) : text }
      catch (e) { throw new Error(`第 ${index + 2} 行：${(e as Error).message}`) }
    }
    rows.push(row)
  })
  if (!rows.length || rows.length > 1000) throw new Error('请选择含 1 至 1000 行数据的文件')
  return rows
}
