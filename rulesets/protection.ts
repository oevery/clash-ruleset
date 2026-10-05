import type { Rule } from '../src/index.ts'
import { isIP } from 'node:net'
import { defineRuleset } from '../src/index.ts'
import { blackmatrix, noCoin, sukka, urlhaus } from './upstreams.ts'

// 安全/广告仅拦截域名，不把来源中的 IP 字面量、关键词或逻辑规则带入。
function domainOnly(rule: Rule): boolean {
  return rule.behavior === 'domain' && !isIP(rule.value.replace(/^\+\./, ''))
}

export const security = defineRuleset('security', {
  policy: '拦截防护',
  sources: [sukka('domainset/reject_phishing', 'domain'), urlhaus, noCoin],
  filter: domainOnly,
})

export const ads = defineRuleset('ads', {
  policy: '拦截防护',
  // Lite 排除独立 Privacy/Hijacking 列表；广告与追踪用途仍可能重叠。
  sources: [blackmatrix('AdvertisingLite/AdvertisingLite')],
  filter: domainOnly,
})
