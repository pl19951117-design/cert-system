import { prisma } from '@/lib/prisma'

async function hasColumn(table: string, col: string): Promise<boolean> {
  const cols = await prisma.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info("${table}")`)
  return cols.some(c => c.name === col)
}

// 给现有 userData 库补软删除列与证件历史表（旧库不会自动跑迁移），幂等
export async function ensureSoftDeleteSchema(): Promise<void> {
  if (!(await hasColumn('Person', 'deletedAt')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "Person" ADD COLUMN "deletedAt" DATETIME`)
  if (!(await hasColumn('Certificate', 'deletedAt')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "Certificate" ADD COLUMN "deletedAt" DATETIME`)

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CertHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "certId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "certType" TEXT, "certNo" TEXT, "issueDate" TEXT, "expiryDate" TEXT, "issuer" TEXT,
    "prevExpiry" TEXT, "changedBy" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT
  )`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CertHistory_certId_idx" ON "CertHistory"("certId")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CertHistory_personId_idx" ON "CertHistory"("personId")`)

  if (!(await hasColumn('Exam', 'certId')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "Exam" ADD COLUMN "certId" INTEGER`)

  // Account.sortOrder：自定义账套显示顺序（NULL 退化为按 createdAt 排）
  if (!(await hasColumn('Account', 'sortOrder')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "Account" ADD COLUMN "sortOrder" INTEGER`)
}
