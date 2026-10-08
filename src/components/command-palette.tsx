'use client'

// 全局搜索（Ctrl+K / ⌘K）：按姓名、身份证号、建制、负责人、证件编号查人，或快速跳转到任一功能页。
// 选中人员 → 打开人员页的详情抽屉；已在人员页时通过事件直接打开，不刷新列表。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Person } from '@/lib/personnel/types'

export const OPEN_PALETTE_EVENT = 'command-palette:open'
export const OPEN_PERSON_EVENT = 'personnel:open'
export const ADD_PERSON_EVENT = 'personnel:add'

type Cmd = { label: string; hint: string; href: string; keywords: string }

const COMMANDS: Cmd[] = [
  { label: '总览看板',     hint: '页面', href: '/',           keywords: 'zlkb dashboard 首页 看板' },
  { label: '人员证件管理', hint: '页面', href: '/personnel',  keywords: 'rygl 人员 证件' },
  { label: '添加人员',     hint: '操作', href: '/personnel?add=1', keywords: 'tjry 新增 入职' },
  { label: '到期预警',     hint: '页面', href: '/alerts',     keywords: 'dqyj 预警 过期' },
  { label: '转入转出登记', hint: '页面', href: '/transfers',  keywords: 'zrzc 转入 转出 登记' },
  { label: '合规报表',     hint: '页面', href: '/compliance', keywords: 'hgbb 合规 报表' },
  { label: '考试报名',     hint: '页面', href: '/exams',      keywords: 'ksbm 考试' },
  { label: '变动流水',     hint: '页面', href: '/logs',       keywords: 'bdls 流水 变动' },
  { label: '回收站',       hint: '页面', href: '/recycle',    keywords: 'hsz 删除 恢复' },
  { label: '系统管理',     hint: '页面', href: '/admin',      keywords: 'xtgl 账套 用户 设置' },
  { label: '数据备份',     hint: '页面', href: '/backup',     keywords: 'sjbf 备份 恢复' },
  { label: '操作审计',     hint: '页面', href: '/audit',      keywords: 'czsj 审计 日志' },
]

type Item =
  | { kind: 'person'; person: Person; match: string }
  | { kind: 'cmd'; cmd: Cmd }

const MAX_PEOPLE = 8

export function CommandPalette({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Person[] | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    setQ('')
    setActive(0)
    setOpen(true)
  }, [])

  // 快捷键 + 外部触发（侧边栏搜索按钮）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => { if (!o) { setQ(''); setActive(0) } return !o })
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, show)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, show)
    }
  }, [show])

  // 每次打开都拉一次最新人员（数据量不大，保证搜到刚添加的人）
  useEffect(() => {
    if (!open) return
    let alive = true
    fetch('/api/personnel')
      .then(r => (r.ok ? r.json() : []))
      .then(d => { if (alive) setPeople(Array.isArray(d) ? d : []) })
      .catch(() => { if (alive) setPeople([]) })
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => { alive = false; clearTimeout(t) }
  }, [open])

  const items: Item[] = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const cmds = COMMANDS
      .filter(c => isSuperAdmin || !['/admin', '/backup', '/audit'].includes(c.href))
      .filter(c => !kw || c.label.toLowerCase().includes(kw) || c.keywords.toLowerCase().includes(kw))
      .map(cmd => ({ kind: 'cmd' as const, cmd }))
    if (!kw) return cmds

    const found: Item[] = []
    for (const p of people ?? []) {
      let match = ''
      if (p.name.toLowerCase().includes(kw)) match = ''
      else if ((p.idCard || '').toLowerCase().includes(kw)) match = `身份证 ${p.idCard}`
      else if ((p.orgName || '').toLowerCase().includes(kw)) match = ''   // 建制已显示在姓名旁
      else if ((p.manager || '').toLowerCase().includes(kw)) match = `负责人 ${p.manager}`
      else {
        const c = p.certificates.find(c => (c.certNo || '').toLowerCase().includes(kw))
        if (!c) continue
        match = `证件 ${c.certType || ''} ${c.certNo}`
      }
      found.push({ kind: 'person', person: p, match })
      if (found.length >= MAX_PEOPLE) break
    }
    return [...found, ...cmds]
  }, [q, people, isSuperAdmin])


  // 选中项滚动到可见
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function choose(item: Item | undefined) {
    if (!item) return
    setOpen(false)
    if (item.kind === 'cmd') {
      // 已在人员页时，同路由换 query 不会重新挂载页面，改用事件直接打开添加弹窗
      if (item.cmd.href === '/personnel?add=1' && pathname === '/personnel') {
        window.dispatchEvent(new Event(ADD_PERSON_EVENT))
      } else {
        router.push(item.cmd.href)
      }
      return
    }
    const id = item.person.id
    if (pathname === '/personnel') {
      window.dispatchEvent(new CustomEvent(OPEN_PERSON_EVENT, { detail: id }))
    } else {
      router.push(`/personnel?open=${id}`)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  if (!open) return null

  const personCount = items.filter(i => i.kind === 'person').length
  const kw = q.trim()

  return (
    <div className="palette-overlay" onClick={() => setOpen(false)}>
      <div
        className="palette-card"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-[var(--line)]">
          <svg className="w-[18px] h-[18px] text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="搜索姓名、身份证号、建制、负责人、证件编号，或输入页面名…"
            className="flex-1 py-4 bg-transparent text-[14px] text-[var(--ink-1)] placeholder:text-slate-400 outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-item-${active}` : undefined}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[56vh] overflow-y-auto p-2">
          {kw && people === null && <div className="px-3 py-6 text-center text-xs text-slate-400">加载中…</div>}
          {kw && people !== null && items.length === 0 && (
            <div className="px-3 py-8 text-center text-[13px] text-slate-400">没有找到「{kw}」</div>
          )}
          {items.map((item, idx) => {
            const selected = idx === active
            const header =
              idx === 0 && item.kind === 'person' ? `人员${personCount >= MAX_PEOPLE ? `（前 ${MAX_PEOPLE} 个）` : ''}`
              : item.kind === 'cmd' && (idx === 0 || items[idx - 1].kind !== 'cmd') ? '页面与操作'
              : null
            return (
              <div key={item.kind === 'person' ? `p${item.person.id}` : `c${item.cmd.href}`}>
                {header && <div className="px-3 pt-2.5 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-slate-400">{header}</div>}
                <div
                  id={`palette-item-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(item)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer ${selected ? 'bg-navy-50 text-navy-900' : 'text-slate-700'}`}
                >
                  {item.kind === 'person' ? (
                    <>
                      <span className="w-7 h-7 rounded-full bg-gold-100 text-gold-700 flex items-center justify-center text-[11px] font-bold flex-shrink-0" aria-hidden="true">
                        {item.person.name[0]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium truncate">
                          {item.person.name}
                          <span className="ml-2 text-[12px] font-normal text-slate-400">{item.person.orgName || '未填写建制'}</span>
                        </div>
                        <div className="text-[11.5px] text-slate-400 truncate">
                          {item.match || `${item.person.certificates.length} 本证件${item.person.manager ? ` · 负责人 ${item.person.manager}` : ''}`}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </span>
                      <span className="flex-1 text-[13.5px]">{item.cmd.label}</span>
                      <span className="text-[11px] text-slate-400">{item.cmd.hint}</span>
                    </>
                  )}
                  {selected && <kbd className="kbd">Enter</kbd>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--line)] text-[11px] text-slate-400">
          <span><kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> 选择</span>
          <span><kbd className="kbd">Enter</kbd> 打开</span>
          <span className="ml-auto"><kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> 随时唤起</span>
        </div>
      </div>
    </div>
  )
}
