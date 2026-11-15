'use client'

// 可访问的全局 toast
// - 容器：role="region" + aria-live="polite" 让屏幕阅读器播报新增项
// - error 项升级为 role="alert"（assertive，立即播报）
// - 每条带"关闭"按钮，可在自动消失前手动关闭
// - pointer-events 隔离：仅 toast 卡片可点，遮罩下页面可正常操作

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'

type ToastType = 'error' | 'success' | 'info'
type Item = { id: number; msg: string; type: ToastType }
type Timer = {
  timeout: ReturnType<typeof setTimeout> | null
  remaining: number
  startedAt: number
  pausedBy: Set<'pointer' | 'focus'>
}

export function toast(msg: string, type: ToastType = 'info') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg, type } }))
}

const ICON: Record<ToastType, typeof Info> = {
  error: CircleAlert, success: CircleCheck, info: Info,
}

const ICON_STYLE: Record<ToastType, string> = {
  error: 'text-red-600', success: 'text-emerald-700', info: 'text-navy-700',
}

const LABEL: Record<ToastType, string> = {
  error: '错误', success: '成功', info: '提示',
}

const DURATION_MS: Record<ToastType, number> = { error: 8000, success: 4500, info: 5000 }

export function Toaster() {
  const [items, setItems] = useState<Item[]>([])
  const timers = useRef(new Map<number, Timer>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer?.timeout) clearTimeout(timer.timeout)
    timers.current.delete(id)
    setItems(p => p.filter(i => i.id !== id))
  }, [])

  const startTimer = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (!timer || timer.pausedBy.size > 0) return
    timer.startedAt = Date.now()
    timer.timeout = setTimeout(() => dismiss(id), timer.remaining)
  }, [dismiss])

  const pauseTimer = useCallback((id: number, reason: 'pointer' | 'focus') => {
    const timer = timers.current.get(id)
    if (!timer) return
    if (timer.timeout) {
      clearTimeout(timer.timeout)
      timer.timeout = null
      timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt))
    }
    timer.pausedBy.add(reason)
  }, [])

  function resumeTimer(id: number, reason: 'pointer' | 'focus') {
    const timer = timers.current.get(id)
    if (!timer) return
    timer.pausedBy.delete(reason)
    if (!timer.timeout) startTimer(id)
  }

  useEffect(() => {
    let n = 0
    const activeTimers = timers.current
    function on(e: Event) {
      const d = (e as CustomEvent<{ msg: string; type: ToastType }>).detail
      const id = ++n
      setItems(p => [...p, { id, msg: d.msg, type: d.type }])
      activeTimers.set(id, { timeout: null, remaining: DURATION_MS[d.type], startedAt: 0, pausedBy: new Set() })
      startTimer(id)
    }
    window.addEventListener('app-toast', on)
    return () => {
      window.removeEventListener('app-toast', on)
      activeTimers.forEach(timer => { if (timer.timeout) clearTimeout(timer.timeout) })
      activeTimers.clear()
    }
  }, [startTimer])

  return (
    <div
      role="region"
      aria-label="通知"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2.5rem)]"
    >
      {items.map(i => {
        const Icon = ICON[i.type]
        return (
        <div
          key={i.id}
          role={i.type === 'error' ? 'alert' : 'status'}
          aria-atomic="true"
          onMouseEnter={() => pauseTimer(i.id, 'pointer')}
          onMouseLeave={() => resumeTimer(i.id, 'pointer')}
          onFocusCapture={() => pauseTimer(i.id, 'focus')}
          onBlurCapture={e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resumeTimer(i.id, 'focus')
          }}
          className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-2 text-[13px] leading-6 text-slate-700 shadow-[0_4px_16px_rgba(15,23,42,0.08)] motion-safe:animate-in motion-safe:slide-in-from-bottom-1 motion-safe:fade-in motion-reduce:animate-none"
        >
          <Icon size={18} strokeWidth={1.7} aria-hidden="true" className={`shrink-0 ${ICON_STYLE[i.type]}`} />
          <span className="sr-only">{LABEL[i.type]}：</span>
          <span className="flex-1 break-words">{i.msg}</span>
          <button
            type="button"
            aria-label="关闭通知"
            onClick={() => dismiss(i.id)}
            title="关闭通知"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
          >
            <X size={16} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
        )
      })}
    </div>
  )
}
