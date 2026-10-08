// 单位 logo（public/brand/logo.png，透明底）。
// logo 含黑色字母，放在深色背景上时用 tile（白色圆角底板）保证可读；浅色背景可直接用透明版。

type Props = {
  /** 外框边长（px） */
  size?: number
  /** 是否加白色圆角底板（深色背景上使用） */
  tile?: boolean
  className?: string
}

export function BrandLogo({ size = 40, tile = false, className = '' }: Props) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- 静态小图，无需图片优化（桌面端离线运行）
    <img
      src="/brand/logo.png"
      alt="单位标志"
      width={tile ? Math.round(size * 0.8) : size}
      height={tile ? Math.round(size * 0.8) : size}
      draggable={false}
      className="block select-none object-contain"
    />
  )
  if (!tile) return <span className={`inline-flex flex-shrink-0 ${className}`}>{img}</span>
  return (
    <span
      className={`inline-flex items-center justify-center flex-shrink-0 bg-white shadow-lg shadow-black/20 ring-1 ring-black/5 ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
    >
      {img}
    </span>
  )
}
