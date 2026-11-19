'use client'
import { ActionMenu } from '@/components/action-menu'
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { ledgerWorkbook, parseLedgerSheet } from '@/lib/ledger-excel'
import type { ExcelKind } from '@/lib/ledger-excel'
import { downloadLedgerTemplate } from '@/lib/ledger-template'
import { apiFetch } from '@/lib/api'
import { toast } from '@/components/toast'
export function LedgerExcel({ kind, rows, canWrite, onChanged, year, exportData }: { year?: number; exportData?: () => void; kind: ExcelKind; rows: Record<string, unknown>[]; canWrite: boolean; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const name = { 'safety-inspections':'安全检查', 'legal-cases':'法务案件', exams:'考试报名', education:'继续教育' }[kind]
  async function upload(file: File) {
    setBusy(true)
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Excel 文件不能超过 5 MB')
      const records = parseLedgerSheet(kind, XLSX.read(await file.arrayBuffer()))
      if (!window.confirm(`将${kind === 'education' ? '更新' : '新增'} ${records.length} 条${name}记录。确认导入？`)) return
      await apiFetch(`/api/${kind}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: records, year }) })
      toast(`成功导入 ${records.length} 条记录`, 'success'); onChanged()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  return <>
    <ActionMenu label="数据工具">
    <button type="button" className="btn-secondary" onClick={() => void downloadLedgerTemplate(kind, name).catch(() => toast('生成模板失败，请重试','error'))}>下载模板</button>
    <button type="button" className="btn-secondary" onClick={exportData ?? (() => XLSX.writeFile(ledgerWorkbook(kind, rows), `${name}台账.xlsx`))}>导出数据</button>
    {canWrite && <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? '导入中…' : '导入数据'}</button>}
    </ActionMenu>
    {canWrite && <input ref={input} type="file" accept=".xlsx,.xls" className="hidden" aria-label="导入台账" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file) }} />}
  </>
}
