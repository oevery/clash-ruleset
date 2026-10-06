import type { BuildResult, Ruleset } from '../types.ts'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify } from 'yaml'

const defaultBase = 'https://gh.oevery.me/raw.githubusercontent.com/oevery/mihomo-config/release/'

export function normalizeRulesetBaseUrl(value?: string): string {
  let url: URL
  try {
    url = new URL(value?.trim() || defaultBase)
  }
  catch {
    throw new Error('RULESET_BASE_URL must be an absolute HTTP(S) directory URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('RULESET_BASE_URL must use HTTP(S) without credentials, query or fragment')
  if (!url.pathname.endsWith('/'))
    url.pathname += '/'
  return url.href
}

export function createRouting(result: BuildResult, rulesets: readonly Ruleset[], baseUrl?: string): string {
  const base = normalizeRulesetBaseUrl(baseUrl)
  const providers: string[] = []
  const names = new Set<string>()
  for (const output of result.rulesets) {
    if (/^(?:GEOSITE|GEOIP),/m.test(readFileSync(join(result.outDir, output.readable), 'utf8')))
      throw new Error(`Ruleset still requires geodata: ${output.name}`)
    for (const behavior of ['domain', 'ipcidr', 'classical'] as const) {
      const file = output.files[behavior]
      if (!file)
        continue
      const suffix = behavior === 'ipcidr' ? 'ip' : behavior
      const name = `${output.name}-${suffix}`
      const anchor = file.mrs ? `${suffix}_mrs` : suffix
      const filename = file.mrs ?? file.text
      names.add(name)
      const url = new URL(filename, base).href.replaceAll('\'', '\'\'')
      providers.push(`  ${name}:`, `    <<: *${anchor}`, `    url: '${url}'`, `    path: ./rulesets/${filename}`)
    }
  }

  const rules: string[] = []
  for (const { name, policy, noResolve = true } of rulesets) {
    if (!policy)
      continue
    if (!result.rulesets.some(output => output.name === name))
      throw new Error(`Missing routing ruleset: ${name}`)
    // 指定域名禁用 UDP，避免不支持 UDP 的 AI 落地被跳过后落到其他地区。
    if (name === 'ai')
      rules.push('AND,((DOMAIN,auth.openai.com),(NETWORK,UDP)),REJECT', 'AND,((DOMAIN,api.bingyun.vip),(NETWORK,UDP)),REJECT')
    // 同一业务的分区相邻；解析策略由分类声明控制，domain 不需要该参数。
    for (const suffix of ['domain', 'classical', 'ip']) {
      const provider = `${name}-${suffix}`
      if (names.has(provider))
        rules.push(`RULE-SET,${provider},${policy}${noResolve && suffix !== 'domain' ? ',no-resolve' : ''}`)
    }
  }
  rules.push('MATCH,兜底')

  const content = [
    'anchor-rule:',
    '  classical: &classical { type: http, behavior: classical, format: text, interval: 43200 }',
    '  domain: &domain { type: http, behavior: domain, format: text, interval: 43200 }',
    '  ip: &ip { type: http, behavior: ipcidr, format: text, interval: 43200 }',
    '  domain_mrs: &domain_mrs { type: http, behavior: domain, format: mrs, interval: 43200 }',
    '  ip_mrs: &ip_mrs { type: http, behavior: ipcidr, format: mrs, interval: 43200 }',
    '',
    'rule-providers:',
    ...providers,
    '',
    stringify({ rules }, { lineWidth: 0 }).trimEnd(),
    '',
  ].join('\n')
  return content
}

export function writeRouting(result: BuildResult, rulesets: readonly Ruleset[], baseUrl?: string): void {
  writeFileSync(new URL('../../config/routing.yaml', import.meta.url), createRouting(result, rulesets, baseUrl))
}
