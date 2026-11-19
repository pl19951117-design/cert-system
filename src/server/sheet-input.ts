import { z } from 'zod'
import { isoDateNullable, trimmedNullable } from './validation'
export const sheetBatch = z.object({ rows: z.array(z.record(z.string(),z.unknown())).min(1).max(1000) })
export const sheetText = trimmedNullable
export const sheetDate = isoDateNullable.refine(v => !v || (!Number.isNaN(Date.parse(v)) && new Date(v+'T00:00:00Z').toISOString().slice(0,10) === v), '日期不存在')
