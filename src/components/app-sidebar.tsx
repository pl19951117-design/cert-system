'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeftRight, ChartNoAxesCombined, ChevronLeft, ClipboardList,
  Database, Scale, ClipboardCheck, GraduationCap, History, KeyRound, LogOut,
  Search, Settings2, ShieldCheck, TriangleAlert, Trash2, UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChangePasswordModal } from '@/components/change-password-modal'
import { OPEN_PALETTE_EVENT } from '@/components/command-palette'
import { BrandLogo } from '@/components/brand-logo'
import { Modal } from '@/components/Modal'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/components/toast'

const NAV = [
  { href: '/', label: '总览看板', icon: ChartNoAxesCombined },
  { href: '/personnel', label: '人员证件管理', icon: UsersRound },
  { href: '/alerts', label: '到期预警', icon: TriangleAlert },
  { href: '/education', label: '继续教育', icon: GraduationCap },
  { href: '/transfers', label: '转入转出登记', icon: ArrowLeftRight },
  { href: '/safety-inspections', label: '安全检查', icon: ClipboardCheck },
  { href: '/legal-cases', label: '法务案件', icon: Scale },
  { href: '/exams', label: '考试报名', icon: ClipboardList },
  { href: '/logs', label: '变动流水', icon: History },
  { href: '/recycle', label: '回收站', icon: Trash2 },
]

const ADMIN_NAV = [
  { href: '/admin', label: '系统管理', icon: Settings2 },
  { href: '/backup', label: '数据备份', icon: Database },
  { href: '/audit', label: '操作审计', icon: ShieldCheck },
]

type Props = {
  user: { displayName: string; username: string; role: string }
  account: string
  accounts: string[]
  /** 转入转出登记的待办数（>0 时显示角标） */
  pendingTransfers?: number
}

const iconProps = { size: 18, strokeWidth: 1.7, 'aria-hidden': true } as const

function subscribeSidebar(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sidebar'] })
  return () => observer.disconnect()
}

function getSidebarCollapsed() {
  return document.documentElement.getAttribute('data-sidebar') === 'collapsed'
}

function getServerSidebarCollapsed() { return false }

function subscribeNarrowSidebar(onChange: () => void) {
  const query = window.matchMedia('(max-width: 760px)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getNarrowSidebar() {
  return window.matchMedia('(max-width: 760px)').matches
}

export function AppSidebar({ user, account, accounts, pendingTransfers = 0 }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const collapsed = useSyncExternalStore(subscribeSidebar, getSidebarCollapsed, getServerSidebarCollapsed)
  const narrow = useSyncExternalStore(subscribeNarrowSidebar, getNarrowSidebar, getServerSidebarCollapsed)
  const compact = collapsed || narrow
  const [loggingOut, setLoggingOut] = useState(false)
  const roleLabel = user.role === 'super_admin' ? '超级管理员' : user.role === 'editor' ? '编辑员' : '查看员'

  function toggleCollapsed() {
    const next = !getSidebarCollapsed()
    const el = document.documentElement
    if (next) el.setAttribute('data-sidebar', 'collapsed')
    else el.removeAttribute('data-sidebar')
    try { localStorage.setItem('sidebar-collapsed', next ? '1' : '0') } catch { /* 忽略 */ }
  }

  function switchAccount(nextAccount: string) {
    document.cookie = `cert-account=${encodeURIComponent(nextAccount)}; path=/`
    setShowAccountMenu(false)
    router.refresh()
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('退出登录失败，请重试')
      router.push('/login')
      router.refresh()
    } catch {
      toast('退出登录失败，请重试', 'error')
    } finally {
      setLoggingOut(false)
    }
  }

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href)
  }

  const linkClass = (href: string) => cn(
    'sidebar-link sb-row relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150',
    isActive(href)
      ? 'sidebar-link-selected'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  )

  return (
    <aside id="workspace-sidebar" className="app-sidebar sidebar-surface fixed inset-y-0 left-0 z-50 flex flex-col">
      <Link href="/" aria-label="证件管理系统首页" className="sidebar-brand sb-row flex items-center gap-3 px-5 py-5">
        <BrandLogo size={32} />
        <div className="sb-hide min-w-0">
          <div className="whitespace-nowrap text-[15px] font-semibold leading-6 tracking-tight text-slate-900">证件管理系统</div>
          <div className="mt-0.5 whitespace-nowrap text-xs text-slate-500">三类人员 · 证件台账</div>
        </div>
      </Link>

      <div className="sidebar-account-section sb-hide px-4 pb-4">
        <label htmlFor="sidebar-account" className="mb-2 block px-1 text-xs font-medium text-slate-500">当前账套</label>
        <select
          id="sidebar-account"
          key={account}
          defaultValue={account}
          onChange={e => switchAccount(e.target.value)}
          className="input-refined w-full bg-slate-50 !px-3 !py-2 !text-[13px]"
        >
          {accounts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div className="sidebar-search-section px-3 pb-4">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
          title="搜索（Ctrl+K）"
          aria-label="搜索人员或页面"
          className="sidebar-search sb-row flex min-h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-500 transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
        >
          <Search {...iconProps} className="shrink-0" />
          <span className="sb-hide flex-1 whitespace-nowrap text-left text-xs">搜索人员、页面</span>
          <kbd className="sb-hide whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-1 text-xs text-slate-500">Ctrl K</kbd>
        </button>
      </div>

      <nav aria-label="主导航" className="min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto px-3 pb-4">
        <div className="sb-hide mb-2 px-3 text-xs font-medium text-slate-500">业务管理</div>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} title={label} aria-label={label} aria-current={isActive(href) ? 'page' : undefined} className={linkClass(href)}>
            <Icon {...iconProps} className="shrink-0" />
            <span className="sb-hide flex-1 whitespace-nowrap">{label}</span>
            {href === '/transfers' && pendingTransfers > 0 && (
              <span className="sb-badge flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--brand-tint)] px-1 text-xs font-semibold tabular-nums text-[var(--brand-ink)]" aria-label={`${pendingTransfers} 条待办`}>
                {pendingTransfers > 99 ? '99+' : pendingTransfers}
              </span>
            )}
          </Link>
        ))}

        {user.role === 'super_admin' && (
          <>
            <div className="sb-hide mb-2 mt-6 border-t border-slate-100 px-3 pt-5 text-xs font-medium text-slate-500">系统与数据</div>
            {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} title={label} aria-label={label} aria-current={isActive(href) ? 'page' : undefined} className={linkClass(href)}>
                <Icon {...iconProps} className="shrink-0" />
                <span className="sb-hide whitespace-nowrap">{label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="hidden px-3 pb-3 min-[761px]:block">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
          aria-expanded={!collapsed}
          className="sidebar-collapse sb-row flex min-h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-slate-500 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-800"
        >
          <ChevronLeft {...iconProps} className={cn('shrink-0 transition-transform duration-150', collapsed && 'rotate-180')} />
          <span className="sb-hide">收起导航</span>
        </button>
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="sb-row flex items-center gap-2.5 px-1 py-1">
          <button
            type="button"
            onClick={() => compact ? setShowAccountMenu(true) : setShowChangePwd(true)}
            title={`${user.displayName || user.username} · ${roleLabel}，${compact ? '账户与账套' : '修改密码'}`}
            aria-label={compact ? '打开账户与账套菜单' : '修改密码'}
            aria-haspopup={compact ? 'dialog' : undefined}
            aria-expanded={compact ? showAccountMenu : undefined}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-200"
          >
            {(user.displayName || user.username)[0].toUpperCase()}
          </button>
          <div className="sb-hide min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-slate-800" title={user.displayName || user.username}>{user.displayName || user.username}</div>
            <div className="mt-0.5 text-xs text-slate-500">{roleLabel}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="退出登录"
            title="退出登录"
            className="sb-hide flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-wait disabled:opacity-50"
          >
            {loggingOut ? <Spinner size={16} label="正在退出登录" /> : <LogOut {...iconProps} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowChangePwd(true)}
          className="sb-hide mt-2 flex min-h-8 w-full items-center justify-center gap-2 rounded-md text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <KeyRound size={14} strokeWidth={1.7} aria-hidden="true" />
          修改密码
        </button>
      </div>

      {showAccountMenu && (
        <Modal title="账户与账套" size="sm" onClose={() => setShowAccountMenu(false)} closeOnBackdrop>
          <div className="space-y-5 p-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700" aria-hidden="true">
                {(user.displayName || user.username)[0].toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-slate-800">{user.displayName || user.username}</p>
                <p className="mt-0.5 text-xs text-slate-500">{roleLabel}</p>
              </div>
            </div>
            <div>
              <label htmlFor="compact-sidebar-account" className="mb-2 block text-[13px] font-medium text-slate-700">当前账套</label>
              <select id="compact-sidebar-account" value={account} onChange={e => switchAccount(e.target.value)} className="input-refined !min-h-11">
                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="grid gap-2 border-t border-slate-100 pt-5">
              <button type="button" className="btn-secondary !min-h-11" onClick={() => { setShowAccountMenu(false); setShowChangePwd(true) }}>
                <KeyRound {...iconProps} />修改密码
              </button>
              <button type="button" className="btn-secondary !min-h-11" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? <Spinner size={16} label="正在退出登录" /> : <LogOut {...iconProps} />}
                {loggingOut ? '正在退出…' : '退出登录'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
    </aside>
  )
}
