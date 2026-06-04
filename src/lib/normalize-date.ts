// 把各种来源的日期值归一化为 `YYYY-MM-DD`；无法识别时返回 null。
//
// 设计目的：Excel 导入时单元格日期可能是
//   - 日期型单元格 → SheetJS 解析成 Date 对象 或 序列号（如 45658）
//   - 文本日期      → "2025/1/3"、"2025.1.3"、"2025年1月3日"、"2025-1-3"（可带时间后缀）
// 这些都必须落库成统一的 `YYYY-MM-DD`，否则 certStatus / 续期等逻辑（只认 YYYY-MM-DD）
// 会判定为「无日期」，表现为用户报告的「有效期不能识别」。
//
// 纯函数，无副作用，便于单测。

/** 仅接受合理范围内的年月日，拼成补零的 YYYY-MM-DD，否则 null */
function format(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || y < 1900 || y > 3000) return null
  if (!Number.isInteger(m) || m < 1 || m > 12) return null
  if (!Number.isInteger(d) || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Excel 日期序列号 → YYYY-MM-DD。
 * 以 1899-12-30 为 0 号（SheetJS 同款锚点，对 1954 年以后的现代日期精确；
 * 证件日期均为现代日期，故不受 1900 闰年 bug 影响）。
 * 用 UTC 计算，避免本地时区把日期推前/后一天。
 */
function excelSerialToYMD(serial: number): string | null {
  const ms = Math.round(serial * 86400000) + Date.UTC(1899, 11, 30)
  const dt = new Date(ms)
  if (Number.isNaN(dt.getTime())) return null
  return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

// 现代日期序列号下限（≈1954-09）。低于此值的纯数字（如 "2025" 这种年份）
// 不当作序列号，避免把年份误解析成 1900 年代的日期。
const SERIAL_MIN = 20000
// 上限 ≈ 公元 3000 年。
const SERIAL_MAX = 401768

const SEP_RE = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?:[\sT].*)?$/

/** 归一化任意日期输入为 YYYY-MM-DD；无法识别返回 null。 */
export function normalizeDate(input: unknown): string | null {
  if (input == null) return null

  if (input instanceof Date) {
    return Number.isNaN(input.getTime())
      ? null
      : format(input.getFullYear(), input.getMonth() + 1, input.getDate())
  }

  if (typeof input === 'number') {
    return input >= SERIAL_MIN && input <= SERIAL_MAX ? excelSerialToYMD(input) : null
  }

  const s = String(input).trim()
  if (!s) return null

  // 纯数字字符串 → 可能是 Excel 序列号
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s)
    return n >= SERIAL_MIN && n <= SERIAL_MAX ? excelSerialToYMD(n) : null
  }

  // 年[-/.年]月[-/.月]日[日]（允许时间后缀），分隔符可混用
  const m = SEP_RE.exec(s)
  if (m) return format(Number(m[1]), Number(m[2]), Number(m[3]))

  return null
}
