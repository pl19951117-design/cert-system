'use client'

import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/toast'
import { personnelApi, type ImportMode, type ImportRow } from '@/lib/personnel/api'

export type ImportPreviewData = {
  rows: ImportRow[]
  total: number
  newCount: number
  existCount: number
  invalidId: number
  noName: number
  sample: { row: number; name: string; idCard: string; status: string; issue: string }[]
}

export type ImportPreviewModalProps = {
  preview: ImportPreviewData
  onClose: () => void
  onComplete: (msg: string) => void
}

const MODE_OPTIONS: ReadonlyArray<readonly [ImportMode, string]> = [
  ['append', '追加证件'],
  ['update', '更新信息+追加'],
  ['skip',   '跳过'],
]

export function ImportPreviewModal({ preview, onClose, onComplete }: ImportPreviewModalProps) {
  const [mode, setMode] = useState<ImportMode>('append')
  const [importing, setImporting] = useState(false)

  async function run() {
    setImporting(true)
    try {
      const d = await personnelApi.importBatch(preview.rows, mode)
      const msg = `新增 ${d.created} · 更新 ${d.updated} · 追加 ${d.appended} · 跳过 ${d.skipped}`
        + (d.invalidId ? ` · 身份证异常 ${d.invalidId}` : '')
      toast('导入完成', 'success')
      onComplete(msg)
      onClose()
    } catch { /* toast 已弹 */ }
    setImporting(false)
  }

  return (
    <Modal
      onClose={onClose}
      title={`导入预览 · 共 ${preview.total} 行`}
      size="lg"
      cardClassName="flex flex-col"
      cardStyle={{ maxHeight: '85vh' }}
    >
      <div className="p-6 overflow-y-auto">
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="badge badge-green">新增 {preview.newCount}</span>
          <span className="badge badge-blue">已存在 {preview.existCount}</span>
          {preview.noName > 0    && <span className="badge badge-slate">缺姓名 {preview.noName}</span>}
          {preview.invalidId > 0 && <span className="badge badge-orange">身份证异常 {preview.invalidId}</span>}
        </div>

        <fieldset className="mb-4">
          <legend className="text-xs font-semibold text-slate-600 mb-1.5">
            已存在人员（按身份证匹配）如何处理？
          </legend>
          <div role="radiogroup" aria-label="导入模式" className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
            {MODE_OPTIONS.map(([m, label]) => {
              const checked = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${checked ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {preview.invalidId > 0 && (
            <p className="text-[11px] text-orange-500 mt-2">
              提示：{preview.invalidId} 行身份证校验未通过，仍会按原值导入，请核对。
            </p>
          )}
        </fieldset>

        <div className="border border-slate-100 rounded-xl overflow-x-auto">
          <table className="w-full table-premium">
            <caption className="sr-only">导入数据预览前 {preview.sample.length} 行</caption>
            <thead>
              <tr>{['行', '姓名', '身份证', '状态', '问题'].map(h => (
                <th key={h} scope="col">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {preview.sample.map(s => (
                <tr key={s.row}>
                  <td className="text-xs text-slate-400 tabular-nums">{s.row}</td>
                  <td className="text-xs font-medium text-slate-700">{s.name}</td>
                  <td className="font-mono text-[11px] text-slate-500">{s.idCard || '—'}</td>
                  <td>
                    <span className={`badge ${s.status === '新增' ? 'badge-green' : s.status === '已存在' ? 'badge-blue' : 'badge-slate'}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="text-[11px] text-orange-500">{s.issue || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.total > preview.sample.length && (
          <p className="text-[11px] text-slate-400 mt-2">
            仅预览前 {preview.sample.length} 行，确认后将处理全部 {preview.total} 行。
          </p>
        )}
      </div>
      <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
        <button onClick={onClose} className="btn-secondary flex-1">取消</button>
        <button
          onClick={run}
          disabled={importing}
          aria-busy={importing}
          className="btn-primary flex-1 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {importing && <Spinner size={14} label="导入中" />}
          {importing ? '导入中…' : `确认导入 ${preview.total} 行`}
        </button>
      </div>
    </Modal>
  )
}
