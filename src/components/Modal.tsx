'use client'

// 生产级模态框原件
// 覆盖维度：
//   a11y      — role="dialog" / aria-modal / aria-labelledby / aria-label 关闭按钮
//   键盘      — Esc 关闭 / Tab 在内部循环 / 自动聚焦首个可聚焦元素 / 关闭后焦点归还触发器
//   行为      — body 滚动锁定（多 modal 堆叠安全的引用计数）
//   渲染      — createPortal 到 body，规避祖先 transform/overflow 造成的样式 bug
//   响应式    — 沿用既有 .modal-card 的 max-height/overflow-y；卡片宽度通过 size 控制
// 视觉零变更：复用 globals.css 的 .modal-overlay / .modal-card

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// 模块级计数：多 modal 堆叠时，只有最后一个关闭时才解锁 body 滚动
let openModalCount = 0
// 模块级栈：Esc 和 Tab 陷阱只让"最顶 modal"响应，避免多 modal 同时关闭
const modalStack: Array<{ id: number }> = []
let nextModalId = 0

const SIZE_CLASS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const

export type ModalProps = {
  onClose: () => void
  /** 标题文本 — 同时用于 aria-labelledby */
  title: string
  /** 关闭按钮的可读名，默认"关闭" */
  closeLabel?: string
  /** 卡片宽度，默认 lg(2xl) */
  size?: keyof typeof SIZE_CLASS
  /** 卡片额外 class（如 ImportPreview 用 'flex flex-col' 配合内部分区滚动） */
  cardClassName?: string
  cardStyle?: React.CSSProperties
  /** 点击遮罩关闭，默认 false（避免误关填到一半的表单） */
  closeOnBackdrop?: boolean
  children: React.ReactNode
}

// 设计：不使用 open prop。caller 通过条件渲染控制 mount，从而每次"打开"自动得到全新内部 state。
// 模拟"关闭动画"等高级行为请用 Radix/shadcn Dialog。
export function Modal({
  onClose, title, closeLabel = '关闭',
  size = 'lg', cardClassName = '', cardStyle,
  closeOnBackdrop = false, children,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  // SSR 守卫：document.body 仅在 client 可用
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // mount: 锁定滚动 + 捕获焦点 + 聚焦首元素； unmount: 全部还原
  useEffect(() => {
    previousFocusRef.current = (document.activeElement as HTMLElement | null) ?? null

    if (openModalCount === 0) document.body.style.overflow = 'hidden'
    openModalCount++

    const raf = requestAnimationFrame(() => {
      if (!cardRef.current) return
      const first = cardRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(first ?? cardRef.current).focus()
    })

    return () => {
      cancelAnimationFrame(raf)
      openModalCount = Math.max(0, openModalCount - 1)
      if (openModalCount === 0) document.body.style.overflow = ''
      const prev = previousFocusRef.current
      // 归还焦点前确认元素还在 DOM
      if (prev && document.contains(prev)) prev.focus()
    }
  }, [])

  // Esc 关闭 + Tab 焦点陷阱（只有最顶 modal 响应）
  useEffect(() => {
    const entry = { id: nextModalId++ }
    modalStack.push(entry)
    const isTop = () => modalStack[modalStack.length - 1]?.id === entry.id

    function onKey(e: KeyboardEvent) {
      if (!isTop()) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !cardRef.current) return
      const focusable = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      if (focusable.length === 0) { e.preventDefault(); cardRef.current.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || !cardRef.current.contains(active))) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = modalStack.indexOf(entry)
      if (i >= 0) modalStack.splice(i, 1)
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={e => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal-card ${SIZE_CLASS[size]} ${cardClassName} outline-none`}
        style={cardStyle}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-[20px] z-10">
          <h2 id={titleId} className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none focus-visible:outline-2 focus-visible:outline-navy-400 rounded"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  )
}
