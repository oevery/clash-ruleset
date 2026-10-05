import { defineRuleset } from '../src/index.ts'
import { meta } from './upstreams.ts'

export const proxy = defineRuleset('proxy', {
  policy: '代理',
  sources: [meta('gfw')],
  add: {
    domain: [
      '+.alpinelinux.org',
      '+.aproplus.top',
      '+.fc2club.top',
      '+.fc2hub.com',
      '+.freejavbt.com',
      '+.grafana.com',
      '+.jellyfin.org',
      '+.openmediavault.org',
      '+.tinymediamanager.org',
      '+.tmdb.org',
    ],
  },
})
