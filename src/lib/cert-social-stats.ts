// 证件 × 社保 聚合 —— 纯函数，便于单测。
//
// 用于总览看板：
//   1) 总证件数、其中持有人已缴纳社保的证件数、占比
//   2) 每种证件类型的同口径数据
//
// 「缴纳社保」的定义：持有人的 socialSecurity 字段去空白后**非空**，
// 且不是常见的「未缴纳」哨兵（如「未参保」「无」「未缴」「否」等）。
// 实际数据中通常以「缴纳单位名」（如「江安集团」「扬州分公司」）表示已缴纳，
// 以「无 / 未参保 / 未缴」之类表示未缴纳。
//
// 排序：按证件类型自然顺序（A < B < C1 < C2 < C3 < … 拼音+数字感知），
// 「未分类」永远排在最后。

import { compareCertType } from './cert-status'

export type CertWithSocial = {
  certType: string | null
  person: { socialSecurity: string | null }
}

export type CertSocialStats = {
  total: number
  paid: number
  /** 0–100，保留一位小数；total = 0 时为 0 */
  paidPct: number
  byType: TypeRow[]
}

export type TypeRow = {
  type: string
  total: number
  paid: number
  paidPct: number
}

const UNTYPED_LABEL = '未分类'

/**
 * 「未缴纳」哨兵集合（精确匹配，不做子串匹配，
 * 以免把「无锡分公司」这种合法单位名误判）。
 * 仅小写化生效于英文，中文 toLowerCase 是空操作，因此中文哨兵保持原样即可。
 */
const UNPAID_SENTINELS = new Set<string>([
  // 中文常见
  '无', '未参保', '未缴', '未缴纳', '未交', '未上', '没有', '否', '无社保',
  // 英文/数字常见
  '0', 'no', 'n', 'none', 'na', 'n/a',
])

/** 持有人是否已缴纳社保：非空且不是已知的「未缴纳」哨兵 */
export function isSocialPaid(socialSecurity: string | null | undefined): boolean {
  const v = (socialSecurity ?? '').trim().toLowerCase()
  return v !== '' && !UNPAID_SENTINELS.has(v)
}

function pct(part: number, whole: number): number {
  if (whole === 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

/**
 * 聚合证件与社保统计。
 * - 缺类型的证件归入「未分类」
 * - 类型按 `total` 降序、再按 `type` 升序，避免相同总数时顺序漂移
 */
export function computeCertSocialStats(certs: readonly CertWithSocial[]): CertSocialStats {
  let total = 0
  let paid = 0
  const byTypeMap = new Map<string, { total: number; paid: number }>()

  for (const c of certs) {
    const type = (c.certType ?? '').trim() || UNTYPED_LABEL
    const isPaid = isSocialPaid(c.person.socialSecurity)
    total++
    if (isPaid) paid++
    const row = byTypeMap.get(type) ?? { total: 0, paid: 0 }
    row.total++
    if (isPaid) row.paid++
    byTypeMap.set(type, row)
  }

  const byType: TypeRow[] = Array.from(byTypeMap, ([type, r]) => ({
    type,
    total: r.total,
    paid: r.paid,
    paidPct: pct(r.paid, r.total),
  })).sort((a, b) => {
    // 「未分类」永远沉底
    const aUntyped = a.type === UNTYPED_LABEL ? 1 : 0
    const bUntyped = b.type === UNTYPED_LABEL ? 1 : 0
    if (aUntyped !== bUntyped) return aUntyped - bUntyped
    // 其它按证件类别自然顺序：A < B < C1 < C2 < C3
    return compareCertType(a.type, b.type)
  })

  return { total, paid, paidPct: pct(paid, total), byType }
}
