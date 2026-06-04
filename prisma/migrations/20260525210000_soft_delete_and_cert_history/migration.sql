-- 软删除 + 证件历史（纯追加，不动既有数据）
ALTER TABLE "Person" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Certificate" ADD COLUMN "deletedAt" DATETIME;

CREATE TABLE "CertHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "certId" INTEGER NOT NULL,
    "personId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "certType" TEXT,
    "certNo" TEXT,
    "issueDate" TEXT,
    "expiryDate" TEXT,
    "issuer" TEXT,
    "prevExpiry" TEXT,
    "changedBy" TEXT,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT
);
CREATE INDEX "CertHistory_certId_idx" ON "CertHistory"("certId");
CREATE INDEX "CertHistory_personId_idx" ON "CertHistory"("personId");
