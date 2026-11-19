import { z } from 'zod'
import { route, WRITER_ROLES } from '@/server/handler'
import { parseJsonBody } from '@/server/validation'
import { sheetBatch, sheetDate, sheetText } from '@/server/sheet-input'
import { listEducation } from '@/server/education'
import { prisma } from '@/lib/prisma'
import { httpErrors, ok } from '@/server/http'
import { logOp } from '@/lib/audit'
const record=z.object({name:z.string().trim().min(1),certNo:z.string().trim().min(1), attended:z.enum(['已参加','未参加']),attendedDate:sheetDate,note:sheetText})
export const POST=route({roles:WRITER_ROLES},async ({req,accountId,session})=>{
  const {year,rows}=await parseJsonBody(req,sheetBatch.extend({year:z.number().int().min(2000).max(2100)}))
  const roster=await listEducation(accountId,year)
  const seen=new Set<number>()
  const operations=rows.map((row,i)=>{
    const line=Number(row._row)||i+2
    const parsed=record.safeParse(row)
    if(!parsed.success) throw httpErrors.badRequest(`第 ${line} 行：请核对姓名、证件编号、参加情况及日期`)
    const v=parsed.data
    const hits=roster.filter(item=>item.name===v.name && item.certNo===v.certNo)
    if(hits.length!==1 || seen.has(hits[0].certId)) throw httpErrors.badRequest(`第 ${line} 行：当年名单中无法唯一匹配证件或文件内重复登记`)
    const certId=hits[0].certId
    seen.add(certId)
    const data={attended:v.attended==='已参加',attendedDate:v.attended==='已参加'?v.attendedDate:null,note:v.note,updatedBy:session.displayName||session.username}
    return prisma.certEducation.upsert({where:{certId_year:{certId,year}},create:{accountId,certId,year,...data},update:data})
  })
  await prisma.$transaction(operations)
  await logOp(session,'继续教育登记',`${year}年度导入 ${seen.size} 条`,{year})
  return ok({imported:seen.size})
})
