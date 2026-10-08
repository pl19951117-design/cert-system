// 由单位 logo（public/brand/logo.png，透明底）生成：
//   - build/icon.ico、build/icon.png  —— 安装包 / 桌面快捷方式 / 任务栏图标
//   - src/app/favicon.ico             —— 浏览器标签图标（局域网用浏览器访问时可见）
//   - electron/brand-logo.png         —— 启动画面用（打包进 app.asar，服务未就绪前也能显示）
// logo 里有黑色字母，深色任务栏上会看不清，所以图标统一放在白色圆角底板上。
// build/ 在 .gitignore 里，重新克隆后先执行：npm run icon
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const logoPath = path.join(root, 'public', 'brand', 'logo.png')
const buildDir = path.join(root, 'build')
const outIco = path.join(buildDir, 'icon.ico')
const outPng = path.join(buildDir, 'icon.png')
const outFavicon = path.join(root, 'src', 'app', 'favicon.ico')
const outSplashLogo = path.join(root, 'electron', 'brand-logo.png')

const SIZE = 1024
const RADIUS = Math.round(SIZE * 0.2)
const PAD = Math.round(SIZE * 0.1)

fs.mkdirSync(buildDir, { recursive: true })

// 白色圆角底板 + 居中 logo
const plate = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
  `<rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="#ffffff"/></svg>`,
)
const logo = await sharp(logoPath)
  .resize(SIZE - PAD * 2, SIZE - PAD * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
const base = await sharp(plate)
  .composite([{ input: logo, top: PAD, left: PAD }])
  .png()
  .toBuffer()

await sharp(base).resize(256, 256).png().toFile(outPng)
await sharp(logoPath).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toFile(outSplashLogo)

async function writeIco(file, sizes) {
  const pngs = []
  for (const s of sizes) {
    pngs.push({ size: s, buf: await sharp(base).resize(s, s).png().toBuffer() })
  }
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)        // reserved
  header.writeUInt16LE(1, 2)        // type: icon
  header.writeUInt16LE(count, 4)    // image count

  const entries = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  pngs.forEach((p, i) => {
    const e = i * 16
    entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 0)  // width (0 = 256)
    entries.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1)  // height
    entries.writeUInt8(0, e + 2)                            // palette
    entries.writeUInt8(0, e + 3)                            // reserved
    entries.writeUInt16LE(1, e + 4)                         // color planes
    entries.writeUInt16LE(32, e + 6)                        // bits per pixel
    entries.writeUInt32LE(p.buf.length, e + 8)              // size of image data
    entries.writeUInt32LE(offset, e + 12)                   // offset
    offset += p.buf.length
  })
  fs.writeFileSync(file, Buffer.concat([header, entries, ...pngs.map(p => p.buf)]))
}

await writeIco(outIco, [16, 24, 32, 48, 64, 128, 256])
await writeIco(outFavicon, [16, 32, 48])
console.log(`已生成 ${outIco}、${outPng}、${outFavicon}、${outSplashLogo}`)
