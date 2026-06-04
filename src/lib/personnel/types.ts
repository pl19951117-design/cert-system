// 人员证件管理领域类型 — 纯类型，无运行时依赖

import type { CertStatusKey } from '@/lib/cert-status'

export type Cert = {
  id: number
  certType: string | null
  certNo: string | null
  issueDate: string | null
  expiryDate: string | null
  issuer: string | null
}

export type Person = {
  id: number
  name: string
  orgName: string | null
  manager: string | null
  idCard: string | null
  birthYear: number | null
  education: string | null
  socialSecurity: string | null
  sortOrder: number | null
  certificates: Cert[]
}

/** 筛选状态（与 UI state 一一对应）*/
export type FilterState = {
  org: string
  manager: string
  name: string
  education: string
  age: string          // '' | '30-' | '31-40' | '41-50' | '51-60' | '60+'
  social: string
  certTypes: string[]
  certStatus: string   // '' | CertStatusKey
}

/** 表格 / 导出 / 统计共用的行模型 — cert=null 表示"无证件占位行" */
export type FlatRow = { person: Person; cert: Cert | null }

export type CertStat = {
  type: string
  total: number
  ok: number
  warning: number
  urgent: number
  expired: number
  none: number
}

export type DropdownOptions = {
  orgs: string[]
  managers: string[]
  educations: string[]
  socials: string[]
  certTypes: string[]
}

export type PrecomputedMaps = {
  certStatusMap: Map<number, CertStatusKey>
  ageMap: Map<number, number | null>
}
