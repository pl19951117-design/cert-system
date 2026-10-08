// 考试报名统计 + 准入判定 —— 纯函数，便于单测。
//
// 口径：
//   - 「通过」= 已通过 + 已取证（已取证是通过后的下一步，也算通过）
//   - 通过率 = 通过 /（通过 + 未通过）；待考的还没出结果，不进分母
//   - 「待准入」= 已通过 / 已取证，但还没关联到人员库（personId 为空）
//   - 按证件类别分组，A < B < C1 < C2 < C3 自然顺序，「未分类」排最后

import { compareCertType } from './cert-status'

export const EXAM_STATUS = {
  PENDING: '待考',
  PASSED: '已通过',
  FAILED: '未通过',
  CERTIFIED: '已取证',
} as const

export type ExamLike = {
  isPassed: string | null
  certType: string | null
  personId: number | null
  regDate?: string | null
}

export type ExamTypeRow = {
  type: string
  total: number
  pending: number
  passed: number   // 含已取证
  failed: number
  passRate: number // 0–100，一位小数；无结果时为 0
}

export type ExamStats = {
  total: number
  pending: number
  passed: number      // 已通过（不含已取证）
  certified: number   // 已取证
  failed: number
  /** 通过（含已取证）/ 已出结果，0–100，一位小数 */
  passRate: number
  /** 已出结果的人次（通过 + 未通过） */
  decided: number
  /** 通过但还没进人员库 */
  pendingAdmission: number
  /** 指定年份（按报名日期）报名人次 */
  thisYear: number
  byType: ExamTypeRow[]
}

const UNTYPED_LABEL = '未分类'

function pct(part: number, whole: number): number {
  if (whole === 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

/** 是否考试通过（已通过 / 已取证） */
export function isExamPassed(status: string | null | undefined): boolean {
  return status === EXAM_STATUS.PASSED || status === EXAM_STATUS.CERTIFIED
}

/** 是否可以（也需要）准入人员库：通过了且还没关联人员 */
export function canAdmit(exam: Pick<ExamLike, 'isPassed' | 'personId'>): boolean {
  return isExamPassed(exam.isPassed) && !exam.personId
}

export function computeExamStats(
  exams: readonly ExamLike[],
  options: { year?: number } = {},
): ExamStats {
  const year = String(options.year ?? new Date().getFullYear())
  const s: ExamStats = {
    total: 0, pending: 0, passed: 0, certified: 0, failed: 0,
    passRate: 0, decided: 0, pendingAdmission: 0, thisYear: 0, byType: [],
  }
  const types = new Map<string, ExamTypeRow>()

  for (const e of exams) {
    s.total++
    const type = e.certType?.trim() || UNTYPED_LABEL
    let row = types.get(type)
    if (!row) {
      row = { type, total: 0, pending: 0, passed: 0, failed: 0, passRate: 0 }
      types.set(type, row)
    }
    row.total++

    switch (e.isPassed) {
      case EXAM_STATUS.PASSED:    s.passed++;    row.passed++;  break
      case EXAM_STATUS.CERTIFIED: s.certified++; row.passed++;  break
      case EXAM_STATUS.FAILED:    s.failed++;    row.failed++;  break
      default:                    s.pending++;   row.pending++; break   // 待考 / 空值
    }
    if (canAdmit(e)) s.pendingAdmission++
    if (e.regDate && e.regDate.startsWith(year)) s.thisYear++
  }

  const passedAll = s.passed + s.certified
  s.decided = passedAll + s.failed
  s.passRate = pct(passedAll, s.decided)

  s.byType = Array.from(types.values())
    .map(r => ({ ...r, passRate: pct(r.passed, r.passed + r.failed) }))
    .sort((a, b) => {
      if (a.type === UNTYPED_LABEL) return 1
      if (b.type === UNTYPED_LABEL) return -1
      return compareCertType(a.type, b.type)
    })
  return s
}
