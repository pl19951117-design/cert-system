'use client'

import { useEffect, useState } from 'react'
import { apiFetch, getJSON } from '@/lib/api'
import { toast } from '@/components/toast'

type Backup = { fileName: string; size: number; time: number }
type Info = { backups: Backup[]; dbSize: number; backupsDir: string; isDesktop: boolean }

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
function fmtTime(ms: number) {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Window.desktop 的类型集中声明在 src/types/desktop.d.ts

export default function BackupPage() {
  const [info, setInfo] = useState<Info | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [staged, setStaged] = useState(false)
  const desktop = typeof window !== 'undefined' && !!window.desktop?.isDesktop

  async function load() {
    setLoading(true)
    try {
      const data = await getJSON<Info>('/api/backup')
      setInfo(data)
    } catch (e) {
      if (String(e).includes('403') || String(e).includes('超级管理员')) setDenied(true)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function backupNow() {
    setBusy(true)
    try {
      await apiFetch('/api/backup', { method: 'POST' })
      toast('备份完成', 'success')
      await load()
    } catch { /* toast 已弹 */ }
    setBusy(false)
  }

  async function doRestore(fileName: string) {
    setBusy(true)
    try {
      await apiFetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName }),
      })
      setConfirmRestore(null)
      setStaged(true)
    } catch { /* toast 已弹 */ }
    setBusy(false)
  }

  async function restoreFromFile() {
    if (!window.desktop) return
    const r = await window.desktop.pickRestoreFile()
    if (r.canceled) return
    if (!r.ok || !r.path) { toast(r.error || '选择文件失败', 'error'); return }
    setBusy(true)
    try {
      await apiFetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: r.path }),
      })
      setStaged(true)
    } catch { /* toast 已弹 */ }
    setBusy(false)
  }

  if (denied) {
    return <div className="card-elevated p-12 text-center text-sm font-semibold text-slate-600">仅超级管理员可访问数据备份</div>
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">数据备份与恢复</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            当前数据库 {info ? fmtSize(info.dbSize) : '—'} · 自动备份（仅数据库）每日 1 次、启动时 1 次，滚动保留最近 14 份
          </p>
        </div>
        <div className="self-center flex items-center gap-2">
          {desktop && (
            <button onClick={() => window.desktop!.openBackupsFolder()} className="btn-secondary !py-2 !px-3 !text-xs">
              打开备份文件夹
            </button>
          )}
          <a href="/api/backup/download" className="btn-secondary !py-2 !px-3 !text-xs">仅数据库</a>
          <a href="/api/backup/export-full" className="btn-secondary !py-2 !px-3 !text-xs">导出完整备份（含附件）</a>
          <button onClick={backupNow} disabled={busy} className="btn-primary !py-2 !px-4 !text-sm disabled:opacity-50">
            {busy ? '处理中…' : '立即备份'}
          </button>
        </div>
      </div>

      {staged && (
        <div className="card-elevated p-4 mb-5 border-l-[3px] border-l-amber-500 flex items-center justify-between gap-4">
          <div className="text-sm text-slate-700">
            <span className="font-semibold text-amber-600">恢复已就绪</span>，需要<span className="font-semibold">重启应用</span>后生效（重启时会先自动备份当前数据，可回退）。
          </div>
          {desktop ? (
            <button onClick={() => window.desktop!.relaunch()} className="btn-primary !py-2 !px-4 !text-sm whitespace-nowrap">立即重启</button>
          ) : (
            <span className="text-xs text-slate-400 whitespace-nowrap">请手动关闭并重新打开应用</span>
          )}
        </div>
      )}

      <div className="filter-bar !p-4 mb-5 text-xs text-slate-500 leading-relaxed">
        附件已改为存放在磁盘（不再占用数据库）。下方<span className="font-semibold text-slate-600">自动备份只含数据库</span>，可防误改/误删；
        要完整保全（含证件附件），请点<span className="font-semibold text-navy-700">「导出完整备份（含附件）」</span>，把生成的 zip 另存到 U 盘或其他电脑，以防本机损坏。
        {desktop && '恢复：下表可恢复数据库；「从文件恢复」可选择 .db 或完整 zip（zip 会一并还原附件）。'}
        {info && <div className="mt-1 text-slate-400 break-all">备份目录：{info.backupsDir}</div>}
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="section-label !mb-0">
          <div className="section-label-bar" />
          <span className="section-label-text">备份列表 · 共 {info?.backups.length ?? 0} 份</span>
        </div>
        {desktop && (
          <button onClick={restoreFromFile} className="text-xs text-navy-600 hover:text-navy-800 font-medium">
            从文件恢复…
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
      ) : !info || info.backups.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-slate-400">暂无备份，点击右上角「立即备份」</div>
      ) : (
        <div className="card-elevated overflow-hidden">
          <table className="w-full table-premium">
            <thead>
              <tr>{['备份文件', '时间', '大小', '操作'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {info.backups.map(b => {
                const isPre = b.fileName.startsWith('pre-restore-')
                return (
                  <tr key={b.fileName}>
                    <td className="font-mono text-xs text-slate-600">
                      {b.fileName}
                      {isPre && <span className="badge badge-slate ml-2">恢复前自动备份</span>}
                    </td>
                    <td className="text-xs">{fmtTime(b.time)}</td>
                    <td className="text-xs tabular-nums">{fmtSize(b.size)}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <a href={`/api/backup/download?file=${encodeURIComponent(b.fileName)}`}
                          className="text-xs text-slate-400 hover:text-navy-700 font-medium">下载</a>
                        {confirmRestore === b.fileName ? (
                          <>
                            <button onClick={() => doRestore(b.fileName)} disabled={busy}
                              className="text-xs text-red-600 font-semibold">确认恢复</button>
                            <button onClick={() => setConfirmRestore(null)} className="text-xs text-slate-400">取消</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmRestore(b.fileName)}
                            className="text-xs text-blue-500 hover:text-blue-600 font-medium">恢复</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
