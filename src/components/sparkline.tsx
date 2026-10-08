// 迷你趋势线 —— 纯 SVG，服务端/客户端组件都能直接用，不依赖图表库。

type Props = {
  values: number[]
  width?: number
  height?: number
  /** 线条颜色 */
  color?: string
  /** 面积渐变起始透明度 */
  fillOpacity?: number
  className?: string
  /** 无障碍描述，如「近 12 个月证件总数」 */
  label?: string
}

export function Sparkline({
  values,
  width = 160,
  height = 44,
  color = '#1f416b',
  fillOpacity = 0.16,
  className,
  label,
}: Props) {
  if (values.length < 2) return null

  const pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (width - pad * 2) / (values.length - 1)

  const pts = values.map((v, i) => {
    const x = pad + i * stepX
    // 全部相等时画在中线，避免贴底
    const y = max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })

  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  const [lx, ly] = pts[pts.length - 1]
  // 每个实例独立的渐变 id（同页多个小图时互不干扰）
  const gid = `spark-${color.replace(/[^a-z0-9]/gi, '')}-${values.length}-${values[values.length - 1]}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill="#fff" stroke={color} strokeWidth={1.75} />
    </svg>
  )
}
