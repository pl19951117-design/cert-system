'use client'

import { useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronRight, PanelLeft, Search, Building2 } from 'lucide-react'
import { OPEN_PALETTE_EVENT } from '@/components/command-palette'

const TITLES: Record<string, string> = {
  '/': '总览看板', '/personnel': '人员证件管理', '/alerts': '到期预警',
  '/education': '继续教育', '/transfers': '转入转出登记', '/safety-inspections': '安全检查', '/legal-cases': '法务案件',
  '/exams': '考试报名', '/logs': '变动流水', '/recycle': '回收站',
  '/admin': '系统管理', '/backup': '数据备份', '/audit': '操作审计',
}

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sidebar'] })
  return () => observer.disconnect()
}

const getCollapsed = () => document.documentElement.dataset.sidebar === 'collapsed'
const getServerCollapsed = () => false

export function WorkspaceToolbar({ account }: { account: string }) {
  const pathname = usePathname()
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, getServerCollapsed)
  const title = TITLES[pathname] ?? (pathname.startsWith('/personnel/') ? '人员详情' : '工作空间')

  function toggleSidebar() {
    if (collapsed) delete document.documentElement.dataset.sidebar
    else document.documentElement.dataset.sidebar = 'collapsed'
    try { localStorage.setItem('sidebar-collapsed', collapsed ? '0' : '1') } catch { /* optional persistence */ }
  }

  return (
    <header className="workspace-toolbar no-print">
      <button type="button" onClick={toggleSidebar} className="toolbar-sidebar-toggle toolbar-icon-button"
        aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'} aria-expanded={!collapsed} aria-controls="workspace-sidebar">
        <PanelLeft size={19} strokeWidth={1.7} aria-hidden="true" />
      </button>
      <div className="workspace-breadcrumb" aria-label="当前位置">
        <Building2 size={15} strokeWidth={1.6} aria-hidden="true" />
        <span className="workspace-account" title={account}>{account || '工作空间'}</span>
        <ChevronRight size={13} aria-hidden="true" />
        <span className="workspace-current">{title}</span>
      </div>
      <button type="button" className="toolbar-search" onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))} aria-label="搜索人员或页面">
        <Search size={16} strokeWidth={1.7} aria-hidden="true" />
        <span>搜索</span><kbd>Ctrl K</kbd>
      </button>
    </header>
  )
}
