import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { it } from 'node:test'
import { parse } from 'yaml'
import configuredRulesets from '../rulesets/index.ts'
import { createRouting } from '../src/config/routing.ts'
import { build, defineRuleset } from '../src/index.ts'

it('connects emitted partitions by business and limits DNS resolution to domestic IP fallback', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'clash-routing-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const rulesets = [
    ...configuredRulesets.map(({ name }) => defineRuleset(name, {
      add: {
        domain: [`${name.replaceAll('_', '-')}.example`],
        ipcidr: ['direct', 'ai', 'global_media', 'telegram', 'domestic'].includes(name) ? ['192.0.2.0/24'] : [],
        classical: ['ai', 'global_media'].includes(name) ? ['IP-CIDR,198.51.100.0/24,no-resolve', 'DOMAIN-KEYWORD,service', 'IP-ASN,12345', 'SRC-IP-ASN,54321'] : [],
      },
    })),
  ]
  const result = await build({ outDir: join(directory, 'output'), mrs: false, rulesets })
  const config = parse(createRouting(result, configuredRulesets), { merge: true })
  const providers = config['rule-providers'] as Record<string, { url: string, path: string, behavior: string, format: string }>
  const rules = config.rules as string[]
  assert(rules.every(rule => rule.startsWith('RULE-SET,') || rule.startsWith('MATCH,') || rule === 'AND,((RULE-SET,ai-domain),(NETWORK,UDP),(DST-PORT,443)),REJECT'))
  const files = new Set(result.rulesets.flatMap(output => Object.values(output.files).map(file => file.text)))
  for (const [name, provider] of Object.entries(providers)) {
    assert(files.has(basename(provider.path)), name)
    assert.equal(provider.format, 'text')
    assert.equal(provider.url, `https://gh.oevery.me/raw.githubusercontent.com/oevery/mihomo-config/release/${basename(provider.path)}`)
  }
  for (const base of ['https://cdn.example/rules', 'https://cdn.example/rules/']) {
    const custom = parse(createRouting(result, configuredRulesets, base), { merge: true })
    for (const [name, provider] of Object.entries(providers)) {
      assert.equal(custom['rule-providers'][name].url, `https://cdn.example/rules/${basename(provider.path)}`)
      assert.equal(custom['rule-providers'][name].path, provider.path)
    }
  }
  assert.equal(createRouting(result, configuredRulesets, ''), createRouting(result, configuredRulesets))
  for (const base of ['relative/path', 'file:///tmp/rules', 'https://user:password@example.com/', 'https://example.com/?token=x', 'https://example.com/#fragment'])
    assert.throws(() => createRouting(result, configuredRulesets, base), /RULESET_BASE_URL/)
  const mrsResult = {
    ...result,
    rulesets: result.rulesets.map(output => ({
      ...output,
      files: Object.fromEntries(Object.entries(output.files).map(([behavior, file]) => [behavior, behavior === 'classical' ? file : { ...file, mrs: file.text.replace(/\.txt$/, '.mrs') }])),
    })),
  }
  const mrsConfig = parse(createRouting(mrsResult, configuredRulesets, 'https://cdn.example/rules'), { merge: true })
  assert.equal(mrsConfig['rule-providers']['ai-domain'].url, 'https://cdn.example/rules/ai-domain.mrs')
  assert.equal(mrsConfig['rule-providers']['ai-ip'].url, 'https://cdn.example/rules/ai-ip.mrs')
  assert.equal(mrsConfig['rule-providers']['ai-classical'].url, 'https://cdn.example/rules/ai-classical.txt')
  for (const rule of rules.filter(rule => rule.startsWith('RULE-SET,')))
    assert(providers[rule.split(',')[1]], rule)
  assert(!rules.some(rule => rule.includes('fakeip_filter-domain,')))
  assert.deepEqual(rules, [
    'RULE-SET,security-domain,拦截防护',
    'RULE-SET,ads-domain,拦截防护',
    'RULE-SET,direct-domain,直连',
    'RULE-SET,direct-ip,直连,no-resolve',
    'AND,((RULE-SET,ai-domain),(NETWORK,UDP),(DST-PORT,443)),REJECT',
    'RULE-SET,ai-domain,AI',
    'RULE-SET,ai-classical,AI,no-resolve',
    'RULE-SET,ai-ip,AI,no-resolve',
    'RULE-SET,domestic_services-domain,国内',
    'RULE-SET,speedtest-domain,测速',
    'RULE-SET,game_download-domain,游戏下载',
    'RULE-SET,global_media-domain,国外媒体',
    'RULE-SET,global_media-classical,国外媒体,no-resolve',
    'RULE-SET,global_media-ip,国外媒体,no-resolve',
    'RULE-SET,telegram-domain,Telegram',
    'RULE-SET,telegram-ip,Telegram,no-resolve',
    'RULE-SET,apple-domain,Apple',
    'RULE-SET,microsoft-domain,Microsoft',
    'RULE-SET,proxy-domain,代理',
    'RULE-SET,domestic-domain,国内',
    'RULE-SET,domestic-ip,国内',
    'MATCH,兜底',
  ])
  assert.throws(() => createRouting({ ...result, rulesets: result.rulesets.filter(output => output.name !== 'ai') }, configuredRulesets), /Missing routing ruleset: ai/)
  const invalid = await build({ outDir: join(directory, 'invalid'), mrs: false, rulesets: [defineRuleset('invalid', { add: { classical: ['GEOSITE,cn'] } })] })
  assert.throws(() => createRouting(invalid, configuredRulesets), /requires geodata/)
  const selected = parse(createRouting(result, [defineRuleset('ai', { policy: '代理' })]), { merge: true })
  assert.deepEqual(selected.rules, ['AND,((RULE-SET,ai-domain),(NETWORK,UDP),(DST-PORT,443)),REJECT', 'RULE-SET,ai-domain,代理', 'RULE-SET,ai-classical,代理,no-resolve', 'RULE-SET,ai-ip,代理,no-resolve', 'MATCH,兜底'])
  const resolving = parse(createRouting(result, [defineRuleset('ai', { policy: '代理', noResolve: false })]), { merge: true })
  assert.deepEqual(resolving.rules, ['AND,((RULE-SET,ai-domain),(NETWORK,UDP),(DST-PORT,443)),REJECT', 'RULE-SET,ai-domain,代理', 'RULE-SET,ai-classical,代理', 'RULE-SET,ai-ip,代理', 'MATCH,兜底'])
  const defaultDomestic = parse(createRouting(result, [defineRuleset('domestic', { policy: '国内' })]), { merge: true })
  assert.deepEqual(defaultDomestic.rules, ['RULE-SET,domestic-domain,国内', 'RULE-SET,domestic-ip,国内,no-resolve', 'MATCH,兜底'])
})
