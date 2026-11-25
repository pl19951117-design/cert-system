import * as XLSX from 'xlsx'
import { type BusinessKind, REPORT_GROUPS, type ReportSummary, yuanToWan, wanToYuan } from './business-records'

export type ExcelKind = BusinessKind | 'exams' | 'education'
export const examStatuses = ['待考', '已通过', '未通过', '已取证'] as const
export function ledgerColumns(kind: ExcelKind): [string, string][] {
  const common: [string, string][] = [['orgName', '归属建制'], ['manager', '负责人']]
  if (kind === 'exams') return [...common, ['name','姓名'],['idCard','身份证号'],['certType','证件类别'],['regDate','报名日期'],['isPassed','考试状态'],['certNo','证件编号'],['issueDate','发证日期'],['expiryDate','到期日期'],['issuer','发证机构']]
  if (kind === 'education') return [['name','姓名'],['certNo','证件编号'],['attended','继续教育'],['attendedDate','参加日期'],['note','备注']]
  return [...common, ...(kind === 'safety-inspections' ? [
    ['projectName', '项目名称'], ['amount', '合同金额（万元）'], ['inspectionDate', '检查时间'], ...REPORT_GROUPS.map(group => [group.category, group.label + '（附件名称）']),
  ] : [
    ['party', '当事人'], ['caseNo', '案件编号'], ['businessCategory', '业务类别'], ['caseType', '案件类型'], ['amount', '涉案金额（万元）'], ['hearingDate', '开庭时间'], ['result', '案件结果'],
  ]) as [string, string][]]
}
export function ledgerWorkbook(kind: ExcelKind, records: Record<string, unknown>[] = [], template = false) {
  const columns = ledgerColumns(kind)
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(c => c[1]), ...records.map(row => columns.map(([key]) => {
    if (kind === 'safety-inspections' && REPORT_GROUPS.some(group => group.category === key)) {
      return (row.reports as ReportSummary[] | undefined)?.filter(report => report.category === key).map(report => report.fileName).join('\n') || ''
    }
    return key === 'amount' ? yuanToWan(String(row.amount ?? '')) : row[key] ?? ''
  }))])
  sheet['!cols'] = columns.map(() => ({ wch: 24 }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '台账')
  if (template && (kind === 'exams' || kind === 'education')) {
    const note = kind === 'exams' ? '姓名必填。每行新增一条独立报名，证件和身份证号按文本填写，导入后可在详情中关联人员。' : '按当前年度、姓名和证件编号匹配已有证件，填写已参加或未参加。'
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['填写说明'],[note],['日期填写 YYYY-MM-DD，每批最多 1000 行。']]), '填写说明')
  } else if (template) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['填写说明'], ['保留台账第一行表头，从第二行开始填写；导入只新增，不覆盖已有记录。'],
    ['项目名称或案件编号必填；日期格式 YYYY-MM-DD；金额必须为非负数。'],
    [kind === 'safety-inspections' ? '合同金额单位：万元。附件名称列供导出核对，填表时留空。' : '涉案金额单位：万元；业务类别：起诉、应诉；案件结果：已结案、未结案；案件类型：合同纠纷、分包合同纠纷、工资纠纷、工伤纠纷、其他。'],
    [kind === 'safety-inspections' ? '附件请在记录详情中按类别上传。Excel 仅导出附件名称。单次最多 1000 行。' : '单次最多 1000 行。'],
  ]), '填写说明')
  return book
}
export function parseLedgerSheet(kind: ExcelKind, book: XLSX.WorkBook) {
  const sheet = book.Sheets['台账'] || book.Sheets[book.SheetNames[0]]
  if (!sheet) throw new Error('未找到台账工作表')
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true })
  const columns = ledgerColumns(kind)
  const header = (grid[0] || []).map(v => String(v).trim())
  const inputColumns = columns.filter(([key]) => kind !== 'safety-inspections' || !REPORT_GROUPS.some(group => group.category === key))
  for (const [key, title] of inputColumns) {
    if (key === 'party' && !header.includes(title)) continue // v0.7.8 legal template
    if (header.filter(v => v === title).length !== 1) throw new Error(`缺少或重复表头：${title}，请使用导入模板`)
  }
  const rows: Record<string, unknown>[] = []
  grid.slice(1).forEach((cells, index) => {
    if (cells.every(v => v === '' || v == null)) return
    const row: Record<string, unknown> = { _row: index + 2 }
    for (const [key, title] of inputColumns) {
      const value = cells[header.indexOf(title)] ?? ''
      if (typeof value === 'number' && ['idCard','certNo','caseNo'].includes(key)) throw new Error(`第 ${index + 2} 行：${title} 请使用文本格式，避免丢失前导零或精度`)
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
