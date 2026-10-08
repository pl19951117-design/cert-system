import { prisma } from '@/lib/prisma'
import { recordCertHistory, recordChange, logOp } from '@/lib/audit'
import { CHANGE_TYPES } from '@/lib/change-log-stats'
import type { SessionUser } from '@/lib/auth'

/** 变动流水用的持有人快照 */
async function personSnap(personId: number) {
  return prisma.person.findUnique({
    where: { id: personId },
    select: { orgName: true, manager: true, name: true, idCard: true },
  })
}

// 考试状态变为「已取证」且尚未生成证件时：
// - 关联了具体证件(certId) → 续证更新该证件
// - 仅关联人员(personId) → 新建证件
// 落地后标记 exam.certLinked = true，避免重复生成
export async function applyExamToCert(examId: number, actor: SessionUser | null): Promise<void> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } })
  if (!exam || exam.isPassed !== '已取证' || exam.certLinked || !exam.personId) return
  const by = actor?.displayName || actor?.username || null

  if (exam.certId) {
    const before = await prisma.certificate.findUnique({ where: { id: exam.certId } })
    if (!before || before.deletedAt) return
    const cert = await prisma.certificate.update({
      where: { id: exam.certId },
      data: {
        certType: exam.certType || before.certType,
        certNo: exam.certNo || before.certNo,
        issueDate: exam.issueDate || before.issueDate,
        expiryDate: exam.expiryDate || before.expiryDate,
        issuer: exam.issuer || before.issuer,
      },
    })
    await recordCertHistory(cert, '换证', { prevExpiry: before.expiryDate, changedBy: by, note: '考试取证更新' })
    await prisma.exam.update({ where: { id: exam.id }, data: { certLinked: true } })
    await logOp(actor, '考试取证(续证)', `证件#${cert.id} 人员#${exam.personId}`, { examId: exam.id, expiry: cert.expiryDate })
    // 变动流水：续证属于「证件更新」，不计入 ±本 数
    await recordChange({
      accountId: exam.accountId, changeType: CHANGE_TYPES.CERT_UPDATE,
      person: (await personSnap(exam.personId)) ?? undefined,
      cert: { certType: cert.certType, certNo: cert.certNo, expiryDate: cert.expiryDate },
    })
  } else {
    const cert = await prisma.certificate.create({
      data: {
        personId: exam.personId,
        certType: exam.certType || null,
        certNo: exam.certNo || null,
        issueDate: exam.issueDate || null,
        expiryDate: exam.expiryDate || null,
        issuer: exam.issuer || null,
      },
    })
    await recordCertHistory(cert, '创建', { changedBy: by, note: '考试取证生成' })
    await prisma.exam.update({ where: { id: exam.id }, data: { certLinked: true, certId: cert.id } })
    await logOp(actor, '考试取证(新证)', `证件#${cert.id} 人员#${exam.personId}`, { examId: exam.id, expiry: cert.expiryDate })
    // 变动流水：新证计「证件新增」，看板按月统计才不会漏
    await recordChange({
      accountId: exam.accountId, changeType: CHANGE_TYPES.CERT_ADD,
      person: (await personSnap(exam.personId)) ?? undefined,
      cert: { certType: cert.certType, certNo: cert.certNo, expiryDate: cert.expiryDate },
    })
  }
}
