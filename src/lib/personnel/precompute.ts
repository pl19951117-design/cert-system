// 预算缓存：people 变化时一次性算出 certStatus / age / dropdown 选项
// 设计要点：
// - "今天"由调用方注入，同一数据快照内绝对一致
// - 返回 Map 而非 array.find，命中 O(1)

import { certStatus, compareCertType, getAge } from '@/lib/cert-status'
import type { DropdownOptions, Person, PrecomputedMaps } from './types'

export function buildPrecomputedMaps(people: Person[], now: Date = new Date()): PrecomputedMaps {
  const certStatusMap: PrecomputedMaps['certStatusMap'] = new Map()
  const ageMap: PrecomputedMaps['ageMap'] = new Map()
  for (const p of people) {
    ageMap.set(p.id, getAge(p.idCard, p.birthYear))
    for (const c of p.certificates) {
      certStatusMap.set(c.id, certStatus(c.expiryDate, now))
    }
  }
  return { certStatusMap, ageMap }
}

export function buildDropdownOptions(people: Person[]): DropdownOptions {
  const o = new Set<string>()
  const m = new Set<string>()
  const e = new Set<string>()
  const s = new Set<string>()
  const t = new Set<string>()
  for (const p of people) {
    if (p.orgName)        o.add(p.orgName)
    if (p.manager)        m.add(p.manager)
    if (p.education)      e.add(p.education)
    if (p.socialSecurity) s.add(p.socialSecurity)
    for (const c of p.certificates) if (c.certType) t.add(c.certType)
  }
  return {
    orgs: Array.from(o),
    managers: Array.from(m),
    educations: Array.from(e),
    socials: Array.from(s),
    certTypes: Array.from(t).sort(compareCertType),
  }
}
