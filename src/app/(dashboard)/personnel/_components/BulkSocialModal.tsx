'use client'

import { useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { personnelApi, type SyncSocialResult, type SyncSocialChange } from '@/lib/personnel/api'
import { downloadSocialTemplate, parseExcelRows } from '@/lib/personnel/exporter'

export type BulkSocialModalProps = {
  onClose: () => void
  onSynced: () => void
}

type Filter = 'all' | 'unpaid' | 'paid'

const TAG_BASE = 'inline-block px-1.5 py-0.5 rounded-md text-[11px] font-medium tabular-nums max-w-[180px] truncate border'
const TAG_BEFORE = `${TAG_BASE} bg-slate-100 text-slate-600 border-slate-200`
const TAG_PAID   = `${TAG_BASE} bg-emerald-50 text-emerald-700 border-emerald-200`
const TAG_UNPAID = `${TAG_BASE} bg-red-50 text-red-600 border-red-200`

/** 单格「原值 → 新值」，空值用占位符 */
function BeforeAfter({ before, after, toUnpaid }: { before: string; after: string; toUnpaid: boolean }) {
  const beforeText = before || '(空)'
  const afterText  = after  || '(空)'
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={TAG_BEFORE} title={beforeText}>{beforeText}</span>
      <span className="text-slate-400">→</span>
      <span className={toUnpaid ? TAG_UNPAID : TAG_PAID} title={afterText}>{afterText}</span>
    </div>
  )
}

export function BulkSocialModal({ onClose, onSynced }: BulkSocialModalProps) {
  const [busy, setBusy]     = useState(false)
  const [err, setErr]       = useState('')
  const [result, setResult] = useState<SyncSocialResult | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setBusy(true); setErr(''); setResult(null); setFilter('all'); setSearch('')
    try {
      const rows = await parseExcelRows(file)
      const res = await personnelApi.syncSocial(rows)
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || '更新失败')
      } else {
        setResult(data as SyncSocialResult)
        onSynced()
      }
    } catch {
      setErr('解析失败，请检查文件格式')
    }
    setBusy(false)
  }

  const filteredChanges: SyncSocialChange[] = useMemo(() => {
    if (!result) return []
    const q = search.trim()
    return result.changes.filter(c => {
      if (filter === 'unpaid' && !c.setToUnpaid) return false
      if (filter === 'paid'   &&  c.setToUnpaid) return false
      if (q && !(c.name.includes(q) || (c.orgName || '').includes(q) || c.idCard.includes(q))) return false
      return true
    })
  }, [result, filter, search])

  const paidChanges = result ? result.changed - result.setUnpaid : 0

  return (
    <Modal onClose={onClose} title="社保清单同步" size={result && result.changes.length > 0 ? 'xl' : 'md'}>
      <div className="p-6">
        {!result && (
          <div className="text-xs text-slate-500 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            上传社保清单（需含 <span className="font-semibold text-slate-700">「身份证号」</span>、<span className="font-semibold text-slate-700">「社保情况」</span> 两列），系统会对<span className="font-semibold text-amber-700">当前账套所有人</span>做同步：
            <ul className="mt-1.5 ml-3.5 list-disc space-y-0.5">
              <li>在清单里 → 按清单更新社保</li>
              <li>不在清单里 → 社保设为「未参保」</li>
              <li>没填身份证 → 跳过不动</li>
            </ul>
            <div className="mt-1.5 text-amber-700 font-medium">请确认上传的是完整的当前参保名单。</div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <button onClick={downloadSocialTemplate} className="btn-secondary flex-1 !text-xs">
            下载社保模板
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-busy={busy}
            className="btn-primary flex-1 !text-xs disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Spinner size={12} label="处理中" />}
            {busy ? '处理中…' : result ? '重新选择文件' : '选择 Excel 文件'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={pick}
            className="hidden"
            aria-label="选择社保清单 Excel 文件"
          />
        </div>

        {err && (
          <div role="alert" className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
            {err}
          </div>
        )}

        {result && (
          <div role="status" className="text-xs bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5 space-y-1 mb-4">
            <div className="font-semibold text-emerald-700">同步完成</div>
            <div className="text-slate-600">
              系统共 <span className="font-semibold text-slate-700">{result.totalPeople}</span> 人
              · 匹配上 <span className="font-semibold text-emerald-600">{result.matched}</span> 人
              · 改动 <span className="font-semibold text-blue-600">{result.changed}</span> 人
              （其中设为未参保 <span className="font-semibold text-amber-600">{result.setUnpaid}</span> 人）
            </div>
            {result.skippedNoId > 0 && (
              <div className="text-slate-400">{result.skippedNoId} 人无身份证，已跳过</div>
            )}
            {result.notInSystem > 0 && (
              <div className="text-slate-400 pt-1 border-t border-emerald-100/60">
                清单里有 {result.notInSystem} 个身份证在系统中未找到（未新增）
              </div>
            )}
          </div>
        )}

        {/* 详细改动列表 */}
        {result && (
          result.changes.length === 0 ? (
            <div className="card-elevated p-6 text-center text-xs text-slate-400">
              没有人员社保情况发生变化。
            </div>
          ) : (
            <div className="card-elevated overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs font-semibold text-slate-700">
                  改动明细
                  <span className="text-slate-400 font-normal ml-1.5">显示 {filteredChanges.length} / {result.changes.length}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div role="radiogroup" aria-label="筛选方向" className="flex gap-1 bg-slate-100 p-0.5 rounded-md">
                    {([
                      { v: 'all',    label: `全部 ${result.changed}` },
                      { v: 'paid',   label: `已参保 ${paidChanges}` },
                      { v: 'unpaid', label: `设为未参保 ${result.setUnpaid}` },
                    ] as const).map(opt => (
                      <button
                        key={opt.v}
                        type="button"
                        role="radio"
                        aria-checked={filter === opt.v}
                        onClick={() => setFilter(opt.v)}
                        className={
                          'px-2.5 py-0.5 rounded text-[11px] font-semibold transition-colors ' +
                          (filter === opt.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700')
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="姓名 / 建制 / 身份证…"
                    className="input-refined !w-44 !py-1 !px-2.5 !text-[11px]"
                    aria-label="搜索改动明细"
                  />
                </div>
              </div>

              {filteredChanges.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">没有符合条件的记录</div>
              ) : (
                <div className="max-h-[360px] overflow-y-auto">
                  <table className="w-full table-premium">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr>
                        <th>姓名</th>
                        <th>归属建制</th>
                        <th>负责人</th>
                        <th>身份证</th>
                        <th>社保情况</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChanges.map(c => (
                        <tr key={c.id} className={c.setToUnpaid ? 'bg-red-50/30' : ''}>
                          <td className="font-medium text-slate-800">{c.name}</td>
                          <td>{c.orgName || '—'}</td>
                          <td>{c.manager || '—'}</td>
                          <td className="font-mono text-[11px] text-slate-500">
                            {c.idCard.length >= 4 ? `***${c.idCard.slice(-4)}` : c.idCard}
                          </td>
                          <td>
                            <BeforeAfter before={c.before} after={c.after} toUnpaid={c.setToUnpaid} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        )}

        <div className="mt-5">
          <button onClick={onClose} className="btn-secondary w-full">关闭</button>
        </div>
      </div>
    </Modal>
  )
}
