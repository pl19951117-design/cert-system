import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '证件管理系统',
  description: '证件管理平台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <head>
        {/* 在首次绘制前恢复侧边栏折叠状态，避免展开→折叠的闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('sidebar-collapsed')==='1'){document.documentElement.setAttribute('data-sidebar','collapsed')}}catch(e){}`,
          }}
        />
      </head>
      <body className="h-full antialiased text-slate-900">{children}</body>
    </html>
  )
}
