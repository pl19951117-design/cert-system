// 继续教育：名单派生、筛选、分组、统计、导出行 —— 纯函数，与 prisma / UI 解耦，便于单测。
//
// 口径：
//   - 「某年度名单」= 有效期落在该年度（YYYY-01-01 ~ YYYY-12-31）的证件，一本证件一行
//   - 已登记过该年度、但之后有效期被改掉（通常是办了延续）的证件，仍留在名单里，
//     标记 outOfYear，免得登记过的人在名单 / 导出里凭空消失
//   - 未登记 = 未参加
//   - 行顺序沿用人员库（建制 → 负责人 → 姓名的排序），同一人多本证件按类别 A < B < C1 …

import { compareCertType } from './cert-status'
import { groupKeyOf } from './personnel/grouping'

export type EduPerson = {
  id: number
  name: string
  orgName: string | null
  manager: string | null
  idCard: string | null
  certificates: { id: number; certType: string | null; certNo: string | null; expiryDate: string | null }[]
}

export type EduRecord = {
  certId: number
  attended: boolean
  attendedDate: string | null
  note: string | null
  updatedBy: string | null
  updatedAt: Date | string | null
}

export type EduRow = {
  personId: number
  name: string
  orgName: string | null
  manager: string | null
  idCard: string | null
  certId: number
  certType: string | null
  certNo: string | null
  expiryDate: string | null
  /** 有效期已不在本年度（登记后改了有效期，通常是已办理延续） */
  outOfYear: boolean
  attended: boolean
  attendedDate: string | null
  note: string | null
  updatedBy: string | null
}

/** 默认年度：下一整年 */
export function defaultEduYear(now: Date = new Date()): number {
  return now.getFullYear() + 1
}

/** 年度下拉：今年起往后 3 年 */
export function eduYearOptions(now: Date = new Date()): number[] {
  const y = now.getFullYear()
  return [y, y + 1, y + 2, y + 3]
}

export function buildEducationRows(
  people: readonly EduPerson[],
  records: readonly EduRecord[],
  year: number,
): EduRow[] {
  const prefix = `${year}-`
  const rec = new Map(records.map(r => [r.certId, r]))
  const rows: EduRow[] = []
  for (const p of people) {
    const certs = [...p.certificates].sort((a, b) => compareCertType(a.certType || '', b.certType || ''))
    for (const c of certs) {
      const inYear = !!c.expiryDate && c.expiryDate.startsWith(prefix)
      const r = rec.get(c.id)
      if (!inYear && !r) continue
      rows.push({
        personId: p.id, name: p.name, orgName: p.orgName, manager: p.manager, idCard: p.idCard,
        certId: c.id, certType: c.certType, certNo: c.certNo, expiryDate: c.expiryDate,
        outOfYear: !inYear,
        attended: r?.attended ?? false,
        attendedDate: r?.attendedDate ?? null,
        note: r?.note ?? null,
        updatedBy: r?.updatedBy ?? null,
      })
    }
  }
  return rows
}

export type EduFilter = {
  name: string
  org: string
  manager: string
  certType: string
  /** '' 全部 | 'attended' 已参加 | 'pending' 未参加 */
  status: '' | 'attended' | 'pending'
  /** '' 全部 | '01' ~ '12'，按有效期月份 */
  month: string
}

export const EMPTY_EDU_FILTER: EduFilter = { name: '', org: '', manager: '', certType: '', status: '', month: '' }

export function hasEduFilter(f: EduFilter): boolean {
  return !!(f.name || f.org || f.manager || f.certType || f.status || f.month)
}

export function filterEducationRows(rows: readonly EduRow[], f: EduFilter): EduRow[] {
  return rows.filter(r => {
    if (f.name && !r.name.includes(f.name)) return false
    if (f.org && !(r.orgName || '').includes(f.org)) return false
    if (f.manager && !(r.manager || '').includes(f.manager)) return false
    if (f.certType && (r.certType || '') !== f.certType) return false
    if (f.status === 'attended' && !r.attended) return false
    if (f.status === 'pending' && r.attended) return false
    // 有效期已改到别的年度的行，没有「本年度到期月份」可言，按月筛选时不显示
    if (f.month && (r.outOfYear || r.expiryDate?.slice(5, 7) !== f.month)) return false
    return true
  })
}

export type EduTypeStat = { type: string; total: number; attended: number }

export type EduStats = {
  certs: number
  people: number
  attended: number
  pending: number
  /** 0–100，一位小数 */
  attendedPct: number
  byType: EduTypeStat[]
}

const UNTYPED = '未分类'

export function computeEducationStats(rows: readonly EduRow[]): EduStats {
  const people = new Set<number>()
  const types = new Map<string, EduTypeStat>()
  let attended = 0
  for (const r of rows) {
    people.add(r.personId)
    if (r.attended) attended++
    const t = r.certType?.trim() || UNTYPED
    let s = types.get(t)
    if (!s) { s = { type: t, total: 0, attended: 0 }; types.set(t, s) }
    s.total++
    if (r.attended) s.attended++
  }
  const certs = rows.length
  return {
    certs, people: people.size, attended, pending: certs - attended,
    attendedPct: certs ? Math.round((attended / certs) * 1000) / 10 : 0,
    byType: Array.from(types.values()).sort((a, b) => {
      if (a.type === UNTYPED) return 1
      if (b.type === UNTYPED) return -1
      return compareCertType(a.type, b.type)
    }),
  }
}

export type EduGroup = {
  org: string
  rows: EduRow[]
  people: number
  attended: number
  pending: number
  managers: string[]
}

/** 按建制分组；组顺序 = 建制在名单里首次出现的位置（即人员库顺序） */
export function groupEducationRows(rows: readonly EduRow[]): EduGroup[] {
  const groups = new Map<string, EduGroup & { _p: Set<number> }>()
  for (const r of rows) {
    const key = groupKeyOf(r.orgName)
    let g = groups.get(key)
    if (!g) {
      g = { org: key, rows: [], people: 0, attended: 0, pending: 0, managers: [], _p: new Set() }
      groups.set(key, g)
    }
    g.rows.push(r)
    if (!g._p.has(r.personId)) { g._p.add(r.personId); g.people++ }
    const m = r.manager?.trim()
    if (m && !g.managers.includes(m)) g.managers.push(m)
    if (r.attended) g.attended++
    else g.pending++
  }
  return Array.from(groups.values(), ({ _p, ...g }) => { void _p; return g })
}

export type EduExportRow = Record<string, string | number>

/** Excel 名单行（与页面当前筛选一致） */
export function buildEducationExportRows(rows: readonly EduRow[]): EduExportRow[] {
  return rows.map((r, i) => ({
    '序号': i + 1,
    '归属建制': r.orgName || '',
    '负责人': r.manager || '',
    '姓名': r.name,
    '身份证号': r.idCard || '',
    '证件类别': r.certType || '',
    '证件编号': r.certNo || '',
    '有效期至': r.expiryDate || '',
    '继续教育': r.attended ? '已参加' : '未参加',
    '参加日期': r.attendedDate || '',
    '备注': [r.outOfYear ? '有效期已变更' : '', r.note || ''].filter(Boolean).join('；'),
  }))
}

/** Excel 汇总行：按证件类别 */
export function buildEducationSummaryRows(stats: EduStats): EduExportRow[] {
  const pct = (a: number, t: number) => (t ? `${(Math.round((a / t) * 1000) / 10).toFixed(1)}%` : '—')
  return [
    ...stats.byType.map(t => ({
      '证件类别': t.type, '应参加（本）': t.total, '已参加': t.attended, '未参加': t.total - t.attended, '完成率': pct(t.attended, t.total),
    })),
    { '证件类别': '合计', '应参加（本）': stats.certs, '已参加': stats.attended, '未参加': stats.pending, '完成率': pct(stats.attended, stats.certs) },
  ]
}
