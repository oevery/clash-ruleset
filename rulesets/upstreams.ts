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
