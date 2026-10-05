import type { Rule } from '../src/index.ts'
import { direct, domestic, domesticServices, fakeipFilter } from './local.ts'
import { proxy } from './proxy.ts'
import { ai, apple, gameDownload, globalMedia, microsoft, speedtest, telegram } from './services.ts'

// 手动维护来源标记域或专用后缀，同时排除它们的子域。
const sourceMarkers = [
  '5ukk4w.skk.moe',
  '7h1s_rul35et_i5_mad3_by_5ukk4w-ruleset.skk.moe',
  'th1s_rule5et_1s_m4d3_by_5ukk4w_ruleset.skk.moe',
  'this_ruleset_is_made_by_sukkaw.ruleset.skk.moe',
]

function keepSourceRule(rule: Rule): boolean {
  const domain = rule.value.toLowerCase().replace(/\.$/, '')
  return !sourceMarkers.some(marker => domain === marker || domain.endsWith(`.${marker}`))
}

// 分类顺序即路由顺序，不按名称排序；各分类内先 remove 再 add。
const rulesets = [
  direct,
  ai,
  domesticServices,
  speedtest,
  gameDownload,
  globalMedia,
  telegram,
  apple,
  microsoft,
  proxy,
  domestic,
  fakeipFilter,
]

export default rulesets.map(ruleset => ({
  ...ruleset,
  filter: (rule: Rule) => keepSourceRule(rule) && (ruleset.filter?.(rule) ?? true),
}))
