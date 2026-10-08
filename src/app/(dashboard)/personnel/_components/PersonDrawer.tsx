'use client'

// 人员详情抽屉 —— 在列表里点姓名即可从右侧滑出查看，不离开当前页面（筛选、滚动位置都保留）。
// 完整的证件增删改仍在 /personnel/[id] 页面完成，这里只做「快速查看 + 常用入口」。

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { differenceInDays, parseISO } from 'date-fns'
import { getJSON } from '@/lib/api'
import { compareCertType, statusLabel, type CertStatusKey } from '@/lib/cert-status'
import type { Person, PrecomputedMaps } from '@/lib/personnel/types'

type HistoryItem = {
  id: number
  certId: number
  action: string
  certType: string | null
  certNo: string | null
  expiryDate: string | null
  prevExpiry: string | null
  changedBy: string | null
  changedAt: string
  note: string | null
}

const BADGE: Record<CertStatusKey, string> = {
  expired: 'badge-red', urgent: 'badge-orange', warning: 'badge-amber', ok: 'badge-green', none: 'badge-slate',
}
const ACCENT: Record<CertStatusKey, string> = {
  expired: '#ef4444', urgent: '#f97316', warning: '#f59e0b', ok: '#10b981', none: '#cbd5e1',
}
const HISTORY_BADGE: Record<string, string> = {
  创建: 'badge-green', 续期: 'badge-navy', 删除: 'badge-red',
}

function daysText(expiry: string | null): string {
  if (!expiry) return '未填写有效期'
  let d: number
  try { d = differenceInDays(parseISO(expiry), new Date()) } catch { return '' }
  if (Number.isNaN(d)) return ''
  if (d < 0) return `已超期 ${-d} 天`
  if (d === 0) return '今天到期'
  return `还剩 ${d} 天`
}

type Props = {
  person: Person
  maps: PrecomputedMaps
  onClose: () => void
  onEdit: (p: Person) => void
}

export function PersonDrawer({ person: p, maps, onClose, onEdit }: Props) {
  const [history, setHistory] = useState<HistoryItem[] | null>(null)

  useEffect(() => {
    // 切换人员时由父组件用 key 重新挂载，history 初始即为 null（加载中）
    let alive = true
    getJSON<HistoryItem[]>(`/api/personnel/${p.id}/history`)
      .then(h => { if (alive) setHistory(Array.isArray(h) ? h : []) })
      .catch(() => { if (alive) setHistory([]) })
    return () => { alive = false }
  }, [p.id])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 抽屉上方还开着弹窗（如「编辑信息」）时，Esc 只关弹窗
      if (document.querySelector('.modal-overlay')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const age = maps.ageMap.get(p.id) ?? null
  const certs = [...p.certificates].sort((a, b) => compareCertType(a.certType || '', b.certType || ''))
  const alertN = certs.filter(c => {
    const st = maps.certStatusMap.get(c.id)
    return st === 'expired' || st === 'urgent' || st === 'warning'
  }).length

  const info: [string, string][] = [
    ['身份证号', p.idCard || '—'],
    ['年龄', age !== null ? `${age} 岁` : '—'],
    ['学历', p.education || '—'],
    ['社保情况', p.socialSecurity || '—'],
  ]

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${p.name} 的详情`}
        onClick={e => e.stopPropagation()}
      >
        {/* 头部：海军蓝品牌条 */}
        <div className="relative px-6 pt-6 pb-5 text-white" style={{ background: 'linear-gradient(150deg, #1a3a63 0%, #0f2a4a 60%, #0a1d34 100%)' }}>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-gold-300 to-gold-600 ring-1 ring-white/25 flex items-center justify-center text-[22px] font-bold shadow-lg shadow-black/25">
              {p.name[0]}
            </div>
            <div className="min-w-0">
              <div className="text-[19px] font-bold tracking-tight truncate">{p.name}</div>
              <div className="text-[12.5px] text-navy-200/85 mt-1 truncate">
                {p.orgName || '未填写建制'}<span className="mx-1.5 opacity-50">·</span>负责人 {p.manager || '—'}
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2">
            <button onClick={() => onEdit(p)} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/[0.16] text-[12.5px] font-medium transition-colors">
              编辑信息
            </button>
            <Link href={`/personnel/${p.id}`} className="px-3 py-1.5 rounded-lg bg-gold-500 hover:bg-gold-400 text-navy-950 text-[12.5px] font-semibold transition-colors">
              证件管理 →
            </Link>
            <Link href={`/personnel/${p.id}/print`} className="px-3 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 text-[12.5px] font-medium transition-colors">
              打印
            </Link>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
          {/* 基本信息 */}
          <section>
            <div className="section-label !mb-3">
              <div className="section-label-bar" />
              <span className="section-label-text">基本信息</span>
            </div>
            <dl className="grid grid-cols-2 gap-px rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--line)]">
              {info.map(([k, v]) => (
                <div key={k} className="bg-white px-3.5 py-2.5">
                  <dt className="text-[11px] text-slate-400">{k}</dt>
                  <dd className={`mt-0.5 text-[13px] text-slate-800 truncate ${k === '身份证号' ? 'font-mono text-[12px]' : ''}`} title={v}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* 证件 */}
          <section>
            <div className="section-label !mb-3">
              <div className="section-label-bar" />
              <span className="section-label-text">持有证件 · {certs.length} 本</span>
              {alertN > 0 && <span className="ml-auto badge badge-amber">{alertN} 本需关注</span>}
            </div>
            {certs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">暂无证件</div>
            ) : (
              <div className="space-y-2.5">
                {certs.map(c => {
                  const st: CertStatusKey = maps.certStatusMap.get(c.id) ?? 'none'
                  return (
                    <div key={c.id} className="relative rounded-xl border border-[var(--line)] bg-white pl-4 pr-3.5 py-3 shadow-[var(--shadow-xs)] overflow-hidden">
                      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: ACCENT[st] }} aria-hidden="true" />
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13.5px] font-semibold text-slate-800">{c.certType || '未分类'}</span>
                        <span className={`badge ${BADGE[st]}`}>{statusLabel[st]}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-[12px]">
                        <span className="text-slate-500 font-mono truncate" title={c.certNo || ''}>{c.certNo || '无编号'}</span>
                        <span className="text-slate-500 tabular-nums whitespace-nowrap">
                          {c.expiryDate || '—'}
                          <span className={`ml-2 ${st === 'expired' ? 'text-red-500' : st === 'urgent' ? 'text-orange-500' : st === 'warning' ? 'text-amber-600' : 'text-slate-400'}`}>
                            {daysText(c.expiryDate)}
                          </span>
                        </span>
                      </div>
                      {c.issuer && <div className="mt-1 text-[11.5px] text-slate-400 truncate">发证机关：{c.issuer}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* 最近变更 */}
          <section>
            <div className="section-label !mb-3">
              <div className="section-label-bar" />
              <span className="section-label-text">最近变更</span>
            </div>
            {history === null ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map(i => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="text-xs text-slate-400">暂无变更记录</div>
            ) : (
              <ol className="relative ml-1.5 border-l border-slate-200 space-y-4">
                {history.slice(0, 8).map(h => (
                  <li key={h.id} className="pl-4 relative">
                    <span className="absolute -left-[4.5px] top-1.5 w-2 h-2 rounded-full bg-white border-2 border-navy-400" aria-hidden="true" />
                    <div className="flex items-center gap-2">
                      <span className={`badge ${HISTORY_BADGE[h.action] ?? 'badge-blue'}`}>{h.action}</span>
                      <span className="text-[12.5px] font-medium text-slate-700">{h.certType || '证件'}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-slate-500">
                      {h.action === '续期' && h.prevExpiry
                        ? <>有效期 {h.prevExpiry} → <span className="font-medium text-navy-700">{h.expiryDate || '—'}</span></>
                        : <>有效期 {h.expiryDate || '—'}</>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {new Date(h.changedAt).toLocaleString('zh-CN', { hour12: false })} · {h.changedBy || '系统'}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {history && history.length > 8 && (
              <Link href={`/personnel/${p.id}`} className="mt-3 inline-block text-xs text-navy-600 hover:text-navy-800 font-medium">
                查看全部 {history.length} 条 →
              </Link>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
