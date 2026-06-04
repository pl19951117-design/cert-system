// 人员证件 API 客户端
// 设计说明：
// - 大多数方法走 apiFetch（401 跳转 + 服务端错误消息自动 toast）
// - 例外：`create` / `syncSocial` 用原生 fetch，因为对应的 modal 自己显示内联错误
//   不想让 apiFetch 多弹一个 toast

import { apiFetch, getJSON } from '@/lib/api'
import type { Person } from './types'

export type ImportRow = Record<string, string>
export type ImportMode = 'append' | 'update' | 'skip'

export type ImportSummary = {
  created: number; updated: number; appended: number; skipped: number; invalidId?: number
}

export type SyncSocialChange = {
  id: number
  name: string
  orgName: string | null
  manager: string | null
  idCard: string
  before: string         // 同步前的 socialSecurity（'' 表示原本没填）
  after: string          // 同步后的 socialSecurity
  setToUnpaid: boolean   // 是否因「不在清单中」而被置为「未参保」
}

export type SyncSocialResult = {
  totalPeople: number; matched: number; changed: number; setUnpaid: number
  skippedNoId: number; listCount: number; notInSystem: number
  /** 所有改动明细，按服务端遍历顺序（与 personnel 列表顺序一致） */
  changes: SyncSocialChange[]
}

const json = (data: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
}) as const

export const personnelApi = {
  list: () => getJSON<Person[]>('/api/personnel'),

  // 原生 fetch — modal 内联处理错误（避免与 apiFetch 的 toast 重复）
  create: (data: Record<string, string>) => fetch('/api/personnel', json(data)),
  syncSocial: (rows: ImportRow[]) => fetch('/api/personnel/sync-social', json(rows)),

  // apiFetch — 失败时自动 toast 服务端的错误消息
  update: (id: number, data: Record<string, string>) =>
    apiFetch(`/api/personnel/${id}`, { ...json(data), method: 'PUT' }),

  updateCert: (personId: number, certId: number | string, data: Record<string, string>) =>
    apiFetch(`/api/personnel/${personId}/certs/${certId}`, { ...json(data), method: 'PUT' }),

  remove: (id: number) =>
    apiFetch(`/api/personnel/${id}`, { method: 'DELETE' }),

  createCert: (personId: number, data: Record<string, string>) =>
    apiFetch(`/api/personnel/${personId}/certs`, json(data)),

  extendCert: (personId: number, certId: number) =>
    apiFetch(`/api/personnel/${personId}/certs/${certId}/extend`, { method: 'POST' }),

  deleteCert: (personId: number, certId: number) =>
    apiFetch(`/api/personnel/${personId}/certs/${certId}`, { method: 'DELETE' }),

  importBatch: (rows: ImportRow[], mode: ImportMode): Promise<ImportSummary> =>
    apiFetch('/api/personnel/import', json({ rows, mode })).then(r => r.json()),
}
