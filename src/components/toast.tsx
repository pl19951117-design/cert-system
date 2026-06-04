'use client'

// 可访问的全局 toast
// - 容器：role="region" + aria-live="polite" 让屏幕阅读器播报新增项
// - error 项升级为 role="alert"（assertive，立即播报）
// - 每条带"关闭"按钮，可在自动消失前手动关闭
// - pointer-events 隔离：仅 toast 卡片可点，遮罩下页面可正常操作

import { useEffect, useState } from 'react'

type ToastType = 'error' | 'success' | 'info'
type Item = { id: number; msg: string; type: ToastType }

export function toast(msg: string, type: ToastType = 'info') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg, type } }))
}

const STYLE: Record<ToastType, string> = {
  error:   'bg-red-50 border-red-200 text-red-700',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  info:    'bg-slate-800 border-slate-700 text-white',
}

const LABEL: Record<ToastType, string> = {
  error: '错误', success: '成功', info: '提示',
}

const DURATION_MS = 4000

export function Toaster() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    let n = 0
    function on(e: Event) {
      const d = (e as CustomEvent<{ msg: string; type: ToastType }>).detail
      const id = ++n
      setItems(p => [...p, { id, msg: d.msg, type: d.type }])
      setTimeout(() => setItems(p => p.filter(i => i.id !== id)), DURATION_MS)
    }
    window.addEventListener('app-toast', on)
    return () => window.removeEventListener('app-toast', on)
  }, [])

  function dismiss(id: number) {
    setItems(p => p.filter(i => i.id !== id))
  }

  return (
    <div
      role="region"
      aria-label="通知"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-2.5rem)]"
    >
      {items.map(i => (
        <div
          key={i.id}
          role={i.type === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto rounded-xl pl-4 pr-2 py-2 text-[13px] font-medium shadow-lg border max-w-sm flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in ${STYLE[i.type]}`}
        >
          <span className="sr-only">{LABEL[i.type]}：</span>
          <span className="flex-1 break-words">{i.msg}</span>
          <button
            type="button"
            aria-label="关闭通知"
            onClick={() => dismiss(i.id)}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md opacity-60 hover:opacity-100 hover:bg-black/10 transition-opacity"
          >
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" aria-hidden="true">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
