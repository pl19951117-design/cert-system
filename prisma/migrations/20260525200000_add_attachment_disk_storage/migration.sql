-- 附件迁出数据库：新增磁盘存储相关列（纯追加，不动既有数据）
ALTER TABLE "Attachment" ADD COLUMN "filePath" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "Attachment" ADD COLUMN "mimeType" TEXT;
