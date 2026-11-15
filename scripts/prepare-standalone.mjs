// The standalone output does not include the `public` folder or the static
// chunks under `.next/static`. Copy them into `.next/standalone` so the bundled
// server can serve assets without a CDN.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd())
const standalone = path.join(root, '.next', 'standalone')

if (!fs.existsSync(standalone)) {
  throw new Error('找不到 .next/standalone，请先运行 next build')
}

// Never clean or copy through a junction into an unrelated directory.
for (const dir of [path.join(root, '.next'), standalone]) {
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error('打包目录不能是符号链接：' + dir)
}

function assertBundlePath(target, allowLeafLink = false) {
  const resolved = path.resolve(target)
  const relative = path.relative(standalone, resolved)
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('路径超出 standalone，停止整理：' + resolved)
  }
  for (let current = resolved; current !== standalone; current = path.dirname(current)) {
    if (allowLeafLink && current === resolved) continue
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error('打包路径包含符号链接，停止整理：' + current)
    }
  }
  return resolved
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

// Inspect links themselves rather than descending through a Windows junction.
function findBundleLinks(directory) {
  const links = []
  for (const name of fs.readdirSync(directory)) {
    const target = path.join(directory, name)
    const stat = fs.lstatSync(target)
    if (stat.isSymbolicLink()) links.push(target)
    else if (stat.isDirectory()) links.push(...findBundleLinks(target))
  }
  return links
}

function materializeRuntimeLinks() {
  const localModules = path.join(root, 'node_modules')
  const realLocalModules = fs.realpathSync(localModules)
  const realStandalone = fs.realpathSync(standalone)
  for (const link of findBundleLinks(standalone)) {
    const safeLink = assertBundlePath(link, true)
    const realTarget = fs.realpathSync(safeLink)
    if (!isWithin(realLocalModules, realTarget) && !isWithin(realStandalone, realTarget)) {
      throw new Error('运行资源链接指向未授权目录：' + safeLink)
    }

    let source = realTarget
    // Prefer the traced package already in the bundle instead of recopying the
    // development package. This also preserves the bundle's Prisma engine.
    if (isWithin(realLocalModules, realTarget)) {
      const bundled = path.join(standalone, 'node_modules', path.relative(realLocalModules, realTarget))
      if (fs.existsSync(bundled) && !fs.lstatSync(bundled).isSymbolicLink()) {
        source = assertBundlePath(bundled)
      }
    }
    // Reject cycles/nested links before copying; never traverse an unresolved
    // link recursively or let a source package reach outside the allowed roots.
    assertNoLinks(source)
    const staging = assertBundlePath(safeLink + '.materializing')
    if (fs.existsSync(staging)) throw new Error('物化暂存路径已存在：' + staging)
    fs.cpSync(source, staging, { recursive: true, dereference: false, force: false, errorOnExist: true })
    assertNoLinks(staging)
    // unlink removes only the junction/symlink entry, never its target tree.
    fs.unlinkSync(safeLink)
    fs.renameSync(staging, safeLink)
    console.log('已物化运行资源链接 ' + path.relative(standalone, safeLink))
  }
  assertNoLinks(standalone)
}

function assertNoLinks(target) {
  const stat = fs.lstatSync(target)
  if (stat.isSymbolicLink()) throw new Error('待清理资源包含符号链接：' + target)
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(target)) assertNoLinks(path.join(target, name))
  }
}

function removeBundleEntry(target) {
  const safeTarget = assertBundlePath(target)
  assertNoLinks(safeTarget)
  fs.rmSync(safeTarget, { recursive: true, force: true })
  console.log('已清理 ' + path.relative(root, safeTarget))
}

// Turbopack can trace the whole project. Ship only server runtime resources;
// local .env files, development databases, backups and source files stay local.
const runtimeEntries = new Set(['.next', 'node_modules', 'public', 'prisma', 'server.js', 'package.json'])
for (const name of fs.readdirSync(standalone)) {
  if (!runtimeEntries.has(name)) removeBundleEntry(path.join(standalone, name))
}
const prismaDir = assertBundlePath(path.join(standalone, 'prisma'))
if (fs.existsSync(prismaDir)) {
  for (const name of fs.readdirSync(prismaDir)) {
    // template.db is copied separately by electron-builder's extraResources.
    if (!['schema.prisma', 'migrations'].includes(name)) removeBundleEntry(path.join(prismaDir, name))
  }
}

const copies = [
  [path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static')],
  [path.join(root, 'public'), path.join(standalone, 'public')],
]

for (const [src, dest] of copies) {
  if (fs.existsSync(src)) {
    assertBundlePath(dest)
    fs.cpSync(src, dest, { recursive: true })
    console.log('已复制 ' + path.relative(root, src) + ' -> ' + path.relative(root, dest))
  }
}

// 补全 Next 编译运行时：Turbopack 的 standalone 追踪会漏掉 app-route 等运行时文件，
// 打包后(无父级 node_modules)导致所有 /api 路由 500（登录显示"网络异常"）。
const nsSrc = path.join(root, 'node_modules', 'next', 'dist', 'compiled', 'next-server')
const nsDest = path.join(standalone, 'node_modules', 'next', 'dist', 'compiled', 'next-server')
if (fs.existsSync(nsSrc)) {
  assertBundlePath(nsDest)
  fs.mkdirSync(nsDest, { recursive: true })
  let n = 0
  for (const f of fs.readdirSync(nsSrc)) {
    if (f.endsWith('.js')) { fs.copyFileSync(path.join(nsSrc, f), path.join(nsDest, f)); n++ }
  }
  console.log('已补全 next-server 运行时（' + n + ' 个文件）')
}

materializeRuntimeLinks()

console.log('standalone 资源已就绪')
