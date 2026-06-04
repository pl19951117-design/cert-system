// 纯派生函数：people + filters + 预算缓存 → 表格 / 导出 / 统计要的所有视图数据
// ⚠️ 这是「表格 / 导出 / 统计」的唯一事实源：下游禁止再从 p.certificates 取数

import { compareCertType } from '@/lib/cert-status'
import type {
  Cert, CertStat, FilterState, FlatRow, Person, PrecomputedMaps,
} from './types'

export type PersonnelView = {
  filtered: Person[]
  flatRows: FlatRow[]
  certStats: CertStat[]
  totalCerts: number
}

export const EMPTY_FILTERS: FilterState = {
  org: '', manager: '', name: '', education: '', age: '',
  social: '', certTypes: [], certStatus: '',
}

export function hasAnyFilter(f: FilterState): boolean {
  return !!(
    f.org || f.manager || f.name || f.education || f.age ||
    f.social || f.certTypes.length || f.certStatus
  )
}

export function derivePersonnelView(
  people: Person[],
  f: FilterState,
  maps: PrecomputedMaps,
): PersonnelView {
  const certTypeSet = new Set(f.certTypes)
  const hasCertFilter = certTypeSet.size > 0 || !!f.certStatus
  // "无证件"占位行：只在没有任何证件级筛选 或 单独筛"无证件"状态时出现
  const showNoCertPlaceholder =
    certTypeSet.size === 0 && (!f.certStatus || f.certStatus === 'none')

  // 单一证件谓词（AND-within）：人员级预筛 + flatten 共用，保证语义一致
  const matchesCertFilters = (c: Cert): boolean => {
    if (certTypeSet.size && !(c.certType && certTypeSet.has(c.certType))) return false
    if (f.certStatus && maps.certStatusMap.get(c.id) !== f.certStatus) return false
    return true
  }

  const filtered: Person[] = []
  for (const p of people) {
    if (f.org       && !(p.orgName || '').includes(f.org))     continue
    if (f.manager   && !(p.manager || '').includes(f.manager)) continue
    if (f.name      && !p.name.includes(f.name))               continue
    if (f.education && p.education !== f.education)            continue
    if (f.age) {
      const age = maps.ageMap.get(p.id) ?? null
      if (age === null) continue
      if      (f.age === '30-'   && age > 30)               continue
      else if (f.age === '31-40' && (age < 31 || age > 40)) continue
      else if (f.age === '41-50' && (age < 41 || age > 50)) continue
      else if (f.age === '51-60' && (age < 51 || age > 60)) continue
      else if (f.age === '60+'   && age <= 60)              continue
    }
    if (f.social && p.socialSecurity !== f.social) continue
    if (hasCertFilter) {
      if (p.certificates.length === 0) {
        if (!showNoCertPlaceholder) continue
      } else if (!p.certificates.some(matchesCertFilters)) continue
    }
    filtered.push(p)
  }

  // flatten + stats 单趟完成
  const flatRows: FlatRow[] = []
  const statMap = new Map<string, CertStat>()
  let totalCerts = 0

  for (const p of filtered) {
    const certs = hasCertFilter ? p.certificates.filter(matchesCertFilters) : p.certificates
    if (certs.length === 0) {
      if (showNoCertPlaceholder) flatRows.push({ person: p, cert: null })
      continue
    }
    for (const c of certs) {
      flatRows.push({ person: p, cert: c })
      totalCerts++
      const type = c.certType?.trim() || '未分类'
      let s = statMap.get(type)
      if (!s) {
        s = { type, total: 0, ok: 0, warning: 0, urgent: 0, expired: 0, none: 0 }
        statMap.set(type, s)
      }
      s.total++
      const st = maps.certStatusMap.get(c.id) ?? 'none'
      if      (st === 'ok')      s.ok++
      else if (st === 'warning') s.warning++
      else if (st === 'urgent')  s.urgent++
      else if (st === 'expired') s.expired++
      else                       s.none++
    }
  }

  const certStats = Array.from(statMap.values())
    .sort((a, b) => compareCertType(a.type, b.type))
  return { filtered, flatRows, certStats, totalCerts }
}
