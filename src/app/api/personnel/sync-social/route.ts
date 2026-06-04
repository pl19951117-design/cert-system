import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logOp } from '@/lib/audit'

function col(row: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const v = String(row[k] ?? '').trim()
    if (v) return v
  }
  return ''
}

const UNPAID = '未参保'

// 用一份社保清单对当前账套做全量同步：
// - 人员在清单中 → 社保情况更新为清单里的值（清单值为空则记为「已参保」）
// - 人员不在清单中 → 社保情况设为「未参保」
// - 人员没有身份证 → 无法判断，跳过不动
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })

  const rows: Record<string, string>[] = await req.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '清单里没有数据' }, { status: 400 })
  }

  // 清单：身份证号 -> 社保情况
  const listMap = new Map<string, string>()
  for (const row of rows) {
    const idCard = col(row, '身份证号', '身份证', '身份证号码')
    if (!idCard) continue
    listMap.set(idCard, col(row, '社保情况', '社保', '社保号'))
  }
  if (listMap.size === 0) {
    return NextResponse.json({ error: '清单里没有有效的身份证号' }, { status: 400 })
  }

  const people = await prisma.person.findMany({
    where: { accountId, deletedAt: null },
    select: { id: true, idCard: true, socialSecurity: true, name: true, orgName: true, manager: true },
  })

  let matched = 0
  let changed = 0
  let setUnpaid = 0
  let skippedNoId = 0
  const sysIdCards = new Set<string>()
  // 明细：每条改动一行（before → after），用于前端弹窗的直观展示
  const changes: Array<{
    id: number; name: string; orgName: string | null; manager: string | null
    idCard: string; before: string; after: string; setToUnpaid: boolean
  }> = []

  for (const p of people) {
    const id = (p.idCard ?? '').trim()
    if (!id) { skippedNoId++; continue }
    sysIdCards.add(id)

    let newVal: string
    if (listMap.has(id)) {
      matched++
      newVal = listMap.get(id)!.trim() || '已参保'
    } else {
      newVal = UNPAID
    }

    const before = p.socialSecurity ?? ''
    if (newVal !== before) {
      await prisma.person.update({ where: { id: p.id }, data: { socialSecurity: newVal } })
      changed++
      const setToUnpaid = newVal === UNPAID
      if (setToUnpaid) setUnpaid++
      changes.push({
        id: p.id, name: p.name, orgName: p.orgName, manager: p.manager,
        idCard: id, before, after: newVal, setToUnpaid,
      })
    }
  }

  // 清单里有、但系统中没有的身份证（仅作提示，不新增人员）
  let notInSystem = 0
  for (const k of listMap.keys()) if (!sysIdCards.has(k)) notInSystem++

  await logOp(session, '社保同步', accountId, { matched, changed, setUnpaid })

  return NextResponse.json({
    totalPeople: people.length,
    matched,
    changed,
    setUnpaid,
    skippedNoId,
    listCount: listMap.size,
    notInSystem,
    changes,
  })
}
