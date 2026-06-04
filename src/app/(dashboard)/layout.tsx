import { redirect } from 'next/navigation'
import { getSession, decodeAccountCookie } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AppSidebar } from '@/components/app-sidebar'
import { Toaster } from '@/components/toast'
import { StartupReminder } from '@/components/startup-reminder'
import { cookies } from 'next/headers'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const cookieStore = await cookies()
  const accounts = await prisma.account.findMany({
    // 显示顺序：先按用户自定义 sortOrder（NULL 排后面），再按创建时间兜底
    orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })
  const accountIds = accounts.map(a => a.id)

  const savedAccount = decodeAccountCookie(cookieStore.get('cert-account')?.value)
  const account = accountIds.includes(savedAccount ?? '')
    ? (savedAccount as string)
    : (accountIds[0] ?? '')

  return (
    <div className="flex h-full">
      <AppSidebar
        user={{ displayName: session.displayName, username: session.username, role: session.role }}
        account={account}
        accounts={accountIds}
      />
      <main className="flex-1 ml-[232px] min-h-full overflow-x-hidden">
        {/*
          key={account}：切换账套时整个内容子树 remount，迫使所有客户端页面
          （personnel / alerts / exams 等）重新跑各自的 useEffect 数据加载。
          否则 router.refresh() 只刷新服务端组件，客户端组件维持旧数据。
        */}
        <div className="max-w-7xl mx-auto px-8 py-8" key={account || '__none__'}>
          {children}
        </div>
      </main>
      <Toaster />
      <StartupReminder />
    </div>
  )
}
