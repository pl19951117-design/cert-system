// Exercise the packaged runtime, not the development node_modules or database.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomBytes } from 'node:crypto'

assert.equal(process.platform, 'win32', 'This check needs a Windows build')
const bundle = path.resolve('release/win-unpacked')
const resources = path.join(bundle, 'resources')
const standalone = path.join(resources, 'standalone')
const executable = fs.readdirSync(bundle).find(name => name.endsWith('.exe'))
assert.ok(executable, 'Packaged Electron executable missing')
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cert-system-smoke-'))
const database = path.join(temporary, 'smoke.db')
fs.copyFileSync(path.join(resources, 'template.db'), database)
const server = spawn(path.join(bundle, executable), [path.join(standalone, 'server.js')], {
  cwd: standalone,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON: '1', NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1', PORT: '34118', DATABASE_URL: `file:${database.replaceAll('\\', '/')}?connection_limit=1`,
    JWT_SECRET: randomBytes(48).toString('hex') },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
server.stdout.on('data', data => { logs += data })
server.stderr.on('data', data => { logs += data })
const exited = once(server, 'exit')
const base = 'http://127.0.0.1:34118'
let cookie = ''
async function request(url, options = {}) {
  const response = await fetch(base + url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { Cookie: cookie, ...options.headers } })
  assert.ok(response.ok, `${url}: HTTP ${response.status}: ${await response.clone().text()}`)
  return response
}
const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

try {
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`Packaged server exited: ${logs}`)
    try { ready = (await fetch(base + '/login', { signal: AbortSignal.timeout(1000) })).ok } catch { /* starting */ }
    if (ready) break
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(ready, `Packaged server failed to start: ${logs}`)
  const login = await request('/api/auth/login', json({ username: 'admin', password: 'admin123' }))
  cookie = login.headers.get('set-cookie')?.split(';')[0] || ''
  assert.ok(cookie.startsWith('cert-session='), 'Login session missing')
  await request('/api/admin/accounts', json({ id: 'smoke', displayName: 'Temporary test account' }))
  const inspection = await (await request('/api/safety-inspections', json({ projectName: 'Attachment smoke test' }))).json()
  await request('/api/safety-inspections/import', json({ rows: [{ projectName: 'Imported safety', amount: '10000.00', rectification: '未整改' }] }))
  await request('/api/legal-cases/import', json({ rows: [{ caseNo: 'Imported legal', businessCategory: '应诉', caseType: '合同纠纷', amount: '25.00' }] }))
  const legal = await (await request('/api/legal-cases')).json()
  assert.ok(legal.some(row => row.businessCategory === '应诉' && row.caseType === '合同纠纷'))
  const before = await (await request('/api/safety-inspections')).json()
  const invalid = await fetch(base + '/api/safety-inspections/import', { ...json({ rows: [{ projectName: 'Must roll back' }, { projectName: '' }] }), headers: { Cookie: cookie, 'Content-Type': 'application/json' } })
  assert.equal(invalid.status, 400)
  const after = await (await request('/api/safety-inspections')).json()
  assert.equal(after.length, before.length, 'Invalid import must not insert any rows')
  const bytes = Buffer.from('Temporary attachment preview test\n', 'utf8')
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: 'text/plain' }), 'smoke.txt')
  const source = `/api/safety-inspections/${inspection.id}/reports`
  const report = await (await request(source, { method: 'POST', body: form })).json()
  const preview = await request(`${source}?report=${report.id}&inline=1`)
  assert.match(preview.headers.get('content-type'), /^text\/plain/)
  assert.match(preview.headers.get('content-disposition'), /^inline;/)
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), bytes)
  const download = await request(`${source}?report=${report.id}`)
  assert.match(download.headers.get('content-disposition'), /^attachment;/)
  const unauthenticated = await fetch(base + `${source}?report=${report.id}&inline=1`, { redirect: 'manual' })
  assert.ok([302, 303, 307, 308, 401].includes(unauthenticated.status), 'Attachment must require login')
  console.log('PASS: packaged Windows Electron runtime, login, upload, inline preview, download, authentication')
} catch (error) {
  console.error(logs)
  throw error
} finally {
  server.kill()
  await exited
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
}
