import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { BUSINESS_CATEGORIES, CASE_TYPES, CASE_RESULTS } from './business-records'
import { examStatuses, ledgerColumns, ledgerWorkbook, type ExcelKind } from './ledger-excel'

// SheetJS Community Edition does not serialize list validation. Add the standard
// worksheet element to the generated blank sheet before returning its XLSX bytes.
export async function templateBytes(kind: ExcelKind) {
  const choices: Record<string, readonly string[]> = { result: CASE_RESULTS, businessCategory: BUSINESS_CATEGORIES, caseType: CASE_TYPES, isPassed: examStatuses, attended: ['已参加','未参加'] }
  const book = ledgerWorkbook(kind, [], true)
  const cols = ledgerColumns(kind)
  const zip = await JSZip.loadAsync(XLSX.write(book, { type:'array', bookType:'xlsx' }))
  const part = 'xl/worksheets/sheet1.xml'
  let xml = await zip.file(part)!.async('string')
  const rules = cols.flatMap(([key], i) => {
    if (!choices[key]) return []
    const col = XLSX.utils.encode_col(i)
    return [`<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="stop" error="请从列表选择" sqref="${col}2:${col}1001"><formula1>"${choices[key].join(',')}"</formula1></dataValidation>`]
  })
  if (rules.length) xml = xml.replace('</sheetData>', `</sheetData><dataValidations count="${rules.length}">${rules.join('')}</dataValidations>`)
  zip.file(part,xml)
  return zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'})
}
export async function downloadLedgerTemplate(kind: ExcelKind, name: string) {
  const data = await templateBytes(kind)
  const url = URL.createObjectURL(new Blob([data], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
  const link = document.createElement('a')
  link.href = url
  link.download = name + '导入模板.xlsx'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
