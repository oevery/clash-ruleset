import process from 'node:process'
import rulesets from '../rulesets/index.ts'
import { buildConfig } from '../src/config/build.ts'
import { normalizeRulesetBaseUrl, writeRouting } from '../src/config/routing.ts'
import { build } from '../src/index.ts'
import { ensureMihomo } from './lib/mihomo.ts'
import './lib/env.ts'

const baseUrl = normalizeRulesetBaseUrl(process.env.RULESET_BASE_URL)
const result = await build({
  rulesets,
  mihomo: process.env.MRS === 'false' ? undefined : await ensureMihomo(),
  mrs: process.env.MRS !== 'false',
})

writeRouting(result, rulesets, baseUrl)
await buildConfig()

for (const ruleset of result.rulesets)
  console.log(`${ruleset.name}: ${ruleset.count} rules → ${result.outDir}/${ruleset.readable}`)
