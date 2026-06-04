// Excel 输入/输出：行构建是纯函数（可测），writeFile 是副作用层薄包装

import * as XLSX from 'xlsx'
import { statusLabel } from '@/lib/cert-status'
import { normalizeDate } from '@/lib/normalize-date'
import type { FlatRow, PrecomputedMaps } from './types'

// 导入时按表头识别的「日期列」——这些列的值统一归一化为 YYYY-MM-DD
const DATE_HEADERS = new Set([
  '发证日期', '颁发日期', '到期日期', '有效期至', '有效期', '过期日期',
])

export type ExportRow = Record<string, string | number>

/** 纯函数：把 flatRows + 预算 maps 翻译成 Excel 行对象 */
export function buildPersonnelExportRows(
  flatRows: FlatRow[],
  maps: PrecomputedMaps,
): ExportRow[] {
  const rows: ExportRow[] = []
  let seq = 0
  for (const { person: p, cert: c } of flatRows) {
    const age = maps.ageMap.get(p.id) ?? null
    rows.push({
      '序号': ++seq,
      '归属建制': p.orgName || '',
      '负责人':   p.manager || '',
      '姓名':     p.name,
      '身份证号': p.idCard || '',
      '年龄':     age ?? '',
      '学历':     p.education || '',
      '社保情况': p.socialSecurity || '',
      '证件类别': c?.certType || '',
      '证件编号': c?.certNo || '',
      '有效期':   c?.expiryDate || '',
      '证书状态': c ? statusLabel[maps.certStatusMap.get(c.id) ?? 'none'] : statusLabel.none,
    })
  }
  return rows
}

export function exportPersonnelExcel(flatRows: FlatRow[], maps: PrecomputedMaps): void {
  const ws = XLSX.utils.json_to_sheet(buildPersonnelExportRows(flatRows, maps))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '人员证件')
  XLSX.writeFile(wb, `人员证件_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export const IMPORT_TEMPLATE_HEADERS = [
  '归属建制', '负责人', '姓名', '身份证号', '出生年份', '学历', '社保情况', '排序',
  '证件类别', '证件编号', '发证日期', '到期日期', '发证机构',
]

export function downloadImportTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    IMPORT_TEMPLATE_HEADERS,
    ['一连', '张队长', '王小明', '110101199001011234', '1990', '大专', '已参保', '1',
     '安全员证', 'AQ20240001', '2022-01-01', '2025-01-01', '省建设厅'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '导入模板')
  XLSX.writeFile(wb, '人员导入模板.xlsx')
}

export function downloadSocialTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    ['身份证号', '社保情况'],
    ['110101199001011234', '已参保'],
    ['110101199203054321', '未参保'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '社保更新模板')
  XLSX.writeFile(wb, '社保批量更新模板.xlsx')
}

/**
 * 解析 Excel 文件第一张表为对象数组。
 * - `cellDates: true` 让日期型单元格解析为 Date，而非序列号
 * - 日期列（含被识别为 Date 的任意单元格）统一归一化为 YYYY-MM-DD，
 *   无法识别的日期落为空串（避免把脏值塞进库里破坏状态计算）
 * - 其余单元格转字符串并去除首尾空白
 */
export async function parseExcelRows(file: File): Promise<Record<string, string>[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }) as Record<string, unknown>[]
  return raw.map(row => {
    const out: Record<string, string> = {}
    for (const key of Object.keys(row)) {
      const v = row[key]
      if (DATE_HEADERS.has(key.trim()) || v instanceof Date) {
        out[key] = normalizeDate(v) ?? ''
      } else {
        out[key] = String(v ?? '').trim()
      }
    }
    return out
  })
}
