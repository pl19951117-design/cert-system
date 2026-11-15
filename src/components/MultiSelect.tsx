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
import { Check, ChevronDown } from 'lucide-react'

export type MultiSelectProps = {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  disabled?: boolean
  /** 当无可见 <label> 时设置 aria-label */
  ariaLabel?: string
  /** 与可见 label 的 htmlFor 对应 */
  id?: string
  ariaLabelledBy?: string
}

export function MultiSelect({
  options, selected, onChange,
  placeholder = '全部', disabled = false, ariaLabel, id, ariaLabelledBy,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef    = useRef<HTMLUListElement>(null)
  const clearRef   = useRef<HTMLButtonElement>(null)
  const searchRef  = useRef({ value: '', time: 0 })
  const listId = useId()

  useEffect(() => {
    if (!disabled) return
    const raf = requestAnimationFrame(() => setOpen(false))
    return () => cancelAnimationFrame(raf)
  }, [disabled])

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
    const raf = requestAnimationFrame(() => {
      setActiveIdx(prev => {
        if (options.length === 0) return -1
        return prev < 0 || prev >= options.length ? 0 : prev
      })
      listRef.current?.focus()
    })
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
    if (disabled) return
    const opt = options[idx]
    if (opt === undefined) return
    onChange(selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt])
  }

  function onTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const selectedIdx = options.findIndex(opt => selected.includes(opt))
      setActiveIdx(options.length === 0 ? -1 : e.key === 'ArrowUp' ? options.length - 1 : Math.max(selectedIdx, 0))
      setOpen(true)
    }
  }

  function onListKey(e: React.KeyboardEvent<HTMLUListElement>) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault(); e.stopPropagation(); close(); return
      case 'ArrowDown':
        e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); return
      case 'ArrowUp':
        e.preventDefault(); setActiveIdx(i => options.length ? Math.max(i - 1, 0) : -1); return
      case 'Home':
        e.preventDefault(); setActiveIdx(options.length ? 0 : -1); return
      case 'End':
        e.preventDefault(); setActiveIdx(options.length - 1); return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (activeIdx >= 0) toggleAt(activeIdx)
        return
      case 'Tab':
        if (e.shiftKey && clearRef.current) {
          e.preventDefault()
          clearRef.current.focus()
          return
        }
        // 先回到触发器，再让浏览器自然走向相邻表单控件，避免卸载列表后丢失 Tab 顺序。
        triggerRef.current?.focus()
        setOpen(false)
        return
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const now = Date.now()
      const value = (now - searchRef.current.time < 650 ? searchRef.current.value : '') + e.key.toLocaleLowerCase()
      searchRef.current = { value, time: now }
      const idx = options.findIndex(opt => opt.toLocaleLowerCase().startsWith(value))
      if (idx >= 0) { e.preventDefault(); setActiveIdx(idx) }
    }
  }

  const triggerLabel =
    selected.length === 0 ? placeholder :
    selected.length === 1 ? selected[0] :
    `已选 ${selected.length} 项`

  return (
    <div
      ref={wrapRef}
      className="relative"
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        id={id}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={selected.length ? `${listId}-selection` : undefined}
        title={selected.length ? selected.join('、') : undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onTriggerKey}
        className="input-refined flex min-h-9 w-full items-center justify-between gap-2 !px-3 !py-2 !text-[13px] text-left disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        <span className="min-w-0 truncate text-slate-700">
          {triggerLabel}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.7}
          aria-hidden="true"
          className={`shrink-0 text-slate-500 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {selected.length > 0 && <span id={`${listId}-selection`} className="sr-only">已选：{selected.join('、')}</span>}

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-full min-w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-[0_4px_16px_rgba(15,23,42,0.08)]">
          {selected.length > 0 && (
            <button
              ref={clearRef}
              type="button"
              onClick={() => { onChange([]); listRef.current?.focus() }}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
                if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); listRef.current?.focus() }
                if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); close() }
              }}
              className="mb-1 min-h-9 w-full border-b border-slate-100 px-3 py-2 text-left text-xs font-medium text-navy-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
            >
              清除选择
            </button>
          )}
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? '可选筛选项')}
            aria-labelledby={ariaLabelledBy}
            aria-multiselectable="true"
            aria-activedescendant={activeIdx >= 0 && activeIdx < options.length ? `${listId}-opt-${activeIdx}` : undefined}
            tabIndex={-1}
            onKeyDown={onListKey}
            className="max-h-60 overflow-y-auto rounded-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-600"
          >
            {options.length === 0 ? (
              <li className="px-3 py-3 text-xs text-slate-500" role="presentation">暂无可选项</li>
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
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { toggleAt(idx); listRef.current?.focus() }}
                  className={`flex min-h-9 cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] transition-colors duration-150 ${checked ? 'text-navy-800' : 'text-slate-700'} ${active ? 'bg-slate-100' : checked ? 'bg-navy-50/60' : ''}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked ? 'bg-navy-700 border-navy-700' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && (
                      <Check size={12} strokeWidth={2} className="text-white" />
                    )}
                  </span>
                  <span className="min-w-0 break-words">{opt}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
