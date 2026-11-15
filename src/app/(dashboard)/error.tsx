'use client'

import { useEffect, useTransition } from 'react'
import Link from 'next/link'
import { CircleAlert, RotateCw } from 'lucide-react'
import { Spinner } from '@/components/Spinner'

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const [retrying, startTransition] = useTransition()

  useEffect(() => { console.error('[dashboard]', error) }, [error])

  return (
    <section role="alert" aria-labelledby="page-error-title" className="card-elevated mx-auto mt-8 max-w-xl px-6 py-12 text-center sm:px-10">
      <span className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
        <CircleAlert size={22} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <h1 id="page-error-title" className="text-lg font-semibold text-slate-900">页面暂时无法显示</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">加载页面时遇到了问题，请重试。</p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={retrying}
          onClick={() => startTransition(() => unstable_retry())}
          className="btn-primary inline-flex items-center justify-center gap-2"
        >
          {retrying ? <Spinner size={16} /> : <RotateCw size={16} strokeWidth={1.7} aria-hidden="true" />}
          {retrying ? '正在重试…' : '重新加载'}
        </button>
        <Link href="/" className="btn-secondary inline-flex items-center justify-center">返回总览</Link>
      </div>
    </section>
  )
}
