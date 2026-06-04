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
  const types = await prisma.certType.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
  return NextResponse.json(types)
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { name, description } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: '证件类型名称不能为空' }, { status: 400 })
  try {
    const type = await prisma.certType.create({ data: { name: name.trim(), description: description?.trim() || null } })
    return NextResponse.json(type)
  } catch {
    return NextResponse.json({ error: '该证件类型已存在' }, { status: 400 })
  }
}
