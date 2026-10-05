import { defineRuleset } from '../src/index.ts'
import { blackmatrix, meta, sukka } from './upstreams.ts'

export const ai = defineRuleset('ai', {
  policy: 'AI',
  sources: [
    meta('category-ai-!cn'),
    meta('apple-intelligence'),
    sukka('non_ip/ai'),
    sukka('ip/ai'),
  ],
  // 不把通用 GitHub API、云托管或整个平台及其资源域划入 AI。
  remove: {
    domain: [
      '+.api.github.com',
      '+.envato-static.com',
      '+.envato.com',
      '+.envato.market',
      '+.envatousercontent.com',
      '+.nvidia.com',
      '+.onrender.com',
      '+.themeforest.net',
    ],
  },
  add: { domain: ['+.api.bingyun.vip'] },
})

export const speedtest = defineRuleset('speedtest', {
  policy: '测速',
  sources: [meta('speedtest')],
})

export const gameDownload = defineRuleset('game_download', {
  policy: '游戏下载',
  sources: [sukka('domainset/game-download', 'domain')],
})

// 为海外影音及相关媒体服务独立选择地区出口，不承担通用海外代理补漏。
export const globalMedia = defineRuleset('global_media', {
  policy: '国外媒体',
  sources: [
    // 保留上游 tv / music 及其他平台进程规则。
    sukka('non_ip/stream'),
    sukka('ip/stream'),
    // Sukka IP 并非现有 Netflix 网段的完整替代，保留补充。
    meta('netflix', 'ipcidr'),
    // 补充 Hulu 日本服务和专属 CDN，不引入 blackmatrix GlobalMedia 聚合。
    blackmatrix('Hulu/Hulu'),
  ],
})

export const telegram = defineRuleset('telegram', {
  policy: 'Telegram',
  sources: [meta('telegram'), meta('telegram', 'ipcidr')],
})

export const apple = defineRuleset('apple', {
  policy: 'Apple',
  sources: [meta('apple')],
})

export const microsoft = defineRuleset('microsoft', {
  policy: 'Microsoft',
  sources: [meta('microsoft')],
})
