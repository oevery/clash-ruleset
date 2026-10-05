import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import composeConfig from './compose.ts'

export function checkConfig(directory = new URL('../../config/', import.meta.url)): void {
  const actual: {
    'dns'?: { 'nameserver-policy'?: Record<string, unknown>, 'fake-ip-filter'?: readonly string[] }
    'rule-providers'?: Record<string, unknown>
  } = parse(readFileSync(new URL('config.yaml', directory), 'utf8'), { merge: true })
  assert.deepEqual(actual, composeConfig(directory).toJS(), 'config/config.yaml is out of date; run pnpm config:build')
  const selectors = [...Object.keys(actual.dns?.['nameserver-policy'] ?? {}), ...(actual.dns?.['fake-ip-filter'] ?? [])]
  for (const selector of selectors) {
    if (!selector.startsWith('rule-set:'))
      continue
    for (const name of selector.slice('rule-set:'.length).split(','))
      assert(Object.hasOwn(actual['rule-providers'] ?? {}, name.trim()), `Missing DNS ruleset: ${name.trim()}`)
  }
}
