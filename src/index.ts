import type { Ruleset, RulesetOptions, Source } from './types.ts'

export { build } from './build.ts'
export type * from './types.ts'

export function fromUrl(url: string, options: Omit<Source, 'url'>): Source {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('Rule sources must use HTTP or HTTPS')
  return { url, ...options }
}

export function defineRuleset(name: string, options: RulesetOptions): Ruleset {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(name))
    throw new Error('Ruleset names may contain lowercase letters, digits, underscores and hyphens')
  return { name, ...options }
}
