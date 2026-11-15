import { Skeleton, TableRowSkeleton } from '@/components/Skeleton'

export default function DashboardLoading() {
  return (
    <section role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">正在加载页面，请稍候。</span>
      <div aria-hidden="true" className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-2.5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(key => (
          <div key={key} className="card-elevated space-y-4 p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="card-elevated overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4"><Skeleton className="h-4 w-32" /></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <tbody><TableRowSkeleton cols={5} count={7} /></tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
