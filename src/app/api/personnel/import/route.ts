import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logOp, recordChanges, type RecordChangeInput } from '@/lib/audit'
import { CHANGE_TYPES } from '@/lib/change-log-stats'
import { isValidIdCard } from '@/lib/idcard'
import { normalizeDate } from '@/lib/normalize-date'

function col(row: Record<string, string>, ...keys: string[]) {
  for (const k of keys) {
    const v = String(row[k] ?? '').trim()
    if (v) return v
  }
  return ''
}

type Mode = 'append' | 'update' | 'skip'

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })

  const body = await req.json()
  const rows: Record<string, string>[] = Array.isArray(body) ? body : (body.rows ?? [])
  const mode: Mode = Array.isArray(body) ? 'append' : (body.mode ?? 'append')
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '没有可导入的数据' }, { status: 400 })
  }

  let created = 0, updated = 0, appended = 0, skipped = 0, invalidId = 0, certsAdded = 0
  const errors: string[] = []
  const idCardMap = new Map<string, number>()
  // 缓冲变动流水，导入完成后批量写入（避免每行一次额外的 DB 写入）
  const changeBuffer: RecordChangeInput[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const name = col(row, '姓名', '名字', 'name')
    if (!name) { skipped++; continue }

    const idCard = col(row, '身份证号', '身份证', '身份证号码') || null
    if (idCard && !isValidIdCard(idCard)) invalidId++
    const sortOrder = i + 1

    const personData = {
      orgName: col(row, '归属建制', '建制', '部门', '组织') || null,
      manager: col(row, '负责人', '管理人', '主管') || null,
      birthYear: parseInt(col(row, '出生年份', '出生年')) || null,
      education: col(row, '学历', '文化程度') || null,
      socialSecurity: col(row, '社保情况', '社保号', '社保') || null,
    }

    try {
      let personId: number | null = null

      // 按身份证去重（同次导入内 + 数据库内）
      const cached = idCard ? idCardMap.get(idCard) : undefined
      let existing = cached ? { id: cached } : null
      if (idCard && !existing) {
        existing = await prisma.person.findFirst({ where: { accountId, idCard, deletedAt: null }, select: { id: true } })
      }

      if (existing) {
        if (mode === 'skip') { skipped++; if (idCard) idCardMap.set(idCard, existing.id); continue }
        personId = existing.id
        if (mode === 'update') {
          // 仅用非空字段覆盖
          const data: Record<string, unknown> = { name }
          if (personData.orgName) data.orgName = personData.orgName
          if (personData.manager) data.manager = personData.manager
          if (personData.birthYear) data.birthYear = personData.birthYear
          if (personData.education) data.education = personData.education
          if (personData.socialSecurity) data.socialSecurity = personData.socialSecurity
          await prisma.person.update({ where: { id: personId }, data })
          updated++
        } else {
          appended++
        }
      } else {
        const person = await prisma.person.create({
          data: { accountId, name, idCard, sortOrder, ...personData },
        })
        personId = person.id
        created++
        // 变动流水：「入职」
        changeBuffer.push({
          accountId, changeType: CHANGE_TYPES.PERSON_ADD,
          person: { orgName: personData.orgName, manager: personData.manager, name, idCard, education: personData.education, socialSecurity: personData.socialSecurity },
        })
      }
      if (idCard && personId) idCardMap.set(idCard, personId)

      const certType = col(row, '证件类别', '证件类型', '证书类别', '证书名称')
      if (certType && personId) {
        const expiry = normalizeDate(col(row, '到期日期', '有效期至', '过期日期'))
        const certNo = col(row, '证件编号', '证书编号', '编号') || null
        await prisma.certificate.create({
          data: {
            personId,
            certType,
            certNo,
            // 归一化日期：兼容 Excel 序列号 / 斜杠 / 点 / 中文年月日等格式
            issueDate: normalizeDate(col(row, '发证日期', '颁发日期')),
            expiryDate: expiry,
            issuer: col(row, '发证机构', '颁发机构', '发证单位') || null,
          },
        })
        certsAdded++
        // 变动流水：「证件新增」
        changeBuffer.push({
          accountId, changeType: CHANGE_TYPES.CERT_ADD,
          person: { orgName: personData.orgName, manager: personData.manager, name, idCard },
          cert: { certType, certNo, expiryDate: expiry },
        })
      }
    } catch (err) {
      skipped++
      errors.push(`第${i + 2}行 "${name}": ${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  await logOp(session, '导入人员', accountId, { mode, created, updated, appended, skipped, certsAdded, invalidId })
  await recordChanges(changeBuffer)
  return NextResponse.json({ created, updated, appended, skipped, invalidId, certsAdded, errors })
}
