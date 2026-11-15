// Monetary values are stored as decimal text, preserving cents without floating point rounding.
export function normalizeMoney(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim().replace(/,/g, '')
  if (!text) return null
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text)) throw new Error('金额须为非负数，最多 12 位整数和 2 位小数')
  const [whole, cents = ''] = text.split('.')
  return `${Number(whole)}.${cents.padEnd(2, '0')}`
}

export function formatMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  return Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export type BusinessKind = 'safety-inspections' | 'legal-cases'
export type ReportSummary = { id: number; fileName: string; fileSize: number }
export type BusinessRecord = {
  id: number; orgName: string | null; manager: string | null; amount: string | null
  projectName?: string; inspectionDate?: string | null; rectification?: string | null
  caseNo?: string; caseType?: string | null; hearingDate?: string | null; result?: string | null
  reports?: ReportSummary[]
}
