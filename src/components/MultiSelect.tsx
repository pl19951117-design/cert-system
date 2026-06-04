'use client'

// 生产级多选下拉
// 遵循 ARIA Authoring Practices: combobox 触发器 + multi-selectable listbox
// 键盘：
//   触发器 Enter/Space/↓ → 打开 + 聚焦列表
//   列表内 ↑↓             → 移动 active 项
//   列表内 Home/End       → 跳到首/末
//   列表内 Enter/Space    → 切换 active 项的选中
//   列表内 Esc            → 关闭 + 焦点回触发器
//   列表内 Tab            → 关闭（自然 Tab 走向下一个表单元素）
// 边界：disabled / 空选项 / 长文本截断 / 鼠标点外部关闭

import { useEffect, useId, useRef, useState } from 'react'

export type MultiSelectProps = {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  disabled?: boolean
  /** 当无可见 <label> 时设置 aria-label */
  ariaLabel?: string
}

export function MultiSelect({
  options, selected, onChange,
  placeholder = '全部', disabled = false, ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef    = useRef<HTMLUListElement>(null)
  const listId = useId()

  // 关闭：点外部
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // 打开时：初始化 active；聚焦列表；滚动到 active
  useEffect(() => {
    if (!open) return
    setActiveIdx(prev => {
      if (options.length === 0) return -1
      return prev < 0 || prev >= options.length ? 0 : prev
    })
    const raf = requestAnimationFrame(() => listRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open, options.length])

  // active 变化时滚动到视口
  useEffect(() => {
    if (!open || activeIdx < 0 || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function toggleAt(idx: number) {
    const opt = options[idx]
    if (opt === undefined) return
    onChange(selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt])
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
    }
  }

  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault(); close(); return
      case 'ArrowDown':
        e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); return
      case 'ArrowUp':
        e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return
      case 'Home':
        e.preventDefault(); setActiveIdx(0); return
      case 'End':
        e.preventDefault(); setActiveIdx(options.length - 1); return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (activeIdx >= 0) toggleAt(activeIdx)
        return
      case 'Tab':
        // 不拦截 — Tab 自然走向下一个表单控件
        setOpen(false)
        return
    }
  }

  const triggerLabel =
    selected.length === 0 ? placeholder :
    selected.length === 1 ? selected[0] :
    `已选 ${selected.length} 项`

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onTriggerKey}
        className="input-refined !py-1.5 !px-2.5 !text-xs flex items-center justify-between gap-2 text-left w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`truncate ${selected.length === 0 ? 'text-slate-400' : 'text-slate-700'}`}>
          {triggerLabel}
        </span>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`w-2.5 h-2.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path fill="currentColor" d="M2.2 4.2l3.8 3.8 3.8-3.8z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg py-1">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-3 py-1.5 text-[11px] text-amber-500 hover:bg-slate-50 font-medium border-b border-slate-100"
            >
              清除选择
            </button>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-activedescendant={activeIdx >= 0 ? `${listId}-opt-${activeIdx}` : undefined}
            tabIndex={-1}
            onKeyDown={onListKey}
            className="max-h-60 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-amber-300 rounded"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-400" role="presentation">无选项</li>
            ) : options.map((opt, idx) => {
              const checked = selected.includes(opt)
              const active = idx === activeIdx
              return (
                <li
                  key={opt}
                  id={`${listId}-opt-${idx}`}
                  role="option"
                  aria-selected={checked}
                  data-idx={idx}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => toggleAt(idx)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 cursor-pointer ${active ? 'bg-slate-50' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      checked ? 'bg-amber-500 border-amber-500' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white">
                        <path fill="currentColor" d="M10.28 2.28L4.5 8.06 1.72 5.28.28 6.72l4.22 4.22 7.22-7.22z" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate" title={opt}>{opt}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
