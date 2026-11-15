CREATE TABLE IF NOT EXISTS "SafetyInspection" (
 "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "accountId" TEXT NOT NULL,
 "orgName" TEXT, "manager" TEXT, "projectName" TEXT NOT NULL, "amount" TEXT,
 "inspectionDate" TEXT, "rectification" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SafetyInspection_accountId_idx" ON "SafetyInspection"("accountId");
CREATE TABLE IF NOT EXISTS "SafetyReport" (
 "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "inspectionId" INTEGER NOT NULL,
 "fileName" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "fileSize" INTEGER NOT NULL, "fileData" BLOB NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("inspectionId") REFERENCES "SafetyInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SafetyReport_inspectionId_idx" ON "SafetyReport"("inspectionId");
CREATE TABLE IF NOT EXISTS "LegalCase" (
 "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "accountId" TEXT NOT NULL,
 "orgName" TEXT, "manager" TEXT, "caseNo" TEXT NOT NULL, "caseType" TEXT, "amount" TEXT,
 "hearingDate" TEXT, "result" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LegalCase_accountId_idx" ON "LegalCase"("accountId");
