// ChangeLog（变动流水）的纯聚合函数 —— 与 prisma / UI 解耦，便于单测。
//
// 业务口径：
//   - 「新增」= changeType === '证件新增'，每行计 +1 本
//   - 「减少」= changeType === '证件注销'，每行计 +1 本（指被减少）
//   - 入职/离职/证件更新 不计入「本」数（属于纯人员事件 / 信息变更）
//   - 缺类型的证件归入「未分类」

export const CHANGE_TYPES = {
  PERSON_ADD:    '入职',
  PERSON_REMOVE: '离职',
  CERT_ADD:      '证件新增',
  CERT_UPDATE:   '证件更新',
  CERT_REMOVE:   '证件注销',
} as const

export type ChangeLogRow = {
  changeType: string | null
  certType:   string | null
  changeDate: string | null   // 'YYYY-MM-DD'
}

export type TypeStat = { type: string; added: number; removed: number }

export type ChangeStats = {
  added:   number
  removed: number
  byType:  TypeStat[]
}

export type MonthlyPoint = { month: string; added: number; removed: number }

const UNTYPED_LABEL = '未分类'

/** 聚合「新增 / 减少」总数与按类型分布 */
export function computeChangeStats(rows: readonly ChangeLogRow[]): ChangeStats {
  let added = 0, removed = 0
  const map = new Map<string, { added: number; removed: number }>()

  for (const r of rows) {
    const isAdd = r.changeType === CHANGE_TYPES.CERT_ADD
    const isRem = r.changeType === CHANGE_TYPES.CERT_REMOVE
    if (!isAdd && !isRem) continue
    const type = (r.certType ?? '').trim() || UNTYPED_LABEL
    const cur = map.get(type) ?? { added: 0, removed: 0 }
    if (isAdd) { added++; cur.added++ }
    else       { removed++; cur.removed++ }
    map.set(type, cur)
  }

  const byType: TypeStat[] = Array.from(map, ([type, v]) => ({ type, ...v }))
    .sort((a, b) =>
      (b.added + b.removed) - (a.added + a.removed) ||
      a.type.localeCompare(b.type, 'zh-Hans-CN'))

  return { added, removed, byType }
}

/**
 * 按月聚合最近 N 个月（含当月）的新增/减少。
 * - 输出顺序：从旧到新（左侧最早）
 * - 缺 changeDate 或非合法 'YYYY-MM-DD' 的行被忽略
 * - 仅统计 证件新增 / 证件注销
 */
export function computeMonthlyChange(
  rows: readonly ChangeLogRow[],
  options: { now?: Date; months?: number } = {},
): MonthlyPoint[] {
  const months = options.months ?? 12
  const now = options.now ?? new Date()

  // 生成最近 N 个月（含当月）的 YYYY-MM 键（从旧到新）
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const idx = new Map(keys.map((k, i) => [k, i]))
  const out: MonthlyPoint[] = keys.map(m => ({ month: m, added: 0, removed: 0 }))

  for (const r of rows) {
    const isAdd = r.changeType === CHANGE_TYPES.CERT_ADD
    const isRem = r.changeType === CHANGE_TYPES.CERT_REMOVE
    if (!isAdd && !isRem) continue
    if (!r.changeDate || !/^\d{4}-\d{2}-\d{2}$/.test(r.changeDate)) continue
    const key = r.changeDate.slice(0, 7)
    const i = idx.get(key)
    if (i === undefined) continue
    if (isAdd) out[i].added++
    else       out[i].removed++
  }
  return out
}

/** YYYY-MM-DD 的本地日期，用于 changeDate 字段（与「今天」语义一致） */
export function todayYMD(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
