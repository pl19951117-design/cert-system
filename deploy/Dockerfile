# 证件管理系统 —— 服务器部署镜像（多阶段构建）
# 构建上下文为仓库根目录：  docker build -f deploy/Dockerfile -t cert-system .

# ---------- 构建阶段 ----------
FROM node:20-slim AS builder
WORKDIR /app
# Prisma 查询引擎依赖 openssl
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# 先装依赖（利用层缓存）
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
# 在 Linux 里生成 Prisma 客户端 → 引擎即为 Linux 版
RUN npx prisma generate

# 再拷源码并构建
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build \
 && node scripts/prepare-standalone.mjs \
 && node scripts/make-template-db.mjs

# ---------- 运行阶段 ----------
FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 数据库与附件都放在 /data 数据卷；connection_limit=1 串行化写入，避免 SQLITE_BUSY
ENV DATABASE_URL="file:/data/cert-system.db?connection_limit=1"

# standalone 自带 server.js + 精简 node_modules + .next + public（已由 prepare-standalone 补全）
COPY --from=builder /app/.next/standalone ./
# 空库模板：首次启动时复制到数据卷
COPY --from=builder /app/prisma/template.db ./template.db
COPY deploy/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]
