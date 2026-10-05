import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { gzipSync } from 'node:zlib'
import { ensureMihomo } from '../scripts/lib/mihomo.ts'

it('downloads a verified release, reuses offline cache and preserves it on failed refresh', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'mihomo-download-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let tag = 'v1.2.3'
  let badDigest = false
  let badExecutable = false
  let requests = 0
  const request: typeof fetch = async (input) => {
    requests++
    const archive = gzipSync(Buffer.from(tag))
    if (String(input).startsWith('https://api.github.com/')) {
      return Response.json({
        tag_name: tag,
        draft: false,
        prerelease: false,
        assets: [{
          name: `mihomo-linux-amd64-${tag}.gz`,
          digest: `sha256:${badDigest ? '0'.repeat(64) : createHash('sha256').update(archive).digest('hex')}`,
          browser_download_url: `https://github.com/MetaCubeX/mihomo/releases/download/${tag}/mihomo.gz`,
        }],
      })
    }
    return new Response(archive)
  }
  const options = {
    directory,
    bin: '',
    version: 'latest',
    platform: 'linux',
    arch: 'x64',
    fetch: request,
    verify: async (path: string) => `Mihomo Meta ${badExecutable ? 'v0.0.0' : await readFile(path, 'utf8')} linux amd64`,
  }
  // 兼容旧版本中断后残留的锁；不清除可能属于旧进程的目录。
  const legacyLock = join(directory, 'linux-amd64-latest.lock')
  await mkdir(legacyLock)
  await writeFile(join(legacyLock, 'owner'), 'leave untouched')
  const path = await ensureMihomo(options)
  assert.equal(await readFile(path, 'utf8'), 'v1.2.3')
  assert.equal(requests, 2)
  await ensureMihomo({ ...options, fetch: async () => {
    throw new Error('offline')
  } })
  tag = 'v1.2.4'
  badDigest = true
  await assert.rejects(ensureMihomo({ ...options, force: true }), /SHA-256 mismatch/)
  assert.equal(await readFile(path, 'utf8'), 'v1.2.3')
  badDigest = false
  badExecutable = true
  await assert.rejects(ensureMihomo({ ...options, force: true }), /version mismatch/)
  assert.equal(await readFile(path, 'utf8'), 'v1.2.3')
  badExecutable = false
  await ensureMihomo({ ...options, force: true })
  assert.equal(await readFile(path, 'utf8'), 'v1.2.4')
  await assert.rejects(ensureMihomo({ ...options, version: 'v1.2.3' }), /requested stable version/)
  const pinned = await ensureMihomo({ ...options, version: 'v1.2.4' })
  assert.notEqual(pinned, path)
  await assert.rejects(ensureMihomo({ ...options, force: true, fetch: async () => new Response(null, { status: 503 }) }), /HTTP 503/)
  assert.equal(await readFile(path, 'utf8'), 'v1.2.4')
  assert.equal(await readFile(join(legacyLock, 'owner'), 'utf8'), 'leave untouched')

  // 一个下载暂停时，另一个可以完成；暂停者失败也不能清理其他调用的产物。
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const pending = ensureMihomo({ ...options, force: true, fetch: async () => {
    entered.resolve()
    await release.promise
    throw new Error('interrupted download')
  } })
  const failed = assert.rejects(pending, /interrupted download/)
  try {
    await entered.promise
    await ensureMihomo({ ...options, force: true })
    assert.equal(await readFile(path, 'utf8'), 'v1.2.4')
  }
  finally {
    release.resolve()
    await failed
  }
  assert.equal(await ensureMihomo(options), path)
  assert.equal(await readFile(path, 'utf8'), 'v1.2.4')
})

it('respects external binaries and rejects unsupported downloads without network access', async () => {
  const options = { fetch: async () => {
    throw new Error('must not download')
  } }
  assert.equal(await ensureMihomo({ ...options, bin: 'mihomo', verify: async () => 'Mihomo v1.2.3 linux amd64' }), 'mihomo')
  await assert.rejects(ensureMihomo({ ...options, bin: 'mihomo', force: true }), /cannot replace MIHOMO_BIN/)
  await assert.rejects(ensureMihomo({ ...options, bin: 'invalid', verify: async () => {
    throw new Error('invalid binary')
  } }), /invalid binary/)
  await assert.rejects(ensureMihomo({ ...options, bin: '', version: '../escape' }), /MIHOMO_VERSION/)
  await assert.rejects(ensureMihomo({ ...options, bin: '', version: 'latest', platform: 'win32' }), /set MIHOMO_BIN/)
})
