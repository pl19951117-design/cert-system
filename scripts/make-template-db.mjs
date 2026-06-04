// Generates prisma/template.db: a fresh SQLite file with all tables created
// (schema applied via migrations) and no data. The Electron app copies this
// into the user's writable data directory on first launch. The default admin
// account is created lazily on first login, so no seed data is needed.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const templatePath = path.join(root, 'prisma', 'template.db')

if (fs.existsSync(templatePath)) fs.rmSync(templatePath)

const url = 'file:' + templatePath.replace(/\\/g, '/')

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: url },
})

if (!fs.existsSync(templatePath)) {
  throw new Error('模板数据库生成失败：' + templatePath)
}

console.log('\n模板数据库已生成：' + templatePath)
