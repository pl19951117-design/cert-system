'use client'

// 可访问的加载指示器
// - role="status" 让屏幕阅读器把它当作活动状态区域
// - 视觉文字 sr-only 隐藏（不影响 layout）
// - prefers-reduced-motion 下保留静态显示（CSS 由 globals 控制；这里仅旋转）

export type SpinnerProps = {
  /** 像素大小，默认 16 */
  size?: number
  /** 可读 label，默认"加载中" */
  label?: string
  /** 颜色继承 currentColor，可通过 className 覆盖 */
  className?: string
}

export function Spinner({ size = 16, label = '加载中', className = '' }: SpinnerProps) {
  return (
    <span role="status" className={`inline-flex items-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="motion-safe:animate-spin"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" fill="none" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}
