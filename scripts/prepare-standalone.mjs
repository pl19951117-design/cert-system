// The standalone output does not include the `public` folder or the static
// chunks under `.next/static`. Copy them into `.next/standalone` so the bundled
// server can serve assets without a CDN.
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const standalone = path.join(root, '.next', 'standalone')

if (!fs.existsSync(standalone)) {
  throw new Error('找不到 .next/standalone，请先运行 next build')
}

const copies = [
  [path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static')],
  [path.join(root, 'public'), path.join(standalone, 'public')],
]

for (const [src, dest] of copies) {
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true })
    console.log('已复制 ' + path.relative(root, src) + ' -> ' + path.relative(root, dest))
  }
}

// 防御性清理：Next 文件追踪有时会把项目根的无关目录复制进 standalone（曾把 release/ 复制进来导致包体暴涨）。
for (const stray of ['release', 'backups', 'attachments', 'dist']) {
  const p = path.join(standalone, stray)
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true })
    console.log('已清理 standalone/' + stray)
  }
}

// 补全 Next 编译运行时：Turbopack 的 standalone 追踪会漏掉 app-route 等运行时文件，
// 打包后(无父级 node_modules)导致所有 /api 路由 500（登录显示"网络异常"）。
const nsSrc = path.join(root, 'node_modules', 'next', 'dist', 'compiled', 'next-server')
const nsDest = path.join(standalone, 'node_modules', 'next', 'dist', 'compiled', 'next-server')
if (fs.existsSync(nsSrc)) {
  fs.mkdirSync(nsDest, { recursive: true })
  let n = 0
  for (const f of fs.readdirSync(nsSrc)) {
    if (f.endsWith('.js')) { fs.copyFileSync(path.join(nsSrc, f), path.join(nsDest, f)); n++ }
  }
  console.log('已补全 next-server 运行时（' + n + ' 个文件）')
}

console.log('standalone 资源已就绪')
