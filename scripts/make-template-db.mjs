// Generates prisma/template.db: a fresh SQLite file with all tables created
// (schema applied via migrations) and no data. The Electron app copies this
// into the user's writable data directory on first launch. The default admin
// account is created lazily on first login, so no seed data is needed.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd())
const prismaDir = path.join(root, 'prisma')
const templatePath = path.join(root, 'prisma', 'template.db')

if (fs.lstatSync(prismaDir).isSymbolicLink()) throw new Error('模板目录不能是符号链接：' + prismaDir)
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  const target = path.resolve(templatePath + suffix)
  if (path.dirname(target) !== prismaDir || path.basename(target) !== 'template.db' + suffix) {
    throw new Error('模板清理路径校验失败：' + target)
  }
  if (fs.existsSync(target)) {
    if (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink()) {
      throw new Error('模板资源必须是普通文件：' + target)
    }
    fs.rmSync(target)
  }
}

// Prisma 5 resolves SQLite URLs relative to schema.prisma. Creating the empty
// file first avoids the Windows schema-engine failure for a missing database.
fs.writeFileSync(templatePath, '', { flag: 'wx' })
const url = 'file:./template.db'

execSync('npx prisma migrate deploy', {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, DATABASE_URL: url },
})

if (!fs.existsSync(templatePath)) {
  throw new Error('模板数据库生成失败：' + templatePath)
}

console.log('\n模板数据库已生成：' + templatePath)
