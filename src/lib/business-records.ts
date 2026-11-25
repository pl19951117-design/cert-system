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
export const CASE_RESULTS = ['已结案', '未结案'] as const
export const REPORT_GROUPS = [
  { category: 'report', label: '检查报告' },
  { category: 'notice', label: '整改通知单' },
  { category: 'reply', label: '整改回复单' },
] as const
export type ReportCategory = typeof REPORT_GROUPS[number]['category']
export const BUSINESS_CATEGORIES = ['起诉', '应诉'] as const
export const CASE_TYPES = ['合同纠纷', '分包合同纠纷', '工资纠纷', '工伤纠纷', '其他'] as const

// Storage remains yuan. Six decimal places in 万元 preserve every existing cent.
export function yuanToWan(value: string | null | undefined): string {
  if (!value) return ''
  const [whole, cents = ''] = value.split('.')
  const digits = (BigInt(whole) * BigInt(100) + BigInt(cents.padEnd(2, '0'))).toString().padStart(7, '0')
  return `${digits.slice(0, -6)}.${digits.slice(-6)}`.replace(/\.?0+$/, '')
}
export function wanToYuan(value: string): string | null {
  const text = value.trim().replace(/,/g, '')
  if (!text) return null
  if (!/^\d{1,8}(\.\d{1,6})?$/.test(text)) throw new Error('万元金额最多 8 位整数和 6 位小数')
  const [whole, decimals = ''] = text.split('.')
  const cents = (BigInt(whole) * BigInt(1000000) + BigInt(decimals.padEnd(6, '0'))).toString().padStart(3, '0')
  return normalizeMoney(`${cents.slice(0, -2)}.${cents.slice(-2)}`)
}
export type ReportSummary = { id: number; fileName: string; fileSize: number; category: ReportCategory }
export type BusinessRecord = {
  id: number; orgName: string | null; manager: string | null; amount: string | null
  projectName?: string; inspectionDate?: string | null; party?: string | null
  caseNo?: string; businessCategory?: string | null; caseType?: string | null; hearingDate?: string | null; result?: string | null
  reports?: ReportSummary[]
}
