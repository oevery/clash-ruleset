import type { Behavior } from '../src/index.ts'
import { fromUrl } from '../src/index.ts'

export function meta(name: string, behavior: 'domain' | 'ipcidr' = 'domain') {
  const directory = behavior === 'domain' ? 'geosite' : 'geoip'
  return fromUrl(`https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/${directory}/${name}.list`, { behavior, format: 'text' })
}

export function sukka(name: string, behavior: Behavior = 'classical') {
  return fromUrl(`https://ruleset.skk.moe/Clash/${name}.txt`, { behavior, format: 'text' })
}

export function blackmatrix(name: string) {
  return fromUrl(`https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/${name}.list`, { behavior: 'classical', format: 'text' })
}

export const shellCrashFakeip = fromUrl('https://raw.githubusercontent.com/juewuy/ShellCrash/dev/public/fake_ip_filter.list', { behavior: 'domain', format: 'text' })

// 独立安全名单，避免为恶意软件和挖矿防护引入综合追踪/隐私拦截包。
export const urlhaus = fromUrl('https://urlhaus-filter.pages.dev/urlhaus-filter-domains-online.txt', { behavior: 'domain', format: 'text' })
export const noCoin = fromUrl('https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/hosts.txt', { behavior: 'domain', format: 'hosts' })
