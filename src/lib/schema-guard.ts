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
  // Exam.idCard：报名时记录身份证号，「准入人员库」时直接带入（v0.7.0 新增）
  if (!(await hasColumn('Exam', 'idCard')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "Exam" ADD COLUMN "idCard" TEXT`)

  // Account.sortOrder：自定义账套显示顺序（NULL 退化为按 createdAt 排）
  if (!(await hasColumn('Account', 'sortOrder')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "Account" ADD COLUMN "sortOrder" INTEGER`)

  // 转入/转出登记表（v0.2.0 新增）
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TransferPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "idCard" TEXT, "orgName" TEXT, "manager" TEXT, "certTypes" TEXT,
    "plannedDate" TEXT, "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "personId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
  )`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TransferPlan_accountId_status_idx" ON "TransferPlan"("accountId", "status")`)

  // v0.8.0：人员「工程师」字段 + 继续教育登记表
  if (!(await hasColumn('Person', 'engineer')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "Person" ADD COLUMN "engineer" TEXT`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CertEducation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountId" TEXT NOT NULL,
    "certId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "attendedDate" TEXT,
    "note" TEXT,
    "updatedBy" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CertEducation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CertEducation_certId_fkey" FOREIGN KEY ("certId") REFERENCES "Certificate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CertEducation_accountId_year_idx" ON "CertEducation"("accountId", "year")`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "CertEducation_certId_year_key" ON "CertEducation"("certId", "year")`)

  // Upgrade existing desktop databases without replacing their data.
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SafetyInspection" (
 "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "accountId" TEXT NOT NULL,
 "orgName" TEXT, "manager" TEXT, "projectName" TEXT NOT NULL, "amount" TEXT,
 "inspectionDate" TEXT, "rectification" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SafetyInspection_accountId_idx" ON "SafetyInspection"("accountId")`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SafetyReport" (
 "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "inspectionId" INTEGER NOT NULL,
 "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "fileSize" INTEGER NOT NULL, "fileData" BLOB NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("inspectionId") REFERENCES "SafetyInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SafetyReport_inspectionId_idx" ON "SafetyReport"("inspectionId")`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "LegalCase" (
 "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "accountId" TEXT NOT NULL,
 "orgName" TEXT, "manager" TEXT, "caseNo" TEXT NOT NULL, "caseType" TEXT, "amount" TEXT,
 "hearingDate" TEXT, "result" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
)`)
  if (!(await hasColumn('SafetyReport', 'category')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "SafetyReport" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'report'`)
  if (!(await hasColumn('LegalCase', 'party')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "LegalCase" ADD COLUMN "party" TEXT`)
  if (!(await hasColumn('LegalCase', 'businessCategory')))
    await prisma.$executeRawUnsafe(`ALTER TABLE "LegalCase" ADD COLUMN "businessCategory" TEXT`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "LegalCase_accountId_idx" ON "LegalCase"("accountId")`)
}
