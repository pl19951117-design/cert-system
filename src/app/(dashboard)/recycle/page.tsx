'use client'

import { useEffect, useState } from 'react'
import { apiFetch, getJSON } from '@/lib/api'
import { toast } from '@/components/toast'

type DelPerson = { id: number; name: string; orgName: string | null; deletedAt: string }
type DelCert = { id: number; certType: string | null; certNo: string | null; expiryDate: string | null; deletedAt: string; person: { id: number; name: string } }
type Data = { persons: DelPerson[]; certs: DelCert[] }

function fmt(s: string) {
  const d = new Date(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function RecyclePage() {
  const [data, setData] = useState<Data>({ persons: [], certs: [] })
  const [loading, setLoading] = useState(true)
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setData(await getJSON<Data>('/api/recycle'))
    } catch { /* toast 已弹 */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function act(action: 'restore' | 'purge', type: 'person' | 'cert', id: number) {
    try {
      await apiFetch('/api/recycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, type, id }),
      })
      toast(action === 'restore' ? '已恢复' : '已彻底删除', 'success')
      setConfirmPurge(null)
      load()
    } catch { /* toast 已弹 */ }
  }

  const empty = data.persons.length === 0 && data.certs.length === 0

  return (
    <div>
      <div className="page-header">
        <div className="page-header-bar" />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">回收站</h1>
          <p className="text-xs text-slate-400 mt-0.5">已删除的人员与证件可在此恢复；彻底删除不可恢复</p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">加载中…</div>
      ) : empty ? (
        <div className="card-elevated p-12 text-center text-sm text-slate-400">回收站为空</div>
      ) : (
        <div className="space-y-6">
          {/* 已删除人员 */}
          <div>
            <div className="section-label"><div className="section-label-bar" /><span className="section-label-text">已删除人员 · {data.persons.length}</span></div>
            {data.persons.length === 0 ? (
              <div className="card-elevated p-6 text-center text-xs text-slate-400">无</div>
            ) : (
              <div className="card-elevated overflow-hidden">
                <table className="w-full table-premium">
                  <thead><tr>{['姓名', '归属建制', '删除时间', '操作'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.persons.map(p => {
                      const key = `person-${p.id}`
                      return (
                        <tr key={p.id}>
                          <td className="font-medium text-slate-800">{p.name}</td>
                          <td className="text-xs">{p.orgName || '—'}</td>
                          <td className="text-xs">{fmt(p.deletedAt)}</td>
                          <td>
                            <div className="flex items-center gap-3">
                              <button onClick={() => act('restore', 'person', p.id)} className="text-xs text-emerald-500 hover:text-emerald-600 font-medium">恢复</button>
                              {confirmPurge === key ? (
                                <>
                                  <button onClick={() => act('purge', 'person', p.id)} className="text-xs text-red-600 font-semibold">确认彻底删除</button>
                                  <button onClick={() => setConfirmPurge(null)} className="text-xs text-slate-400">取消</button>
                                </>
                              ) : (
                                <button onClick={() => setConfirmPurge(key)} className="text-xs text-slate-400 hover:text-red-500">彻底删除</button>
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

          {/* 已删除证件 */}
          <div>
            <div className="section-label"><div className="section-label-bar" /><span className="section-label-text">已删除证件 · {data.certs.length}</span></div>
            {data.certs.length === 0 ? (
              <div className="card-elevated p-6 text-center text-xs text-slate-400">无</div>
            ) : (
              <div className="card-elevated overflow-hidden">
                <table className="w-full table-premium">
                  <thead><tr>{['持证人', '证件类别', '证件编号', '到期日期', '删除时间', '操作'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.certs.map(c => {
                      const key = `cert-${c.id}`
                      return (
                        <tr key={c.id}>
                          <td className="font-medium text-slate-800">{c.person.name}</td>
                          <td>{c.certType || '—'}</td>
                          <td className="font-mono text-xs text-slate-500">{c.certNo || '—'}</td>
                          <td className="text-xs">{c.expiryDate || '—'}</td>
                          <td className="text-xs">{fmt(c.deletedAt)}</td>
                          <td>
                            <div className="flex items-center gap-3">
                              <button onClick={() => act('restore', 'cert', c.id)} className="text-xs text-emerald-500 hover:text-emerald-600 font-medium">恢复</button>
                              {confirmPurge === key ? (
                                <>
                                  <button onClick={() => act('purge', 'cert', c.id)} className="text-xs text-red-600 font-semibold">确认彻底删除</button>
                                  <button onClick={() => setConfirmPurge(null)} className="text-xs text-slate-400">取消</button>
                                </>
                              ) : (
                                <button onClick={() => setConfirmPurge(key)} className="text-xs text-slate-400 hover:text-red-500">彻底删除</button>
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
        </div>
      )}
    </div>
  )
}
