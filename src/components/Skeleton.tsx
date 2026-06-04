'use client'

// 骨架屏占位
// - 装饰性元素，aria-hidden 让 AT 跳过
// - 外层容器若代表加载中状态，调用方应额外标 role="status" + sr-only "加载中..."

export type SkeletonProps = {
  className?: string
  /** 显式宽高（覆盖 className） */
  width?: number | string
  height?: number | string
}

export function Skeleton({ className = '', width, height }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-md bg-slate-100 motion-safe:animate-pulse ${className}`}
      style={{ width, height }}
    />
  )
}

/** 表格行骨架 — 用于数据表加载占位 */
export function TableRowSkeleton({ cols, count = 5 }: { cols: number; count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3 py-3">
              <Skeleton className="h-3 w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
