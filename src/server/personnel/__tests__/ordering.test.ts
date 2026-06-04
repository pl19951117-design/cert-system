import { describe, expect, it } from 'vitest'
import { computeInsertIndex, planSortOrder, type OrderedPerson } from '../ordering'

const P = (orgName: string | null, manager: string | null): OrderedPerson => ({ orgName, manager })

describe('computeInsertIndex', () => {
  const list: OrderedPerson[] = [
    P('一连', '张队'),   // 0
    P('一连', '张队'),   // 1
    P('一连', '李队'),   // 2
    P('二连', '王队'),   // 3
    P('二连', '王队'),   // 4
  ]

  it('同建制+同负责人 → 插到该负责人小组末尾', () => {
    expect(computeInsertIndex(list, '一连', '张队')).toBe(2) // 在 index 1 之后
    expect(computeInsertIndex(list, '二连', '王队')).toBe(5)
  })

  it('同建制、负责人是新的 → 插到该建制末尾', () => {
    expect(computeInsertIndex(list, '一连', '新队')).toBe(3) // 一连最后一个(2)之后
  })

  it('全新建制 → 追加到末尾（不被别处同名负责人吸附）', () => {
    expect(computeInsertIndex(list, '三连', '张队')).toBe(5)
  })

  it('未指定建制 → 退化为按负责人分组', () => {
    const byMgr: OrderedPerson[] = [P(null, '甲'), P(null, '乙'), P(null, '甲'), P(null, '丙')]
    expect(computeInsertIndex(byMgr, null, '甲')).toBe(3) // 最后一个「甲」(index 2) 之后
    expect(computeInsertIndex(byMgr, '', '丁')).toBe(4)   // 无匹配 → 末尾
  })

  it('空列表 → 0', () => {
    expect(computeInsertIndex([], '一连', '张队')).toBe(0)
  })

  it('建制/负责人首尾空白与库内值一致化比较', () => {
    expect(computeInsertIndex(list, ' 一连 ', ' 张队 ')).toBe(2)
  })
})

describe('planSortOrder', () => {
  it('在中间插入 → 新人 sortOrder = idx+1，后续行整体后移', () => {
    const ordered = [
      { id: 10, sortOrder: 1 },
      { id: 11, sortOrder: 2 },
      { id: 12, sortOrder: 3 },
    ]
    const { updates, newSortOrder } = planSortOrder(ordered, 1) // 插到 index 1
    expect(newSortOrder).toBe(2)
    // id10 保持 1（无写入）；id11→3；id12→4
    expect(updates).toEqual([
      { id: 11, sortOrder: 3 },
      { id: 12, sortOrder: 4 },
    ])
  })

  it('追加到末尾 → 现有行不变，新人取末位', () => {
    const ordered = [
      { id: 10, sortOrder: 1 },
      { id: 11, sortOrder: 2 },
    ]
    const { updates, newSortOrder } = planSortOrder(ordered, 2)
    expect(newSortOrder).toBe(3)
    expect(updates).toEqual([])
  })

  it('修复历史遗留的 null sortOrder（稠密重排）', () => {
    const ordered = [
      { id: 1, sortOrder: 1 },
      { id: 2, sortOrder: null },
      { id: 3, sortOrder: null },
    ]
    // 追加到末尾：id1 已是 1（跳过），id2→2，id3→3，新人→4
    const { updates, newSortOrder } = planSortOrder(ordered, 3)
    expect(newSortOrder).toBe(4)
    expect(updates).toEqual([
      { id: 2, sortOrder: 2 },
      { id: 3, sortOrder: 3 },
    ])
  })

  it('插到最前 → 所有现有行后移一位', () => {
    const ordered = [
      { id: 10, sortOrder: 1 },
      { id: 11, sortOrder: 2 },
    ]
    const { updates, newSortOrder } = planSortOrder(ordered, 0)
    expect(newSortOrder).toBe(1)
    expect(updates).toEqual([
      { id: 10, sortOrder: 2 },
      { id: 11, sortOrder: 3 },
    ])
  })
})
