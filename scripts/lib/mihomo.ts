import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))

interface Options {
  bin?: string
  version?: string
  force?: boolean
  directory?: string
  platform?: string
  arch?: string
  fetch?: typeof fetch
  verify?: (path: string) => Promise<string>
}

async function verifyBinary(path: string): Promise<string> {
  const { stdout } = await execute(path, ['-v'], { timeout: 10_000 })
  return stdout
}

function binaryVersion(output: string): string {
  const version = /Mihomo\s+(?:Meta\s+)?(v\d+\.\d+\.\d+)(?:\s|$)/i.exec(output)?.[1]
  if (!version)
    throw new Error('Executable did not report a stable Mihomo version')
  return version
}

export async function ensureMihomo(options: Options = {}): Promise<string> {
  const verify = options.verify ?? verifyBinary
  const bin = (options.bin ?? process.env.MIHOMO_BIN)?.trim()
  // 显式指定的程序不属于项目缓存，不回退下载，也不允许强制覆盖。
  if (bin) {
    if (options.force)
      throw new Error('--force cannot replace MIHOMO_BIN; unset it to manage the project cache')
    const path = bin.includes('/') || bin.includes('\\') ? resolve(root, bin) : bin
    binaryVersion(await verify(path))
    return path
  }

  const requested = (options.version ?? process.env.MIHOMO_VERSION)?.trim() || 'latest'
  if (requested !== 'latest' && !/^v\d+\.\d+\.\d+$/.test(requested))
    throw new Error('MIHOMO_VERSION must be latest or a stable tag such as v1.19.32')
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  if (!['darwin', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch))
    throw new Error('Automatic Mihomo downloads support macOS/Linux x64/arm64; set MIHOMO_BIN for this platform')
  const target = `${platform}-${arch === 'x64' ? 'amd64' : arch}`
  const directory = options.directory ?? join(root, '.tools', 'mihomo')
  const destination = join(directory, `${target}-${requested}`)
  // latest 仅在首次下载或显式刷新时解析，日常构建可以离线复用内核。
  if (!options.force) {
    try {
      await stat(destination)
      const version = binaryVersion(await verify(destination))
      if (requested !== 'latest' && requested !== version)
        throw new Error('Cached Mihomo version mismatch; run pnpm mihomo --force')
      return destination
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }

  await mkdir(directory, { recursive: true })
  // 各下载使用独立临时目录，不持有可能因进程中断而残留的持久锁。
  // 并发调用允许重复下载，但只有完整且验证通过的文件能原子替换缓存。
  let temporary: string | undefined
  try {
    const request = options.fetch ?? fetch
    const endpoint = requested === 'latest' ? 'latest' : `tags/${requested}`
    const response = await request(`https://api.github.com/repos/MetaCubeX/mihomo/releases/${endpoint}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok)
      throw new Error(`Mihomo release lookup failed: HTTP ${response.status}`)
    const release = await response.json() as { tag_name: string, draft: boolean, prerelease: boolean, assets: { name: string, digest?: string, browser_download_url: string }[] }
    if (!/^v\d+\.\d+\.\d+$/.test(release.tag_name) || release.draft || release.prerelease || (requested !== 'latest' && release.tag_name !== requested))
      throw new Error('Mihomo release does not match the requested stable version')
    const asset = release.assets.find(asset => asset.name === `mihomo-${target}-${release.tag_name}.gz`)
    if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? ''))
      throw new Error('Mihomo release is missing the platform asset or SHA-256 digest')
    const url = new URL(asset.browser_download_url)
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/MetaCubeX/mihomo/releases/download/') || url.username || url.password)
      throw new Error('Unexpected Mihomo asset URL')
    const download = await request(url, { signal: AbortSignal.timeout(120_000) })
    if (!download.ok)
      throw new Error(`Mihomo download failed: HTTP ${download.status}`)
    const archive = Buffer.from(await download.arrayBuffer())
    if (`sha256:${createHash('sha256').update(archive).digest('hex')}` !== asset.digest)
      throw new Error('Mihomo archive SHA-256 mismatch')
    temporary = await mkdtemp(join(directory, '.download-'))
    const executable = join(temporary, 'mihomo')
    await writeFile(executable, gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 }))
    await chmod(executable, 0o755)
    if (binaryVersion(await verify(executable)) !== release.tag_name)
      throw new Error('Downloaded Mihomo executable version mismatch')
    // 摘要与可执行文件版本均通过验证后再替换，失败不破坏旧缓存。
    await rename(executable, destination)
    return destination
  }
  finally {
    if (temporary)
      await rm(temporary, { recursive: true, force: true })
  }
}
