import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session || session.role !== 'super_admin') return null
  return session
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const accounts = await prisma.account.findMany({
    orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })
  return NextResponse.json(accounts)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, displayName } = await req.json()
  if (!id?.trim()) return NextResponse.json({ error: '账套ID不能为空' }, { status: 400 })
  try {
    const account = await prisma.account.create({ data: { id: id.trim(), displayName: displayName?.trim() || null } })
    return NextResponse.json(account)
  } catch {
    return NextResponse.json({ error: '账套ID已存在' }, { status: 400 })
  }
}
