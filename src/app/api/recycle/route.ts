import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, getAccountId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logOp } from '@/lib/audit'
import { attachmentFsPath } from '@/lib/attachments'
import { rmSync } from 'fs'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ persons: [], certs: [] })

  const [persons, certs] = await Promise.all([
    prisma.person.findMany({
      where: { accountId, deletedAt: { not: null } },
      select: { id: true, name: true, orgName: true, deletedAt: true },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.certificate.findMany({
      where: { deletedAt: { not: null }, person: { accountId, deletedAt: null } },
      select: { id: true, certType: true, certNo: true, expiryDate: true, deletedAt: true, person: { select: { id: true, name: true } } },
      orderBy: { deletedAt: 'desc' },
    }),
  ])
  return NextResponse.json({ persons, certs })
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role === 'viewer') return NextResponse.json({ error: '无权限' }, { status: 403 })
  const accountId = await getAccountId(req)
  if (!accountId) return NextResponse.json({ error: '未选择账套' }, { status: 400 })

  const { action, type, id } = await req.json().catch(() => ({}))
  if (!action || !type || !id) return NextResponse.json({ error: '参数不完整' }, { status: 400 })

  if (type === 'person') {
    const person = await prisma.person.findFirst({ where: { id: Number(id), accountId } })
    if (!person) return NextResponse.json({ error: '记录不存在' }, { status: 404 })

    if (action === 'restore') {
      await prisma.person.update({ where: { id: person.id }, data: { deletedAt: null } })
      await logOp(session, '恢复人员', `${person.name}(#${person.id})`)
    } else if (action === 'purge') {
      // 彻底删除：先删磁盘附件，再删人员（级联删除证件与附件记录）
      const atts = await prisma.attachment.findMany({ where: { personId: person.id }, select: { filePath: true } })
      for (const a of atts) if (a.filePath) { try { rmSync(attachmentFsPath(a.filePath), { force: true }) } catch { /* ignore */ } }
      await prisma.person.delete({ where: { id: person.id } })
      await logOp(session, '彻底删除人员', `${person.name}(#${person.id})`)
    } else {
      return NextResponse.json({ error: '未知操作' }, { status: 400 })
    }
  } else if (type === 'cert') {
    const cert = await prisma.certificate.findFirst({ where: { id: Number(id), person: { accountId } } })
    if (!cert) return NextResponse.json({ error: '记录不存在' }, { status: 404 })

    if (action === 'restore') {
      await prisma.certificate.update({ where: { id: cert.id }, data: { deletedAt: null } })
      await logOp(session, '恢复证件', `${cert.certType || '证件'}(#${cert.id})`)
    } else if (action === 'purge') {
      await prisma.certificate.delete({ where: { id: cert.id } })
      await logOp(session, '彻底删除证件', `${cert.certType || '证件'}(#${cert.id})`)
    } else {
      return NextResponse.json({ error: '未知操作' }, { status: 400 })
    }
  } else {
    return NextResponse.json({ error: '未知类型' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
