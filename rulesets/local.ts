import { defineRuleset } from '../src/index.ts'
import { blackmatrix, meta, shellCrashFakeip, sukka } from './upstreams.ts'

export const direct = defineRuleset('direct', {
  policy: '直连',
  sources: [meta('private'), meta('private', 'ipcidr'), meta('tracker')],
  add: {
    domain: ['+.download.555mac.com', '+.homelab', '+.torrentmac.net'],
    classical: [
      'DOMAIN-KEYWORD,mac-torrent-download',
      'PROCESS-NAME,AdGuardHome',
      'PROCESS-NAME,easytier-core',
      'PROCESS-NAME,easytier-gui',
      'PROCESS-NAME,leigod',
      'PROCESS-NAME,leishenSdk',
      'PROCESS-NAME,nmap',
      'PROCESS-NAME,ToDesk',
      'PROCESS-NAME,ToDesk_Service',
    ],
  },
})

export const domesticServices = defineRuleset('domestic_services', {
  policy: '国内',
  sources: [
    meta('apple-cn'),
    meta('microsoft@cn'),
    meta('category-games@cn'),
    blackmatrix('Game/GameDownloadCN/GameDownloadCN'),
    sukka('domainset/apple_cdn', 'domain'),
    sukka('non_ip/apple_cn'),
    sukka('non_ip/microsoft_cdn'),
  ],
})

export const domestic = defineRuleset('domestic', {
  policy: '国内',
  noResolve: false,
  sources: [meta('cn'), meta('cn', 'ipcidr')],
  add: {
    domain: [
      '+.516200.xyz',
      '+.autocode.space',
      '+.g201.com',
      '+.oevery.me',
      '+.suanlba.dev',
      '+.sui-xiang.com',
      '+.xcode.best',
    ],
    ipcidr: ['142.252.102.74/32', '154.9.253.41/32'],
  },
})

export const fakeipFilter = defineRuleset('fakeip_filter', {
  sources: [meta('private'), shellCrashFakeip],
  add: { domain: ['+.516200.xyz', '+.homelab', '+.oevery.me'] },
})
