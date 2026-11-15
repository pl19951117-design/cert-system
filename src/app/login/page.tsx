'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff, TriangleAlert } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Spinner } from '@/components/Spinner'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      if (!res.ok) { setError(data.error || '登录失败，请重试'); return }
      router.push('/')
      router.refresh()
    } catch {
      setError('连接失败，请检查网络后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page apple-login">
      <div className="apple-login-brand"><BrandLogo size={32} /><span>证件管理系统</span></div>
      <section className="apple-login-card" aria-labelledby="login-title">
        <div className="apple-login-mark"><BrandLogo size={56} /></div>
        <h1 id="login-title">登录工作空间</h1>
        <p className="apple-login-description">有序管理每一位人员、每一份证件。</p>
        <form onSubmit={handleSubmit} aria-busy={loading} className="space-y-5">
          <div>
            <label htmlFor="login-username" className="mb-2 block text-[13px] font-medium text-slate-700">用户名</label>
            <input id="login-username" name="username" type="text" autoComplete="username" required autoFocus readOnly={loading}
              value={username} onChange={e=>setUsername(e.target.value)} placeholder="请输入用户名"
              aria-describedby={error ? 'login-error' : undefined} className="input-refined !min-h-12" />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-2 block text-[13px] font-medium text-slate-700">密码</label>
            <div className="relative">
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required readOnly={loading}
                value={password} onChange={e=>setPassword(e.target.value)} placeholder="请输入密码"
                aria-describedby={error ? 'login-error' : undefined} className="input-refined !min-h-12 !pr-12" />
              <button type="button" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword}
                className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                {showPassword ? <EyeOff size={18} strokeWidth={1.6} aria-hidden="true" /> : <Eye size={18} strokeWidth={1.6} aria-hidden="true" />}
              </button>
            </div>
          </div>
          {error && <p id="login-error" role="alert" className="form-error flex items-start gap-2"><TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary !min-h-12 w-full !text-sm">
            {loading ? <><Spinner size={17} />正在登录…</> : <>登录<ArrowRight size={16} aria-hidden="true" /></>}
          </button>
        </form>
        <p className="apple-login-help">忘记密码？请联系超级管理员重置。</p>
      </section>
      <p className="apple-login-footer">人员 · 证件 · 继续教育</p>
    </main>
  )
}
