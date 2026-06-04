// 中国大陆 18 位身份证号校验（GB 11643-1999 校验码）
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const CHECK = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

export function isValidIdCard(id: string | null | undefined): boolean {
  if (!id) return false
  const s = id.trim().toUpperCase()
  if (!/^\d{17}[\dX]$/.test(s)) return false

  // 出生日期合法性
  const y = parseInt(s.slice(6, 10))
  const m = parseInt(s.slice(10, 12))
  const d = parseInt(s.slice(12, 14))
  if (y < 1900 || y > new Date().getFullYear()) return false
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false

  // 校验码
  let sum = 0
  for (let i = 0; i < 17; i++) sum += parseInt(s[i]) * WEIGHTS[i]
  return CHECK[sum % 11] === s[17]
}
