'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrandLogo } from '@/components/brand-logo'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      router.push('/')
      router.refresh()
    } catch {
      setError('网络异常，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[var(--canvas)]">
      {/* 左：品牌面板（窄窗口时隐藏） */}
      <div className="hidden lg:flex relative w-[52%] flex-col justify-between overflow-hidden px-14 py-12 text-white"
        style={{ background: 'linear-gradient(160deg, #13335a 0%, #0f2a4a 45%, #0a1d34 100%)' }}>
        {/* 背景：细网格 + 金色弧线，克制的纹理 */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
          <defs>
            <pattern id="login-grid" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d="M44 0H0V44" fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
            </pattern>
            <linearGradient id="login-arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#e0c677" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#c9a227" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#login-grid)" />
          <circle cx="92%" cy="104%" r="340" fill="none" stroke="url(#login-arc)" strokeWidth="1.2" />
          <circle cx="92%" cy="104%" r="250" fill="none" stroke="url(#login-arc)" strokeWidth="1" opacity="0.6" />
        </svg>
        <div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full blur-[110px] pointer-events-none"
          style={{ background: 'rgba(201,162,39,0.10)' }} />

        <div className="relative flex items-center gap-4">
          <BrandLogo size={60} tile />
          <div>
            <div className="text-[17px] font-bold tracking-tight">证件管理系统</div>
            <div className="text-[11.5px] text-navy-200/70 mt-1 tracking-[0.12em]">三类人员 · 证件台账</div>
          </div>
        </div>

        <div className="relative max-w-md">
          <div className="text-[11px] font-semibold tracking-[0.28em] text-gold-300/90 mb-4">CERTIFICATE · REGISTRY</div>
          <h1 className="text-[34px] leading-[1.25] font-bold tracking-tight">
            三类人员证件<br />一本台账，清清楚楚
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-navy-200/80">
            A / B / C 类证件的到期、社保、建制归属与变动流水，集中在一处管理。
          </p>
          <ul className="mt-9 space-y-4">
            {[
              ['到期预警', '过期 / 30 天 / 90 天三级提醒，启动即可看到'],
              ['建制归类', '同建制、同负责人自动排在一起，可折叠查看'],
              ['流水与报告', '按月统计新增、减少，一键生成数据报告'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3.5">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-gold-400 flex-shrink-0" />
                <div>
                  <div className="text-[13.5px] font-semibold">{t}</div>
                  <div className="text-[12.5px] text-navy-200/70 mt-0.5">{d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[11px] text-navy-300/60 tracking-wide">内部管理平台 · 数据保存在本单位电脑</div>
      </div>

      {/* 右：登录表单 */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[360px]">
          {/* 窄窗口时的简版品牌 */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <BrandLogo size={48} />
            <div className="text-[16px] font-bold text-[var(--ink-1)]">证件管理系统</div>
          </div>

          <h2 className="text-[24px] font-bold text-[var(--ink-1)] tracking-tight">欢迎回来</h2>
          <p className="text-[13px] text-[var(--ink-3)] mt-1.5 mb-8">请使用分配给你的账号登录</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-username" className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1.5">用户名</label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="请输入用户名"
                autoComplete="username"
                autoFocus
                className="input-refined !py-2.5"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-[12px] font-semibold text-[var(--ink-2)] mb-1.5">密码</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="input-refined !py-2.5"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] bg-red-50 border border-red-200">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[13px] text-red-600">{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full !py-2.5 mt-2">
              {loading ? '登录中…' : '登录'}
            </button>
          </form>

          <p className="mt-10 text-[11.5px] text-[var(--ink-3)] text-center">忘记密码请联系超级管理员重置</p>
        </div>
      </div>
    </div>
  )
}

