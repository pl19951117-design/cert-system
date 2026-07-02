'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { differenceInDays, parseISO } from 'date-fns'

type Cert = { id: number; expiryDate: string | null }
type Counts = { expired: number; urgent: number; warning: number }
type PlanLite = { status: string; plannedDate: string | null }

function notify(c: Counts) {
  try {
    if (typeof Notification === 'undefined') return
    const body = `已过期 ${c.expired} 张 · 30天内到期 ${c.urgent} 张 · 90天内 ${c.warning} 张`
    const fire = () => new Notification('证件到期提醒', { body })
    if (Notification.permission === 'granted') fire()
    else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { if (p === 'granted') fire() })
    }
  } catch {
    /* 通知不可用时静默 */
  }
}

function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function StartupReminder() {
  const router = useRouter()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [overdueTransfers, setOverdueTransfers] = useState(0)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('cert-reminder-shown')) return
    sessionStorage.setItem('cert-reminder-shown', '1')
    ;(async () => {
      try {
        const [certs, plans] = await Promise.all([
          fetch('/api/alerts').then(r => r.json()).catch(() => []) as Promise<Cert[]>,
          fetch('/api/transfer-plans').then(r => r.json()).catch(() => []) as Promise<PlanLite[]>,
        ])

        let expired = 0, urgent = 0, warning = 0
        if (Array.isArray(certs)) {
          for (const c of certs) {
            if (!c.expiryDate) continue
            const days = differenceInDays(parseISO(c.expiryDate), new Date())
            if (days < 0) expired++
            else if (days <= 30) urgent++
            else if (days <= 90) warning++
          }
        }

        // 转入转出登记：超过计划日期还未办的待办
        const today = todayYMD()
        const overdue = Array.isArray(plans)
          ? plans.filter(p => p.status === 'pending' && p.plannedDate && p.plannedDate < today).length
          : 0

        const hasCertAlerts = expired + urgent + warning > 0
        if (!hasCertAlerts && overdue === 0) return

        const c = { expired, urgent, warning }
        if (hasCertAlerts) setCounts(c)
        setOverdueTransfers(overdue)
        setShow(true)
        if (expired + urgent > 0) notify(c)
      } catch {
        /* 静默 */
      }
    })()
  }, [])

  if (!show) return null

  const total = counts ? counts.expired + counts.urgent + counts.warning : 0
  const close = () => setShow(false)

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-card max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-2 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">启动提醒</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {total > 0 && `有 ${total} 张证件需要关注`}
              {total > 0 && overdueTransfers > 0 && ' · '}
              {overdueTransfers > 0 && `${overdueTransfers} 条转入转出登记已超期`}
            </p>
          </div>
        </div>

        {counts && (
          <div className="px-6 py-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3 text-center">
              <div className="text-2xl font-bold text-red-600 tabular-nums">{counts.expired}</div>
              <div className="text-[11px] text-red-500 mt-0.5">已过期</div>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-center">
              <div className="text-2xl font-bold text-orange-600 tabular-nums">{counts.urgent}</div>
              <div className="text-[11px] text-orange-500 mt-0.5">30天内</div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-center">
              <div className="text-2xl font-bold text-amber-600 tabular-nums">{counts.warning}</div>
              <div className="text-[11px] text-amber-500 mt-0.5">90天内</div>
            </div>
          </div>
        )}

        {overdueTransfers > 0 && (
          <div className="px-6 pb-2">
            <button
              onClick={() => { close(); router.push('/transfers') }}
              className="w-full flex items-center justify-between rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 hover:bg-red-50 transition-colors"
            >
              <span className="text-xs font-semibold text-red-600">
                {overdueTransfers} 条转入/转出登记已超过计划日期
              </span>
              <span className="text-xs text-red-400">去处理 →</span>
            </button>
          </div>
        )}

        <div className="px-6 pb-6 pt-2 flex gap-3">
          <button onClick={close} className="btn-secondary flex-1">知道了</button>
          {total > 0 && (
            <button onClick={() => { close(); router.push('/alerts') }} className="btn-primary flex-1">查看预警清单</button>
          )}
        </div>
      </div>
    </div>
  )
}
