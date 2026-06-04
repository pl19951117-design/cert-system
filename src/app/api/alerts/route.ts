import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json([])

  const certs = await prisma.certificate.findMany({
    where: { deletedAt: null, person: { accountId, deletedAt: null } },
    include: { person: { select: { name: true, orgName: true, manager: true } } },
    orderBy: { expiryDate: 'asc' },
  })
  return NextResponse.json(certs)
}
