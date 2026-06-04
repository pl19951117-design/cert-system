import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const accountId = await getAccountId(req)
  const { id } = await params
  const r = await prisma.certRequirement.findUnique({ where: { id: Number(id) } })
  if (!r || r.accountId !== accountId) return NextResponse.json({ error: '记录不存在' }, { status: 404 })
  await prisma.certRequirement.delete({ where: { id: Number(id) } })
  return NextResponse.json({ ok: true })
}
