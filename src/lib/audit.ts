import { prisma } from '@/lib/prisma'
import { todayYMD, type CHANGE_TYPES } from '@/lib/change-log-stats'

type Actor = { userId?: number | null; username?: string | null } | null

// 写操作审计日志（失败不影响主流程）
export async function logOp(actor: Actor, action: string, target: string, detail?: unknown): Promise<void> {
  try {
    await prisma.opLog.create({
      data: {
        userId: actor?.userId ?? null,
        username: actor?.username ?? null,
        action,
        target,
        detail: detail === undefined ? null : typeof detail === 'string' ? detail : JSON.stringify(detail),
      },
    })
  } catch (e) {
    console.error('[audit] 写入失败:', e)
  }
}

// 计算变更字段（仅含有变化的字段，便于审计前后值）
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const f of fields) {
    const b = before?.[f] ?? null
    const a = after?.[f] ?? null
    if (String(b ?? '') !== String(a ?? '')) changes[f] = { from: b, to: a }
  }
  return changes
}

type CertSnap = {
  id: number; personId: number
  certType?: string | null; certNo?: string | null
  issueDate?: string | null; expiryDate?: string | null; issuer?: string | null
}

// ============== 变动流水（ChangeLog） ==============
//
// 把人员/证件的「实物变动」事件记录到 ChangeLog，供变动流水页 + 总览看板
// 的「每月新增/减少」柱状图使用。每行 = 1 个事件。
// changeType 见 `CHANGE_TYPES`（lib/change-log-stats.ts）。

type ChangeTypeKey = typeof CHANGE_TYPES[keyof typeof CHANGE_TYPES]
type ChangeLogPersonSnap = {
  orgName?: string | null; manager?: string | null
  name?: string | null;    idCard?: string | null
  education?: string | null; socialSecurity?: string | null
}
type ChangeLogCertSnap = {
  certType?: string | null; certNo?: string | null; expiryDate?: string | null
}

export type RecordChangeInput = {
  accountId:  string
  changeType: ChangeTypeKey
  changeDate?: string            // 默认今天的 YYYY-MM-DD（本地时区）
  person?:    ChangeLogPersonSnap
  cert?:      ChangeLogCertSnap
}

/** 写一条变动流水（失败不影响主流程） */
export async function recordChange(input: RecordChangeInput): Promise<void> {
  try {
    await prisma.changeLog.create({
      data: {
        accountId:      input.accountId,
        changeType:     input.changeType,
        changeDate:     input.changeDate ?? todayYMD(),
        orgName:        input.person?.orgName ?? null,
        manager:        input.person?.manager ?? null,
        name:           input.person?.name ?? null,
        idCard:         input.person?.idCard ?? null,
        education:      input.person?.education ?? null,
        socialSecurity: input.person?.socialSecurity ?? null,
        certType:       input.cert?.certType ?? null,
        certNo:         input.cert?.certNo ?? null,
        expiryDate:     input.cert?.expiryDate ?? null,
      },
    })
  } catch (e) {
    console.error('[changeLog] 写入失败:', e)
  }
}

/** 批量写变动流水（失败回退为逐行写，保留尽量多的记录） */
export async function recordChanges(rows: RecordChangeInput[]): Promise<void> {
  if (rows.length === 0) return
  const today = todayYMD()
  const data = rows.map(input => ({
    accountId:      input.accountId,
    changeType:     input.changeType,
    changeDate:     input.changeDate ?? today,
    orgName:        input.person?.orgName ?? null,
    manager:        input.person?.manager ?? null,
    name:           input.person?.name ?? null,
    idCard:         input.person?.idCard ?? null,
    education:      input.person?.education ?? null,
    socialSecurity: input.person?.socialSecurity ?? null,
    certType:       input.cert?.certType ?? null,
    certNo:         input.cert?.certNo ?? null,
    expiryDate:     input.cert?.expiryDate ?? null,
  }))
  try {
    await prisma.changeLog.createMany({ data })
  } catch (e) {
    console.error('[changeLog] 批量写入失败，回退逐行:', e)
    for (const r of rows) await recordChange(r)
  }
}

// 记录证件历史（创建/续期/修改/删除/恢复）
export async function recordCertHistory(
  cert: CertSnap,
  action: string,
  opts?: { prevExpiry?: string | null; changedBy?: string | null; note?: string | null }
): Promise<void> {
  try {
    await prisma.certHistory.create({
      data: {
        certId: cert.id,
        personId: cert.personId,
        action,
        certType: cert.certType ?? null,
        certNo: cert.certNo ?? null,
        issueDate: cert.issueDate ?? null,
        expiryDate: cert.expiryDate ?? null,
        issuer: cert.issuer ?? null,
        prevExpiry: opts?.prevExpiry ?? null,
        changedBy: opts?.changedBy ?? null,
        note: opts?.note ?? null,
      },
    })
  } catch (e) {
    console.error('[certHistory] 写入失败:', e)
  }
}
