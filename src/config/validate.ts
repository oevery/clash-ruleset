import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'
import { checkConfig } from './check.ts'

export function validateConfig(mihomo = 'mihomo', rulesetDir?: string): void {
  checkConfig()
  const directory = mkdtempSync(join(tmpdir(), 'mihomo-config-test-'))
  try {
    let path = fileURLToPath(new URL('../../config/config.yaml', import.meta.url))
    if (rulesetDir) {
      const config = parse(readFileSync(path, 'utf8'), { merge: true })
      for (const [name, provider] of Object.entries(config['rule-providers'] as Record<string, { type: string, path: string, url?: string, interval?: number }>)) {
        provider.type = 'file'
        const source = join(resolve(rulesetDir), basename(provider.path))
        if (!existsSync(source))
          throw new Error(`Missing local ruleset: ${name}`)
        provider.path = join(directory, basename(provider.path))
        copyFileSync(source, provider.path)
        delete provider.url
        delete provider.interval
      }
      path = join(directory, 'config.yaml')
      writeFileSync(path, stringify(config))
    }
    execFileSync(mihomo, [
      '-t',
      '-d',
      directory,
      '-f',
      path,
    ], { stdio: 'inherit', timeout: 120_000 })
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
