// 人员列表插入顺序的纯逻辑 —— 与持久化解耦，便于单测。
//
// 列表展示顺序由 sortOrder 决定（升序、null 垫底，再按 createdAt）。
// 新增人员时希望「就近插入到同组」，层级为：归属建制 → 负责人。

export type OrderedPerson = { orgName: string | null; manager: string | null }

/**
 * 计算新人员应插入到「当前展示顺序列表」中的下标（0..list.length）。
 *
 * 规则：
 *   1) 指定了建制：
 *        - 若组内已有「同建制 + 同负责人」→ 插到该负责人小组末尾；
 *        - 否则插到「同建制」组末尾（同建制不同负责人）；
 *        - 若该建制此前不存在 → 追加到末尾（新建制不被别处同名负责人“吸附”过去）。
 *   2) 未指定建制：退化为按负责人分组，插到「同负责人」末尾
 *        （适配建制留空、仅用负责人分组的数据）。
 *   3) 都无匹配 → 追加到末尾。
 *
 * 始终插到「最后一个同组成员」之后，从而对既有（可能分散的）顺序最小扰动。
 */
export function computeInsertIndex(
  list: readonly OrderedPerson[],
  orgName: string | null | undefined,
  manager: string | null | undefined,
): number {
  const org = (orgName ?? '').trim()
  const mgr = (manager ?? '').trim()

  let lastBoth = -1
  let lastOrg = -1
  let lastMgr = -1

  for (let i = 0; i < list.length; i++) {
    const o = (list[i].orgName ?? '').trim()
    const m = (list[i].manager ?? '').trim()
    const orgEq = org !== '' && o === org
    const mgrEq = mgr !== '' && m === mgr
    if (orgEq && mgrEq) lastBoth = i
    if (orgEq) lastOrg = i
    if (mgrEq) lastMgr = i
  }

  if (lastBoth >= 0) return lastBoth + 1
  if (lastOrg >= 0) return lastOrg + 1
  if (org === '' && lastMgr >= 0) return lastMgr + 1
  return list.length
}

/**
 * 一键归类：把「当前展示顺序」重排为 建制 → 负责人 分组。
 *
 * - 建制按「首次出现顺序」排列（不按拼音，避免打乱用户既有的建制习惯顺序）
 * - 同建制内的负责人同样按首次出现顺序
 * - 同「建制+负责人」小组内保持原有相对顺序
 * 因此对已经归好类的数据是幂等的（不会产生变化）。
 *
 * 返回按新顺序排列的 id 数组。
 */
export function planRegroup(
  list: readonly { id: number; orgName: string | null; manager: string | null }[],
): number[] {
  // Map 天然保留插入顺序 → 即「首次出现顺序」
  const byOrg = new Map<string, Map<string, number[]>>()
  for (const p of list) {
    const org = (p.orgName ?? '').trim()
    const mgr = (p.manager ?? '').trim()
    let mgrMap = byOrg.get(org)
    if (!mgrMap) { mgrMap = new Map(); byOrg.set(org, mgrMap) }
    const bucket = mgrMap.get(mgr)
    if (bucket) bucket.push(p.id)
    else mgrMap.set(mgr, [p.id])
  }
  const out: number[] = []
  for (const mgrMap of byOrg.values()) {
    for (const ids of mgrMap.values()) out.push(...ids)
  }
  return out
}

/**
 * 给「现有人员（按展示顺序）」做稠密重排，在 insertIndex 处为新人留出位置。
 * 返回需要写回的 { id, sortOrder } 列表（只含与当前值不同的行，最小化写入）
 * 以及新人员应使用的 sortOrder。
 */
export function planSortOrder(
  ordered: readonly { id: number; sortOrder: number | null }[],
  insertIndex: number,
): { updates: { id: number; sortOrder: number }[]; newSortOrder: number } {
  const updates: { id: number; sortOrder: number }[] = []
  let pos = 1
  for (let i = 0; i < ordered.length; i++) {
    if (i === insertIndex) pos++ // 跳过新人占用的位置
    if (ordered[i].sortOrder !== pos) {
      updates.push({ id: ordered[i].id, sortOrder: pos })
    }
    pos++
  }
  return { updates, newSortOrder: insertIndex + 1 }
}
