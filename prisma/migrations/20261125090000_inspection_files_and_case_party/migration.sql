ALTER TABLE "SafetyReport" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'report';
ALTER TABLE "LegalCase" ADD COLUMN "party" TEXT;
