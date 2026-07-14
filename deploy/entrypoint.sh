#!/bin/sh
set -e

DB=/data/cert-system.db
mkdir -p /data

# 首次启动：数据卷里还没有数据库 → 用空库模板初始化
# （已有数据库则原样使用；后续版本的新表/新列由应用启动时的 schema-guard 自动补齐）
if [ ! -f "$DB" ]; then
  echo "[entrypoint] 首次启动，初始化数据库 -> $DB"
  cp /app/template.db "$DB"
fi

echo "[entrypoint] 启动服务 (PORT=$PORT)"
exec node server.js
