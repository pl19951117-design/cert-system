'use client'
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { ledgerWorkbook, parseLedgerSheet } from '@/lib/ledger-excel'
import type { BusinessKind, BusinessRecord } from '@/lib/business-records'
import { apiFetch } from '@/lib/api'
import { toast } from '@/components/toast'
export function LedgerExcel({ kind, rows, canWrite, onChanged }: { kind: BusinessKind; rows: BusinessRecord[]; canWrite: boolean; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const name = kind === 'safety-inspections' ? '安全检查' : '法务案件'
  async function upload(file: File) {
    setBusy(true)
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Excel 文件不能超过 5 MB')
      const records = parseLedgerSheet(kind, XLSX.read(await file.arrayBuffer()))
      if (!window.confirm(`将新增 ${records.length} 条${name}记录，不覆盖已有数据。确认导入？`)) return
      await apiFetch(`/api/${kind}/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: records }) })
      toast(`成功导入 ${records.length} 条记录`, 'success'); onChanged()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setBusy(false); if (input.current) input.current.value = '' }
  }
  return <>
    <button type="button" className="btn-secondary" onClick={() => XLSX.writeFile(ledgerWorkbook(kind, [], true), `${name}导入模板.xlsx`)}>导入模板</button>
    <button type="button" className="btn-secondary" onClick={() => XLSX.writeFile(ledgerWorkbook(kind, rows), `${name}台账.xlsx`)}>导出筛选结果</button>
    {canWrite && <><button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? '导入中…' : '导入 Excel'}</button><input ref={input} type="file" accept=".xlsx,.xls" className="hidden" aria-label="导入台账" onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file) }} /></>}
  </>
}
