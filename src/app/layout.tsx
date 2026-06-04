import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '证件管理系统',
  description: '证件管理平台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full antialiased text-slate-900">{children}</body>
    </html>
  )
}
