// 人员表「按建制分组」视图的纯派生函数 —— 与 UI 解耦，便于单测。
//
// 口径：
//   - 分组键 = 归属建制（去首尾空格）；空值归入「未填写建制」
//   - 组的先后顺序 = 该建制在 flatRows 中第一次出现的位置（即沿用列表原有排序）
//   - 人数按人员去重；证件数只计真实证件行（不含「无证件」占位行）

import type { CertStatusKey } from '@/lib/cert-status'
import type { FlatRow, PrecomputedMaps } from './types'

export const UNGROUPED_ORG = '未填写建制'

export type OrgGroup = {
  org: string
  rows: FlatRow[]
  people: number
  certs: number
  expired: number
  urgent: number
  warning: number
  /** 该建制下的负责人（去重，保持出现顺序） */
  managers: string[]
}

export function groupKeyOf(orgName: string | null | undefined): string {
  return orgName?.trim() || UNGROUPED_ORG
}

export function groupRowsByOrg(
  rows: readonly FlatRow[],
  certStatusMap: PrecomputedMaps['certStatusMap'],
): OrgGroup[] {
  const groups = new Map<string, OrgGroup & { _people: Set<number>; _managers: Set<string> }>()

  for (const row of rows) {
    const key = groupKeyOf(row.person.orgName)
    let g = groups.get(key)
    if (!g) {
      g = {
        org: key, rows: [], people: 0, certs: 0, expired: 0, urgent: 0, warning: 0, managers: [],
        _people: new Set(), _managers: new Set(),
      }
      groups.set(key, g)
    }
    g.rows.push(row)
    if (!g._people.has(row.person.id)) {
      g._people.add(row.person.id)
      g.people++
    }
    const mgr = row.person.manager?.trim()
    if (mgr && !g._managers.has(mgr)) {
      g._managers.add(mgr)
      g.managers.push(mgr)
    }
    if (row.cert) {
      g.certs++
      const st: CertStatusKey = certStatusMap.get(row.cert.id) ?? 'none'
      if (st === 'expired') g.expired++
      else if (st === 'urgent') g.urgent++
      else if (st === 'warning') g.warning++
    }
  }

  return Array.from(groups.values(), ({ _people, _managers, ...g }) => {
    void _people; void _managers
    return g
  })
}
