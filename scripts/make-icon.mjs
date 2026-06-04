// 由 build/icon.svg 生成 build/icon.ico（多尺寸，PNG 内嵌）与 build/icon.png
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'build', 'icon.svg')
const outIco = path.join(root, 'build', 'icon.ico')
const outPng = path.join(root, 'build', 'icon.png')

const sizes = [16, 24, 32, 48, 64, 128, 256]

const svg = fs.readFileSync(svgPath)
// 先高密度渲染一张大图，再缩放到各尺寸，保证小图清晰
const base = await sharp(svg, { density: 512 })
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

await sharp(base).resize(256, 256).png().toFile(outPng)

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

fs.writeFileSync(outIco, Buffer.concat([header, entries, ...pngs.map(p => p.buf)]))
console.log(`已生成 ${outIco}（${count} 个尺寸）和 ${outPng}`)
