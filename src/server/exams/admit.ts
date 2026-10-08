// 考试「准入人员库」：把考试通过的人员登记进人员库（可同时生成证件），并回写报名记录的关联。
//
// 两种方式：
//   1) 新建人员：走 personnelService.create —— 按「建制 → 负责人」就近插入、记「入职」流水与审计
//   2) 关联已有人员（linkPersonId）：人员库里已经有这个人时，不重复建档，只把报名记录挂上去
// 生成证件走 certificateService.create —— 记证件历史、「证件新增」流水与审计。

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logOp } from '@/lib/audit'
import type { SessionUser } from '@/lib/auth'
import { canAdmit } from '@/lib/exam-stats'
import { HttpError, httpErrors } from '../http'
import { certCreateSchema, personCreateSchema } from '../personnel/schemas'
import { certificateService, personnelService } from '../personnel/service'

export const admitSchema = z.object({
  /** 新建人员时的资料（linkPersonId 存在时忽略） */
  person: personCreateSchema.optional(),
  /** 关联到人员库里已有的人 */
  linkPersonId: z.number().int().positive().optional(),
  /** 同时生成的证件；不传则只准入人员 */
  cert: certCreateSchema.nullable().optional(),
}).refine(v => v.person || v.linkPersonId, { message: '缺少人员资料' })
export type AdmitInput = z.infer<typeof admitSchema>

export type AdmitResult = { personId: number; certId: number | null; linked: boolean }

/** 证件信息是否填了任何一项（全空则不生成证件） */
function hasCertData(c: AdmitInput['cert']): c is NonNullable<AdmitInput['cert']> {
  return !!c && !!(c.certType || c.certNo || c.issueDate || c.expiryDate || c.issuer)
}

export async function admitExam(examId: number, input: AdmitInput, accountId: string, session: SessionUser): Promise<AdmitResult> {
  const exam = await prisma.exam.findFirst({ where: { id: examId, accountId } })
  if (!exam) throw httpErrors.notFound('报名记录不存在')
  if (exam.personId) throw httpErrors.conflict('该人员已在人员库中，无需重复准入')
  if (!canAdmit(exam)) throw httpErrors.badRequest('只有「已通过」或「已取证」的人员才能准入人员库')

  let personId: number
  let personName: string
  const linked = !!input.linkPersonId

  if (input.linkPersonId) {
    const p = await prisma.person.findFirst({
      where: { id: input.linkPersonId, accountId, deletedAt: null }, select: { id: true, name: true },
    })
    if (!p) throw httpErrors.notFound('要关联的人员不存在')
    personId = p.id
    personName = p.name
  } else {
    const person = input.person!
    // 身份证号重复 → 不新建，返回已有人员，由前端引导「关联到已有人员」
    if (person.idCard) {
      const dup = await prisma.person.findFirst({
        where: { accountId, deletedAt: null, idCard: person.idCard },
        select: { id: true, name: true, orgName: true, manager: true },
      })
      if (dup) {
        throw new HttpError(409, 'duplicate_id_card',
          `人员库中已有该身份证号：${dup.name}（${dup.orgName || '未填写建制'}）`, { existing: dup })
      }
    }
    const created = await personnelService.create(person, accountId, session)
    personId = created.id
    personName = created.name
  }

  let certId: number | null = null
  if (hasCertData(input.cert)) {
    const cert = await certificateService.create(personId, input.cert, accountId, session)
    certId = cert.id
  }

  await prisma.exam.update({
    where: { id: exam.id },
    data: {
      personId,
      // 已生成证件 → 标记已落地，避免之后改成「已取证」时重复生成
      ...(certId ? { certId, certLinked: true } : {}),
    },
  })
  await logOp(session, '考试准入', `${personName}(#${personId}) 报名#${exam.id}`, {
    linked, certId, examCertType: exam.certType, examStatus: exam.isPassed,
  })
  return { personId, certId, linked }
}
