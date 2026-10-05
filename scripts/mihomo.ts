import { appendFile } from 'node:fs/promises'
import process from 'node:process'
import { ensureMihomo } from './lib/mihomo.ts'
import './lib/env.ts'

const args = process.argv.slice(2)
if (args.some(arg => arg !== '--force'))
  throw new Error('Usage: pnpm mihomo [--force]')
const path = await ensureMihomo({ force: args.includes('--force') })
// CI 后续检查与构建共用已验证的内核，避免集成测试因缺少路径而跳过。
if (process.env.GITHUB_ENV) {
  if (/[\r\n]/.test(path))
    throw new Error('Mihomo path cannot contain newlines')
  await appendFile(process.env.GITHUB_ENV, `MIHOMO_BIN=${path}\n`)
}
console.log(`Mihomo ready: ${path}`)
