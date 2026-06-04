// 人员证件领域服务 — 强制 accountId 作用域，集中审计日志
//
// 安全契约（重要）：
//   所有方法签名都带 accountId 参数。所有 prisma 查询都把 accountId 加入 WHERE。
//   这是防止跨账套 IDOR 的唯一保险，service 层做了 → route 层不可能漏。

import { prisma } from '@/lib/prisma'
import { diffFields, logOp, recordCertHistory, recordChange, recordChanges } from '@/lib/audit'
import { CHANGE_TYPES } from '@/lib/change-log-stats'
import type { SessionUser } from '@/lib/auth'
import { httpErrors } from '../http'
import { computeInsertIndex, planSortOrder } from './ordering'
import type {
  CertCreateInput,
  CertUpdateInput,
  PersonCreateInput,
  PersonUpdateInput,
} from './schemas'

const PERSON_AUDIT_FIELDS = ['name', 'orgName', 'manager', 'idCard', 'birthYear', 'education', 'socialSecurity', 'sortOrder']
const CERT_AUDIT_FIELDS   = ['certType', 'certNo', 'issueDate', 'expiryDate', 'issuer']

const changedBy = (s: SessionUser) => s.displayName || s.username

// ===== Person 查询 =====

/** 取人员（含活动证件）；不存在或跨账套都抛 404，避免 IDOR 信息泄露 */
async function findPersonScoped(personId: number, accountId: string) {
  const p = await prisma.person.findFirst({
    where: { id: personId, accountId, deletedAt: null },
    include: { certificates: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
  })
  if (!p) throw httpErrors.notFound('人员不存在')
  return p
}

/** 取证件 — 同步校验「证件 ∈ 人员 ∈ 账套」三层归属 */
async function findCertScoped(personId: number, certId: number, accountId: string) {
  const cert = await prisma.certificate.findFirst({
    where: {
      id: certId, personId, deletedAt: null,
      person: { accountId, deletedAt: null },
    },
  })
  if (!cert) throw httpErrors.notFound('证件不存在')
  return cert
}

// ===== Person 操作 =====

export const personnelService = {
  get(personId: number, accountId: string) {
    return findPersonScoped(personId, accountId)
  },

  async create(input: PersonCreateInput, accountId: string, session: SessionUser) {
    const person = await prisma.$transaction(async (tx) => {
      // 取当前展示顺序（与列表 API 完全一致：sortOrder 升序、null 垫底，再按 createdAt）
      const ordered = await tx.person.findMany({
        where: { accountId, deletedAt: null },
        orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        select: { id: true, orgName: true, manager: true, sortOrder: true },
      })

      // 目标下标：显式「排序」优先，否则按 建制→负责人 就近分组插入
      const insertIndex = input.sortOrder != null
        ? Math.min(Math.max(0, input.sortOrder - 1), ordered.length)
        : computeInsertIndex(ordered, input.orgName, input.manager)

      // 稠密重排（顺带修复历史遗留的 null sortOrder），只写有变化的行
      const { updates, newSortOrder } = planSortOrder(ordered, insertIndex)
      for (const u of updates) {
        await tx.person.update({ where: { id: u.id }, data: { sortOrder: u.sortOrder } })
      }

      return tx.person.create({
        data: {
          accountId,
          name: input.name,
          orgName: input.orgName ?? null,
          manager: input.manager ?? null,
          idCard: input.idCard ?? null,
          birthYear: input.birthYear ?? null,
          education: input.education ?? null,
          socialSecurity: input.socialSecurity ?? null,
          sortOrder: newSortOrder,
        },
      })
    })

    await logOp(session, '新增人员', `${person.name}(#${person.id})`, {
      after: {
        name: person.name, orgName: person.orgName, manager: person.manager,
        idCard: person.idCard, education: person.education, socialSecurity: person.socialSecurity,
      },
    })
    await recordChange({
      accountId, changeType: CHANGE_TYPES.PERSON_ADD,
      person: {
        orgName: person.orgName, manager: person.manager, name: person.name,
        idCard: person.idCard, education: person.education, socialSecurity: person.socialSecurity,
      },
    })
    return person
  },

  async update(personId: number, input: PersonUpdateInput, accountId: string, session: SessionUser) {
    const before = await findPersonScoped(personId, accountId)
    const updated = await prisma.person.update({
      where: { id: personId },
      data: {
        name:           input.name,
        orgName:        input.orgName ?? null,
        manager:        input.manager ?? null,
        idCard:         input.idCard ?? null,
        birthYear:      input.birthYear ?? null,
        education:      input.education ?? null,
        socialSecurity: input.socialSecurity ?? null,
        sortOrder:      input.sortOrder ?? null,
      },
    })
    const changes = diffFields(before as Record<string, unknown>, updated as Record<string, unknown>, PERSON_AUDIT_FIELDS)
    if (Object.keys(changes).length > 0) {
      await logOp(session, '修改人员', `${updated.name}(#${updated.id})`, { changes })
    }
    return updated
  },

  async softDelete(personId: number, accountId: string, session: SessionUser) {
    const person = await findPersonScoped(personId, accountId)
    await prisma.person.update({ where: { id: personId }, data: { deletedAt: new Date() } })
    await logOp(session, '删除人员', `${person.name}(#${person.id})`, { softDelete: true })

    // 变动流水：1 行「离职」 + 每张活动证件 1 行「证件注销」（这样按类型计数才准）
    const personSnap = {
      orgName: person.orgName, manager: person.manager, name: person.name,
      idCard: person.idCard, education: person.education, socialSecurity: person.socialSecurity,
    }
    await recordChanges([
      { accountId, changeType: CHANGE_TYPES.PERSON_REMOVE, person: personSnap },
      ...person.certificates.map(c => ({
        accountId,
        changeType: CHANGE_TYPES.CERT_REMOVE,
        person: personSnap,
        cert: { certType: c.certType, certNo: c.certNo, expiryDate: c.expiryDate },
      })),
    ])
  },
}

// ===== Cert 操作 =====

export const certificateService = {
  async create(personId: number, input: CertCreateInput, accountId: string, session: SessionUser) {
    // 必须先验证 person 归属
    const person = await findPersonScoped(personId, accountId)
    const cert = await prisma.certificate.create({
      data: {
        personId,
        certType:   input.certType ?? null,
        certNo:     input.certNo ?? null,
        issueDate:  input.issueDate ?? null,
        expiryDate: input.expiryDate ?? null,
        issuer:     input.issuer ?? null,
      },
    })
    await recordCertHistory(cert, '创建', { changedBy: changedBy(session) })
    await logOp(session, '新增证件', `${cert.certType || '证件'}(#${cert.id}) 人员#${personId}`, {
      after: { certType: cert.certType, certNo: cert.certNo, expiryDate: cert.expiryDate },
    })
    await recordChange({
      accountId, changeType: CHANGE_TYPES.CERT_ADD,
      person: { orgName: person.orgName, manager: person.manager, name: person.name, idCard: person.idCard },
      cert: { certType: cert.certType, certNo: cert.certNo, expiryDate: cert.expiryDate },
    })
    return cert
  },

  async update(personId: number, certId: number, input: CertUpdateInput, accountId: string, session: SessionUser) {
    const before = await findCertScoped(personId, certId, accountId)
    const updated = await prisma.certificate.update({
      where: { id: certId },
      data: {
        certType:   input.certType ?? null,
        certNo:     input.certNo ?? null,
        issueDate:  input.issueDate ?? null,
        expiryDate: input.expiryDate ?? null,
        issuer:     input.issuer ?? null,
      },
    })
    const changes = diffFields(before as Record<string, unknown>, updated as Record<string, unknown>, CERT_AUDIT_FIELDS)
    if (Object.keys(changes).length > 0) {
      await recordCertHistory(updated, '修改', { prevExpiry: before.expiryDate ?? null, changedBy: changedBy(session) })
      await logOp(session, '修改证件', `${updated.certType || '证件'}(#${updated.id})`, { changes })
      // 变动流水：「证件更新」，不计入 ±本 数
      const personInfo = await prisma.person.findUnique({
        where: { id: personId }, select: { orgName: true, manager: true, name: true, idCard: true },
      })
      await recordChange({
        accountId, changeType: CHANGE_TYPES.CERT_UPDATE,
        person: personInfo ?? undefined,
        cert: { certType: updated.certType, certNo: updated.certNo, expiryDate: updated.expiryDate },
      })
    }
    return updated
  },

  async softDelete(personId: number, certId: number, accountId: string, session: SessionUser) {
    const cert = await findCertScoped(personId, certId, accountId)
    await prisma.certificate.update({ where: { id: certId }, data: { deletedAt: new Date() } })
    await recordCertHistory(cert, '删除', { changedBy: changedBy(session) })
    await logOp(session, '删除证件', `${cert.certType || '证件'}(#${cert.id}) 人员#${personId}`, { softDelete: true })
    // 变动流水：「证件注销」，计 -1 本
    const personInfo = await prisma.person.findUnique({
      where: { id: personId }, select: { orgName: true, manager: true, name: true, idCard: true },
    })
    await recordChange({
      accountId, changeType: CHANGE_TYPES.CERT_REMOVE,
      person: personInfo ?? undefined,
      cert: { certType: cert.certType, certNo: cert.certNo, expiryDate: cert.expiryDate },
    })
  },

  async extend(personId: number, certId: number, accountId: string, session: SessionUser): Promise<{ expiryDate: string }> {
    const cert = await findCertScoped(personId, certId, accountId)
    if (!cert.expiryDate) throw httpErrors.unprocessable('该证件无到期日期，无法延期')
    const m = cert.expiryDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) throw httpErrors.unprocessable('到期日期格式错误，无法延期')
    const [, y, mo, d] = m
    const newExpiry = `${Number(y) + 3}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    const updated = await prisma.certificate.update({
      where: { id: certId },
      data: { expiryDate: newExpiry },
    })
    await recordCertHistory(updated, '续期', {
      prevExpiry: cert.expiryDate,
      changedBy: changedBy(session),
      note: `${cert.expiryDate} → ${newExpiry}`,
    })
    await logOp(session, '延期', `${cert.certType || '证件'}(#${cert.id}) 人员#${personId}`, {
      prev: cert.expiryDate, next: newExpiry,
    })
    return { expiryDate: newExpiry }
  },

  /** 批量延期当前人员所有证件 — 历史 API 保留 */
  async extendAll(personId: number, accountId: string, session: SessionUser): Promise<{ updated: number }> {
    await findPersonScoped(personId, accountId)
    const certs = await prisma.certificate.findMany({ where: { personId, deletedAt: null } })
    let updated = 0
    for (const cert of certs) {
      if (!cert.expiryDate) continue
      const m = cert.expiryDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
      if (!m) continue
      const [, y, mo, d] = m
      const newExpiry = `${Number(y) + 3}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
      const next = await prisma.certificate.update({ where: { id: cert.id }, data: { expiryDate: newExpiry } })
      await recordCertHistory(next, '续期', {
        prevExpiry: cert.expiryDate, changedBy: changedBy(session),
        note: `${cert.expiryDate} → ${newExpiry}`,
      })
      updated++
    }
    if (updated > 0) {
      await logOp(session, '批量延期', `人员#${personId}`, { updated, years: 3 })
    }
    return { updated }
  },
}
