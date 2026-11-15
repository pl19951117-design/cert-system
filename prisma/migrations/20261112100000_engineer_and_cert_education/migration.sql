-- 人员「工程师」字段
ALTER TABLE "Person" ADD COLUMN "engineer" TEXT;

-- 继续教育登记（一本证件每个到期年度一条）
CREATE TABLE "CertEducation" (
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
);
CREATE INDEX "CertEducation_accountId_year_idx" ON "CertEducation"("accountId", "year");
CREATE UNIQUE INDEX "CertEducation_certId_year_key" ON "CertEducation"("certId", "year");
