-- 续证闭环：考试关联到具体证件（续证目标）
ALTER TABLE "Exam" ADD COLUMN "certId" INTEGER;
