import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { differenceInDays, parseISO } from 'date-fns'

function isValid(expiry: string | null): boolean {
  if (!expiry) return false
  try { return differenceInDays(parseISO(expiry), new Date()) >= 0 } catch { return false }
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ requirements: [], summary: null, byOrg: [], nonCompliant: [] })

  const [reqs, people] = await Promise.all([
    prisma.certRequirement.findMany({ where: { accountId } }),
    prisma.person.findMany({
      where: { accountId, deletedAt: null },
      include: { certificates: { where: { deletedAt: null } } },
    }),
  ])

  const globalReq = new Set(reqs.filter(r => !r.orgName).map(r => r.certType))
  const orgReq = new Map<string, Set<string>>()
  for (const r of reqs) {
    if (r.orgName) {
      if (!orgReq.has(r.orgName)) orgReq.set(r.orgName, new Set())
      orgReq.get(r.orgName)!.add(r.certType)
    }
  }

  type Row = { personId: number; name: string; orgName: string | null; missing: string[]; expired: string[] }
  const nonCompliant: Row[] = []
  const orgStat = new Map<string, { total: number; compliant: number }>()
  let totalWithReq = 0
  let compliantCount = 0

  for (const p of people) {
    const required = new Set<string>(globalReq)
    if (p.orgName && orgReq.has(p.orgName)) for (const t of orgReq.get(p.orgName)!) required.add(t)
    if (required.size === 0) continue
    totalWithReq++

    const missing: string[] = []
    const expired: string[] = []
    for (const type of required) {
      const certsOfType = p.certificates.filter(c => (c.certType?.trim() || '') === type)
      if (certsOfType.length === 0) missing.push(type)
      else if (!certsOfType.some(c => isValid(c.expiryDate))) expired.push(type)
    }

    const ok = missing.length === 0 && expired.length === 0
    if (ok) compliantCount++
    else nonCompliant.push({ personId: p.id, name: p.name, orgName: p.orgName, missing, expired })

    const orgKey = p.orgName || '未分配建制'
    if (!orgStat.has(orgKey)) orgStat.set(orgKey, { total: 0, compliant: 0 })
    const s = orgStat.get(orgKey)!
    s.total++
    if (ok) s.compliant++
  }

  const byOrg = Array.from(orgStat, ([orgName, s]) => ({
    orgName,
    total: s.total,
    compliant: s.compliant,
    rate: s.total ? Math.round((s.compliant / s.total) * 100) : 0,
  })).sort((a, b) => a.rate - b.rate)

  nonCompliant.sort((a, b) => (b.missing.length + b.expired.length) - (a.missing.length + a.expired.length))

  return NextResponse.json({
    requirements: reqs,
    summary: {
      totalPeople: people.length,
      totalWithReq,
      compliant: compliantCount,
      rate: totalWithReq ? Math.round((compliantCount / totalWithReq) * 100) : 0,
    },
    byOrg,
    nonCompliant,
  })
}
