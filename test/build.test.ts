import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { it } from 'node:test'
import { promisify } from 'node:util'
import configuredRulesets from '../rulesets/index.ts'
import { build, defineRuleset, fromUrl } from '../src/index.ts'

async function workspace(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'clash-ruleset-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return join(root, 'output')
}

async function sources(t: TestContext, documents: Record<string, string>) {
  const server = createServer((request, response) => {
    const content = documents[request.url ?? '']
    response.writeHead(content === undefined ? 404 : 200)
    response.end(content ?? 'Not found')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  }))
  const address = server.address()
  assert(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

it('builds exact blocking hosts domains and rejects non-blocking or malformed hosts', async (t) => {
  const outDir = await workspace(t)
  const base = await sources(t, {
    '/hosts': '\uFEFF# NoCoin-style hosts\r\n0.0.0.0 Miner.Example alias.example # comment\r\n127.0.0.1 localhost\n::1 ip6-localhost ipv6.example\n0.0.0.0 miner.example\n',
    '/invalid': '192.0.2.1 redirected.example\n',
    '/missing': '0.0.0.0\n',
  })
  const result = await build({ outDir, mrs: false, rulesets: [defineRuleset('hosts', {
    sources: [fromUrl(`${base}/hosts`, { behavior: 'domain', format: 'hosts' })],
  })] })
  assert.equal(result.rulesets[0].count, 3)
  assert.equal(await readFile(join(outDir, 'hosts-domain.txt'), 'utf8'), 'alias.example\nipv6.example\nminer.example\n')
  for (const [path, behavior] of [['invalid', 'domain'], ['missing', 'domain'], ['hosts', 'classical']] as const) {
    await assert.rejects(build({ outDir, mrs: false, rulesets: [defineRuleset('hosts', {
      sources: [fromUrl(`${base}/${path}`, { behavior, format: 'hosts' })],
    })] }), /Failed to load hosts source/)
  }
})

it('limits protection output to domains and excludes IP literals and source markers', async (t) => {
  const outDir = await workspace(t)
  const protections = configuredRulesets.filter(rule => ['security', 'ads'].includes(rule.name))
  const result = await build({ outDir, mrs: false, rulesets: protections.map(rule => ({
    ...rule,
    sources: [],
    add: {
      domain: ['blocked.example', '192.0.2.1', '+.192.0.2.2', '::1', '7h15.ru1353t.1s.m4d3.by.5ukk4w.skk.moe'],
      ipcidr: ['192.0.2.0/24'],
      classical: ['DOMAIN-KEYWORD,ad', 'DOMAIN-REGEX,.*ads.*'],
    },
  })) })
  for (const rule of result.rulesets) {
    assert.equal(rule.count, 1)
    assert.deepEqual(Object.keys(rule.files), ['domain'])
    assert.equal(await readFile(join(outDir, rule.readable), 'utf8'), 'DOMAIN,blocked.example\n')
  }
})

it('aggregates URL formats, filters additions, deduplicates and sorts each category', async (t) => {
  const outDir = await workspace(t)
  const base = await sources(t, {
    '/classical': '\uFEFF# comment\r\nDOMAIN,Z.Example\r\nDOMAIN-SUFFIX,Example.COM\r\nDOMAIN,excluded.example\r\nDOMAIN-KEYWORD,openai\r\nIP-CIDR,192.0.2.0/24,no-resolve\r\nAND,((DOMAIN,login.example),(NETWORK,UDP))\r\n',
    '/domain': 'payload: ["+.example.com", "z.example", "a.example", "Mijia Cloud"]\n',
    '/ip': '# IP list\n198.51.100.0/24\n2001:db8::/32\n',
  })
  const result = await build({
    outDir,
    mrs: false,
    rulesets: [defineRuleset('ai', {
      sources: [
        fromUrl(`${base}/classical`, { behavior: 'classical', format: 'text' }),
        fromUrl(`${base}/domain`, { behavior: 'domain', format: 'yaml' }),
        fromUrl(`${base}/ip`, { behavior: 'ipcidr', format: 'text' }),
      ],
      add: {
        domain: ['a.example', 'excluded.local'],
        ipcidr: ['198.51.100.0/24', '2001:db8::/32'],
      },
      filter: rule => !rule.value.startsWith('excluded.'),
    })],
  })
  assert.equal(result.rulesets[0].count, 9)
  assert.deepEqual((await readdir(outDir)).sort(), ['ai-classical.txt', 'ai-domain.txt', 'ai-ip.txt', 'ai.txt', 'manifest.json'])
  assert.equal(await readFile(join(outDir, 'ai-domain.txt'), 'utf8'), 'a.example\nmijia cloud\nz.example\n+.example.com\n')
  assert.equal(await readFile(join(outDir, 'ai-ip.txt'), 'utf8'), '192.0.2.0/24\n198.51.100.0/24\n2001:db8::/32\n')
  assert.equal(await readFile(join(outDir, 'ai-classical.txt'), 'utf8'), [
    'AND,((DOMAIN,login.example),(NETWORK,UDP))',
    'DOMAIN-KEYWORD,openai',
    '',
  ].join('\n'))
  const readable = await readFile(join(outDir, 'ai.txt'), 'utf8')
  assert.equal(readable, [
    'AND,((DOMAIN,login.example),(NETWORK,UDP))',
    'DOMAIN,a.example',
    'DOMAIN,mijia cloud',
    'DOMAIN,z.example',
    'DOMAIN-KEYWORD,openai',
    'DOMAIN-SUFFIX,example.com',
    'IP-CIDR,192.0.2.0/24',
    'IP-CIDR,198.51.100.0/24',
    'IP-CIDR6,2001:db8::/32',
    '',
  ].join('\n'))
  const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'))
  assert.deepEqual(manifest.rulesets, result.rulesets)
  assert.equal(result.rulesets[0].files.domain?.mrs, undefined)
})

it('removes suffix-covered domains only within their category and preserves classical rules', async (t) => {
  const outDir = await workspace(t)
  const base = await sources(t, {
    '/domain': [
      'example.com',
      'api.example.com',
      '*.example.com',
      '.example.com',
      '+.nested.example.com',
      'nested.api.example.com',
      'notexample.com',
      '*.other.test',
      '.uncovered.test',
      '*.example.*',
    ].join('\n'),
  })
  const classical = [
    'DOMAIN-KEYWORD,example',
    'DOMAIN-REGEX,^api[.]example[.]com$',
    'PROCESS-NAME,curl',
  ]
  const result = await build({
    outDir,
    mrs: false,
    rulesets: [
      defineRuleset('ai', {
        sources: [fromUrl(`${base}/domain`, { behavior: 'domain', format: 'text' })],
        add: {
          domain: ['+.Example.COM.', 'API.EXAMPLE.COM.', '+.nested.example.com'],
          classical: [...classical, 'IP-CIDR,192.0.2.0/24,no-resolve'],
        },
      }),
      defineRuleset('other', { add: { domain: ['api.example.com'] } }),
    ],
  })
  assert.deepEqual(new Set((await readFile(join(outDir, 'ai-domain.txt'), 'utf8')).trim().split('\n')), new Set([
    '+.example.com',
    'notexample.com',
    '*.other.test',
    '.uncovered.test',
    '*.example.*',
  ]))
  assert.deepEqual((await readFile(join(outDir, 'ai-classical.txt'), 'utf8')).trim().split('\n'), [...classical].sort())
  assert.equal(await readFile(join(outDir, 'ai-ip.txt'), 'utf8'), '192.0.2.0/24\n')
  assert.equal(result.rulesets[0].count, 9)
  assert.equal(result.rulesets[0].files.domain?.count, 5)
  const readable = await readFile(join(outDir, 'ai.txt'), 'utf8')
  assert(!readable.split('\n').includes('DOMAIN,api.example.com'))
  assert(readable.split('\n').includes('DOMAIN-SUFFIX,example.com'))
  assert.equal(await readFile(join(outDir, 'other-domain.txt'), 'utf8'), 'api.example.com\n')
})

it('normalizes simple IP no-resolve while preserving other options and compound rules', async (t) => {
  const outDir = await workspace(t)
  const compound = 'AND,((IP-CIDR,203.0.113.0/24,no-resolve),(NETWORK,UDP))'
  const base = await sources(t, {
    '/classical': [
      'IP-CIDR,192.0.2.0/24,no-resolve',
      'IP-CIDR6,2001:db8::/32,no-resolve',
      'IP-CIDR,198.51.100.0/24,no-resolve,src',
      compound,
    ].join('\n'),
  })
  const result = await build({
    outDir,
    mrs: false,
    rulesets: [defineRuleset('normalized', {
      noResolve: false,
      sources: [fromUrl(`${base}/classical`, { behavior: 'classical', format: 'text' })],
      add: {
        ipcidr: ['192.0.2.0/24', '2001:db8::/32'],
        classical: ['IP-CIDR,203.0.113.0/24,no-resolve', 'IP-CIDR6,2001:db8:1::/48,no-resolve', 'DOMAIN-KEYWORD,no-resolve'],
      },
    })],
  })
  assert.equal(result.rulesets[0].count, 7)
  assert.equal(await readFile(join(outDir, 'normalized-ip.txt'), 'utf8'), '192.0.2.0/24\n203.0.113.0/24\n2001:db8:1::/48\n2001:db8::/32\n')
  assert.equal(await readFile(join(outDir, 'normalized-classical.txt'), 'utf8'), [compound, 'DOMAIN-KEYWORD,no-resolve', 'IP-CIDR,198.51.100.0/24,src', ''].join('\n'))
})

it('normalizes removals across formats before additions, filters and category-local deduplication', async (t) => {
  const outDir = await workspace(t)
  const base = await sources(t, {
    '/classical': [
      'DOMAIN-SUFFIX,Example.COM.',
      'DOMAIN,api.example.com',
      'DOMAIN-SUFFIX,child.example.com',
      'DOMAIN-KEYWORD,example',
      'DOMAIN-REGEX,^.+[.]example[.]com$',
    ].join('\n'),
    '/domain': '.example.com\n*.example.com\n+.stun.*.example.com\nnotexample.com\nexample.com.evil\n',
  })
  const inputs = [
    fromUrl(`${base}/classical`, { behavior: 'classical', format: 'text' }),
    fromUrl(`${base}/domain`, { behavior: 'domain', format: 'text' }),
  ]
  const result = await build({
    outDir,
    mrs: false,
    rulesets: [
      defineRuleset('domain_remove', {
        sources: inputs,
        remove: { domain: ['+.EXAMPLE.com.', '+.absent.test'] },
        add: { classical: ['DOMAIN-SUFFIX,ai.example.com'], domain: ['api.example.com', 'filtered.example.com'] },
        filter: rule => rule.value !== 'filtered.example.com',
      }),
      defineRuleset('classical_remove', {
        sources: inputs,
        remove: { classical: ['DOMAIN-SUFFIX,example.com'] },
        add: { domain: ['+.ai.example.com', 'api.example.com'] },
      }),
      defineRuleset('untouched', { sources: inputs }),
    ],
  })
  const expected = [
    'DOMAIN,api.example.com',
    'DOMAIN,example.com.evil',
    'DOMAIN,notexample.com',
    'DOMAIN-KEYWORD,example',
    'DOMAIN-REGEX,^.+[.]example[.]com$',
    'DOMAIN-SUFFIX,ai.example.com',
    '',
  ].join('\n')
  for (const name of ['domain_remove', 'classical_remove']) {
    assert.equal(await readFile(join(outDir, `${name}.txt`), 'utf8'), expected)
    assert.equal(result.rulesets.find(rule => rule.name === name)?.files.domain?.count, 4)
  }
  assert((await readFile(join(outDir, 'untouched-domain.txt'), 'utf8')).includes('+.example.com'))
})

it('removes only fully covered native domain patterns without punching holes in parent rules', async (t) => {
  const outDir = await workspace(t)
  const cases = [
    { name: 'exact', remove: 'example.com', input: ['example.com', '.example.com'], keep: ['.example.com'] },
    { name: 'children', remove: '.example.com', input: ['example.com', '*.example.com', '+.sub.example.com'], keep: ['example.com'] },
    { name: 'parent', remove: '.example.com', input: ['+.example.com'], keep: ['+.example.com'] },
    { name: 'single', remove: '*.example.com', input: ['a.example.com', 'a.b.example.com', '.example.com', '+.a.example.com'], keep: ['a.b.example.com', '.example.com', '+.a.example.com'] },
    { name: 'mixed', remove: '+.stun.*.example.com', input: ['stun.a.example.com', '*.stun.a.example.com', '+.stun.*.example.com', 'stun.example.com', '+.other.*.example.com'], keep: ['stun.example.com', '+.other.*.example.com'] },
    { name: 'unknown', remove: '+.example.com', input: ['*.example.*', '+.com', 'notexample.com'], keep: ['*.example.*', '+.com'] },
  ]
  const base = await sources(t, Object.fromEntries(cases.map(item => [`/${item.name}`, item.input.join('\n')])))
  await build({
    outDir,
    mrs: false,
    rulesets: cases.map(item => defineRuleset(item.name, {
      sources: [fromUrl(`${base}/${item.name}`, { behavior: 'domain', format: 'text' })],
      remove: { domain: [item.remove] },
    })),
  })
  for (const item of cases) {
    assert.deepEqual(new Set((await readFile(join(outDir, `${item.name}-domain.txt`), 'utf8')).trim().split('\n')), new Set(item.keep), item.name)
  }
})

it('canonicalizes CIDRs and removes contained networks without changing family, options or larger ranges', async (t) => {
  const outDir = await workspace(t)
  const compound = 'AND,((IP-CIDR,192.0.2.0/24,no-resolve),(NETWORK,UDP))'
  const base = await sources(t, {
    '/ip': '192.0.2.129/25\n192.0.2.7/32\n192.0.0.0/16\n2001:0DB8:0001::7/48\n2001:db8::/32\n::ffff:192.0.2.0/120\n',
    '/classical': [
      'IP-CIDR,192.0.2.128/25,no-resolve',
      'IP-CIDR,192.0.2.199/24,no-resolve,src',
      'IP-CIDR6,2001:0DB8:0001:0000:0000:0000:0000:0001/48,no-resolve,src',
      compound,
      'DOMAIN-REGEX,^api[.]example[.]com$',
      'DOMAIN-REGEX,^api\\.example\\.com$',
      'DOMAIN-KEYWORD,example',
    ].join('\n'),
  })
  await build({
    outDir,
    mrs: false,
    rulesets: [defineRuleset('networks', {
      sources: [fromUrl(`${base}/ip`, { behavior: 'ipcidr', format: 'text' }), fromUrl(`${base}/classical`, { behavior: 'classical', format: 'text' })],
      remove: {
        ipcidr: ['192.0.2.42/24'],
        classical: ['IP-CIDR6,2001:db8:1::abcd/48,no-resolve', 'DOMAIN-REGEX,^api[.]example[.]com$', 'DOMAIN-KEYWORD,example'],
      },
      add: {
        ipcidr: ['192.0.2.199/25', '2001:0DB8:0001:0000:0000:0000:0000:0001/48'],
        classical: ['IP-CIDR,192.0.2.128/25', 'IP-CIDR6,2001:db8:1::/48'],
      },
    })],
  })
  assert.deepEqual(new Set((await readFile(join(outDir, 'networks-ip.txt'), 'utf8')).trim().split('\n')), new Set([
    '192.0.0.0/16',
    '192.0.2.128/25',
    '2001:db8::/32',
    '2001:db8:1::/48',
    '::ffff:c000:200/120',
  ]))
  assert.deepEqual(new Set((await readFile(join(outDir, 'networks-classical.txt'), 'utf8')).trim().split('\n')), new Set([
    'IP-CIDR,192.0.2.0/24,src',
    'IP-CIDR6,2001:db8:1::/48,src',
    compound,
    'DOMAIN-REGEX,^api\\.example\\.com$',
  ]))
})

it('keeps previous output on invalid local edits and identifies the operation and entry', async (t) => {
  const outDir = await workspace(t)
  await build({ outDir, mrs: false, rulesets: [defineRuleset('baseline', { add: { domain: ['old.example'] } })] })
  for (const operation of ['add', 'remove'] as const) {
    for (const [behavior, entry] of [['domain', 'foo.*bar.test'], ['ipcidr', '192.0.2.1/33'], ['classical', 'DOMAIN,']] as const) {
      await assert.rejects(build({
        outDir,
        mrs: false,
        rulesets: [defineRuleset('invalid', { [operation]: { [behavior]: [entry] } })],
      }), { message: `Invalid invalid.${operation}.${behavior} entry 1` })
      assert.equal(await readFile(join(outDir, 'baseline-domain.txt'), 'utf8'), 'old.example\n')
    }
  }
})

it('filters covering suffixes before removing covered domains', async (t) => {
  const outDir = await workspace(t)
  const base = await sources(t, { '/domain': '+.example.com\n' })
  const result = await build({
    outDir,
    mrs: false,
    rulesets: [defineRuleset('filtered', {
      sources: [fromUrl(`${base}/domain`, { behavior: 'domain', format: 'text' })],
      add: { domain: ['api.example.com', 'example.com'] },
      filter: rule => rule.behavior !== 'domain' || !rule.value.startsWith('+.'),
    })],
  })
  assert.equal(await readFile(join(outDir, 'filtered-domain.txt'), 'utf8'), 'api.example.com\nexample.com\n')
  assert.equal(result.rulesets[0].count, 2)
})

it('combines AI domain removals with source marker cleanup that still applies to additions', async (t) => {
  const outDir = await workspace(t)
  const marker = '7h15.ru1353t.1s.m4d3.by.5ukk4w.skk.moe'
  const base = await sources(t, {
    '/domain': [
      marker,
      `1.${marker}`,
      `*.${marker}`,
      `+.${marker}`,
      'random-prefix.5ukk4w.skk.moe',
      '5ukk4w.skk.moe',
      'this_ruleset_is_made_by_sukkaw.ruleset.skk.moe',
      'th1s_rule5et_1s_m4d3_by_5ukk4w_ruleset.skk.moe',
      '7h1s_rul35et_i5_mad3_by_5ukk4w-ruleset.skk.moe',
      'skk.moe',
      'www.skk.moe',
      'ruleset.skk.moe',
      '5ukk4w.skk.moe.example.com',
      '+.nvidia.com',
      '+.models.nvidia.com',
      'api.onrender.com',
      '+.envato-static.com',
      '+.envatousercontent.com',
    ].join('\n'),
    '/classical': [`DOMAIN,2.${marker.toUpperCase()}.`, `DOMAIN-SUFFIX,3.${marker}`, 'DOMAIN,api.github.com', 'IP-ASN,12345', 'SRC-IP-ASN,54321'].join('\n'),
  })
  const ai = configuredRulesets.find(ruleset => ruleset.name === 'ai')
  assert(ai)
  const result = await build({
    outDir,
    mrs: false,
    rulesets: [{
      ...ai,
      sources: [
        fromUrl(`${base}/domain`, { behavior: 'domain', format: 'text' }),
        fromUrl(`${base}/classical`, { behavior: 'classical', format: 'text' }),
      ],
      add: { domain: [`4.${marker}`, 'custom.example'] },
    }],
  })
  assert.equal(await readFile(join(outDir, 'ai-domain.txt'), 'utf8'), '5ukk4w.skk.moe.example.com\ncustom.example\nruleset.skk.moe\nskk.moe\nwww.skk.moe\n')
  assert.equal(await readFile(join(outDir, 'ai.txt'), 'utf8'), 'DOMAIN,5ukk4w.skk.moe.example.com\nDOMAIN,custom.example\nDOMAIN,ruleset.skk.moe\nDOMAIN,skk.moe\nDOMAIN,www.skk.moe\nIP-ASN,12345\nSRC-IP-ASN,54321\n')
  assert.equal(await readFile(join(outDir, 'ai-classical.txt'), 'utf8'), 'IP-ASN,12345\nSRC-IP-ASN,54321\n')
  assert.equal(result.rulesets[0].count, 7)
})

it('supports custom sorting after aggregating all sources and additions', async (t) => {
  const outDir = await workspace(t)
  const base = await sources(t, { '/domain': 'b.example\na.example\n' })
  await build({
    outDir,
    mrs: false,
    rulesets: [defineRuleset('custom', {
      sources: [fromUrl(`${base}/domain`, { behavior: 'domain', format: 'text' })],
      add: { domain: ['c.example'] },
      sort: (a, b) => a.value < b.value ? 1 : a.value > b.value ? -1 : 0,
    })],
  })
  assert.equal(await readFile(join(outDir, 'custom-domain.txt'), 'utf8'), 'c.example\nb.example\na.example\n')
})

it('download and parse failures leave the previous published output unchanged', async (t) => {
  const outDir = await workspace(t)
  const baseline = await build({ outDir, mrs: false, rulesets: [defineRuleset('good', { add: { domain: ['old.example'] } })] })
  const base = await sources(t, { '/invalid': 'payload: [42]\n' })
  for (const path of ['missing', 'invalid']) {
    await assert.rejects(build({
      outDir,
      mrs: false,
      rulesets: [
        defineRuleset('good', { add: { domain: ['new.example'] } }),
        defineRuleset('bad', { sources: [fromUrl(`${base}/${path}`, { behavior: 'domain', format: 'yaml' })] }),
      ],
    }), /Failed to load bad source 1/)
    assert.equal(await readFile(join(outDir, 'good-domain.txt'), 'utf8'), 'old.example\n')
    assert.deepEqual(JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8')).rulesets, baseline.rulesets)
  }
})

it('conversion failures do not replace a successful build', async (t) => {
  const outDir = await workspace(t)
  const rulesets = [defineRuleset('ai', { add: { domain: ['old.example'] } })]
  await build({ outDir, mrs: false, rulesets })
  await assert.rejects(build({
    outDir,
    mihomo: join(outDir, 'nonexistent-mihomo'),
    rulesets: [defineRuleset('ai', { add: { domain: ['new.example'] } })],
  }), /MRS conversion failed/)
  assert.equal(await readFile(join(outDir, 'ai-domain.txt'), 'utf8'), 'old.example\n')
})

it('successful rebuilds remove obsolete categories and handle an empty category', async (t) => {
  const outDir = await workspace(t)
  await build({ outDir, mrs: false, rulesets: [defineRuleset('old', { add: { domain: ['old.example'] } })] })
  const result = await build({ outDir, mrs: false, rulesets: [defineRuleset('empty', {})] })
  await assert.rejects(access(join(outDir, 'old.txt')))
  assert.equal(await readFile(join(outDir, 'empty.txt'), 'utf8'), '')
  assert.deepEqual(result.rulesets[0].files, {})
})

it('does not overwrite unrelated directories or accept category path traversal', async (t) => {
  const outDir = await workspace(t)
  await mkdir(outDir)
  await writeFile(join(outDir, 'personal.txt'), 'keep me')
  await assert.rejects(build({ outDir, mrs: false, rulesets: [] }), /Refusing to replace/)
  assert.equal(await readFile(join(outDir, 'personal.txt'), 'utf8'), 'keep me')
  await assert.rejects(build({ outDir, mrs: false, rulesets: [{ name: '../outside' }] }), /Invalid ruleset name/)
})

it('rejects colliding output names before downloading and preserves previous output', async (t) => {
  const outDir = await workspace(t)
  await build({ outDir, mrs: false, rulesets: [defineRuleset('old', { add: { domain: ['keep.example'] } })] })
  const before = await readFile(join(outDir, 'manifest.json'), 'utf8')
  for (const suffix of ['domain', 'ip', 'classical']) {
    for (const reverse of [false, true]) {
      const names = ['demo', `demo-${suffix}`]
      if (reverse)
        names.reverse()
      await assert.rejects(build({
        outDir,
        rulesets: names.map(name => defineRuleset(name, {
          sources: [fromUrl('http://127.0.0.1:1/must-not-download', { behavior: 'domain', format: 'text' })],
        })),
      }), new RegExp(`Output filename collision: demo-${suffix}\\.txt`))
      assert.equal(await readFile(join(outDir, 'manifest.json'), 'utf8'), before)
      assert.equal(await readFile(join(outDir, 'old-domain.txt'), 'utf8'), 'keep.example\n')
    }
  }
  await build({ outDir, mrs: false, rulesets: [defineRuleset('demo-domain', { add: { domain: ['valid.example'] } })] })
  assert.equal(await readFile(join(outDir, 'demo-domain-domain.txt'), 'utf8'), 'valid.example\n')
})

it('emits real domain/IP MRS alongside readable and classical files', { skip: !process.env.MIHOMO_BIN }, async (t) => {
  const outDir = await workspace(t)
  const base = await sources(t, { '/patterns': '.children.test\n*.single.test\n+.example.org\nexample.org\napi.example.org\n*.example.org\n+.nested.example.org\n' })
  const result = await build({
    outDir,
    mihomo: process.env.MIHOMO_BIN,
    rulesets: [defineRuleset('mixed', {
      sources: [fromUrl(`${base}/patterns`, { behavior: 'domain', format: 'text' })],
      add: {
        domain: ['api.example.com', '+.example.org', '.children.test', '*.single.test', '+.stun.*.*', 'Mijia Cloud'],
        ipcidr: ['192.0.2.0/24', '2001:db8::/32'],
        classical: ['PROCESS-NAME,curl', 'IP-CIDR,192.0.2.0/24,no-resolve', 'IP-CIDR6,2001:db8::/32,no-resolve'],
      },
    })],
  })
  const readable = await readFile(join(outDir, 'mixed.txt'), 'utf8')
  assert.deepEqual(new Set((await readFile(join(outDir, 'mixed-domain.txt'), 'utf8')).trim().split('\n')), new Set([
    'api.example.com',
    '+.example.org',
    '.children.test',
    '*.single.test',
    '+.stun.*.*',
    'mijia cloud',
  ]))
  const patterns = readable.trim().split('\n').filter(line => line.startsWith('DOMAIN-REGEX,')).map(line => new RegExp(line.slice('DOMAIN-REGEX,'.length)))
  assert(patterns.some(pattern => pattern.test('nested.host.children.test')))
  assert(patterns.some(pattern => pattern.test('host.single.test')))
  assert(!patterns.some(pattern => pattern.test('children.test')))
  assert(!patterns.some(pattern => pattern.test('nested.host.single.test')))
  assert(patterns.some(pattern => pattern.test('stun.example.org')))
  assert(patterns.some(pattern => pattern.test('global.stun.example.org')))
  assert(!patterns.some(pattern => pattern.test('stun.org')))
  for (const behavior of ['domain', 'ipcidr'] as const) {
    const file = result.rulesets[0].files[behavior]
    assert(file?.mrs)
    assert((await readFile(join(outDir, file.mrs))).length > 0)
    const decoded = join(outDir, `decoded-${behavior}.txt`)
    await promisify(execFile)(process.env.MIHOMO_BIN!, ['convert-ruleset', behavior, 'mrs', join(outDir, file.mrs), decoded])
    const actual = (await readFile(decoded, 'utf8')).trim().split('\n').sort()
    const expected = (await readFile(join(outDir, file.text), 'utf8')).trim().split('\n').sort()
    assert.deepEqual(actual, expected)
  }
  assert.equal(await readFile(join(outDir, 'mixed-classical.txt'), 'utf8'), 'PROCESS-NAME,curl\n')
})
