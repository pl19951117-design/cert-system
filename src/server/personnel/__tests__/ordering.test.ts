import { describe, expect, it } from 'vitest'
import { computeInsertIndex, planRegroup, planSortOrder, type OrderedPerson } from '../ordering'

const P = (orgName: string | null, manager: string | null): OrderedPerson => ({ orgName, manager })
const R = (id: number, orgName: string | null, manager: string | null) => ({ id, orgName, manager })

describe('planRegroup', () => {
  it('把散落的同建制+同负责人聚到一起', () => {
    const ids = planRegroup([
      R(1, '一连', '张队'),
      R(2, '二连', '王队'),
      R(3, '一连', '张队'),   // 与 1 同组，应被拉到 1 后面
      R(4, '二连', '王队'),
      R(5, '一连', '李队'),   // 一连的另一负责人
    ])
    expect(ids).toEqual([1, 3, 5, 2, 4])
  })

  it('建制与负责人按首次出现顺序（不按拼音重排）', () => {
    const ids = planRegroup([
      R(1, '乙连', '钱队'),
      R(2, '甲连', '孙队'),
      R(3, '乙连', '钱队'),
    ])
    // 乙连先出现 → 排在甲连前面
    expect(ids).toEqual([1, 3, 2])
  })

  it('对已归好类的数据是幂等的', () => {
    const list = [R(1, '一连', '张队'), R(2, '一连', '张队'), R(3, '二连', '王队')]
    expect(planRegroup(list)).toEqual([1, 2, 3])
    expect(planRegroup(list)).toEqual(planRegroup(list))
  })

  it('空建制/空负责人也各自成组，不报错', () => {
    const ids = planRegroup([
      R(1, null, null),
      R(2, '一连', '张队'),
      R(3, '', ''),          // 与 1 同为「空/空」
    ])
    expect(ids).toEqual([1, 3, 2])
  })

  it('组内保持原有相对顺序', () => {
    const ids = planRegroup([
      R(10, 'A', 'm'), R(20, 'B', 'n'), R(30, 'A', 'm'), R(40, 'A', 'm'),
    ])
    expect(ids).toEqual([10, 30, 40, 20])
  })
})

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
