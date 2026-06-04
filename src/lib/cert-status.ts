import { differenceInDays, parseISO } from 'date-fns'

export type CertStatusKey = 'expired' | 'urgent' | 'warning' | 'ok' | 'none'

// now 可选注入：批量计算时传入同一个 Date 实例，避免重复分配 + 锚点漂移
export function certStatus(expiryDate: string | null, now: Date = new Date()): CertStatusKey {
  if (!expiryDate) return 'none'
  let days: number
  try {
    days = differenceInDays(parseISO(expiryDate), now)
  } catch {
    return 'none'
  }
  if (Number.isNaN(days)) return 'none'
  if (days < 0) return 'expired'
  if (days <= 30) return 'urgent'
  if (days <= 90) return 'warning'
  return 'ok'
}

export function worstStatus(certs: { expiryDate: string | null }[]): CertStatusKey {
  const priority: CertStatusKey[] = ['expired', 'urgent', 'warning', 'ok', 'none']
  const statuses = certs.length === 0 ? ['none'] : certs.map(c => certStatus(c.expiryDate))
  for (const p of priority) if (statuses.includes(p)) return p
  return 'none'
}

export function getAge(idCard: string | null, birthYear: number | null): number | null {
  const year = new Date().getFullYear()
  if (idCard && idCard.length === 18) {
    const y = parseInt(idCard.substring(6, 10))
    if (y > 1900 && y <= year) return year - y
  }
  if (birthYear && birthYear > 1900) return year - birthYear
  return null
}

export const statusLabel: Record<CertStatusKey, string> = {
  expired: '已过期', urgent: '紧急', warning: '预警', ok: '正常', none: '无证件',
}

// 中文按拼音首字母、英文按字母顺序，数字自然排序（C1 < C2 < C10）
// Collator 实例化代价较高（约 ms 级），cache 一次重复使用
const certTypeCollator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { numeric: true, sensitivity: 'base' })
export function compareCertType(a: string, b: string): number {
  return certTypeCollator.compare(a, b)
}
