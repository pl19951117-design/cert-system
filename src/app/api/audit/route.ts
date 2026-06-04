import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'super_admin') return NextResponse.json({ error: '仅超级管理员可查看操作审计' }, { status: 403 })

  const logs = await prisma.opLog.findMany({
    orderBy: { id: 'desc' },
    take: 500,
  })
  return NextResponse.json(logs)
}
