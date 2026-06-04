// electron-builder skips `node_modules` when copying a directory via
// extraResources, which would drop the Prisma engine + Next.js runtime from the
// standalone server. Copy it in explicitly after the app is packed (before the
// installer is assembled).
const fs = require('fs')
const path = require('path')

exports.default = async function afterPack(context) {
  const { appOutDir } = context
  const src = path.join(process.cwd(), '.next', 'standalone', 'node_modules')
  const dest = path.join(appOutDir, 'resources', 'standalone', 'node_modules')

  if (!fs.existsSync(src)) {
    throw new Error('[afterPack] 找不到 standalone node_modules：' + src)
  }
  if (fs.existsSync(dest)) return

  fs.cpSync(src, dest, { recursive: true })
  console.log('[afterPack] 已复制 standalone/node_modules -> ' + dest)
}
