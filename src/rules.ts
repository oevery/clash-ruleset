import type { Behavior, ClassicalRule, DomainRule, IpCidrRule, Rule, RuleEntries, Source } from './types.ts'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import { parse } from 'yaml'

const compoundTypes = new Set(['AND', 'OR', 'NOT', 'SUB-RULE'])

function classicalRule(type: string, value: string, options: readonly string[] = []): ClassicalRule {
  if (!value)
    throw new Error(`Empty value for ${type}`)
  return { behavior: 'classical', type, value, options, text: [type, value, ...options].join(',') }
}

// 原生模式只包含逐标签的 *，以及开头的 . / +.；不解释任意正则。
function domainPattern(value: string) {
  const recursive = value.startsWith('.') || value.startsWith('+.')
  const base = value.replace(/^\+?\./, '')
  const labels = base.split('.')
  return { labels, recursive, minimum: labels.length + (value.startsWith('.') ? 1 : 0) }
}

function parseDomain(input: string): DomainRule {
  const value = input.toLowerCase().replace(/\.$/, '')
  const { labels } = domainPattern(value)
  // Mihomo 允许 Mijia Cloud 等内部含空格的 fake-IP 条目，不按 DNS hostname 限制字符。
  if (!value || /[,\r\n]/.test(value) || labels.some(label => !label || label.includes('+') || (label.includes('*') && label !== '*')))
    throw new Error(`Invalid domain pattern: ${input}`)
  let text: string
  if (!value.includes('*') && !value.startsWith('.')) {
    text = value.startsWith('+.') ? `DOMAIN-SUFFIX,${value.slice(2)}` : `DOMAIN,${value}`
  }
  else {
    const prefix = value.startsWith('+.') ? '(?:.+\\.)?' : value.startsWith('.') ? '.+\\.' : ''
    const regex = labels.map(label => label === '*' ? '[^.]+' : RegExp.escape(label)).join('\\.')
    text = `DOMAIN-REGEX,^${prefix}${regex}$`
  }
  return { behavior: 'domain', value, text }
}

function parseCidr(value: string): IpCidrRule {
  const [address, prefix, extra] = value.split('/')
  const version = isIP(address)
  if (!version || address.includes('%') || extra !== undefined || !/^\d+$/.test(prefix ?? '') || Number(prefix) > (version === 4 ? 32 : 128))
    throw new Error(`Invalid CIDR: ${value}`)
  const cidr = `${address}/${Number(prefix)}`
  const network = version === 4 ? ipaddr.IPv4.networkAddressFromCIDR(cidr) : ipaddr.IPv6.networkAddressFromCIDR(cidr)
  const normalized = `${network.toString()}/${Number(prefix)}`
  return { behavior: 'ipcidr', value: normalized, text: (version === 4 ? 'IP-CIDR,' : 'IP-CIDR6,') + normalized }
}

export function parseRule(line: string, behavior: Behavior): Rule {
  if (behavior === 'domain')
    return parseDomain(line)
  if (behavior === 'ipcidr')
    return parseCidr(line)

  const separator = line.indexOf(',')
  const type = line.slice(0, separator).trim().toUpperCase()
  if (separator < 1 || !/^[A-Z][A-Z0-9-]*$/.test(type))
    throw new Error('Expected a classical rule with type and value')
  const rest = line.slice(separator + 1).trim()
  if (compoundTypes.has(type))
    return classicalRule(type, rest)
  const [value, ...options] = rest.split(',').map(part => part.trim())
  if (type === 'IP-CIDR' || type === 'IP-CIDR6') {
    const cidr = parseCidr(value)
    if (!cidr.text.startsWith(`${type},`))
      throw new Error(`Address family does not match ${type}`)
    // 简单 IP 的解析策略交给外层 RULE-SET；其他参数不丢弃、不混入纯 IP 分区。
    const retained = options.filter(option => option !== 'no-resolve')
    return retained.length ? classicalRule(type, cidr.value, retained) : cidr
  }
  if (type === 'DOMAIN' || type === 'DOMAIN-SUFFIX') {
    const normalized = value.toLowerCase().replace(/\.$/, '')
    // classical 字面量不能被误解释为原生通配模式。
    if (!options.length && normalized && !/[+*]/.test(normalized) && !normalized.startsWith('.'))
      return parseDomain((type === 'DOMAIN-SUFFIX' ? '+.' : '') + normalized)
    return classicalRule(type, normalized, options)
  }
  return classicalRule(type, value, options)
}

export function parseEntries(entries: RuleEntries | undefined, name: string, operation: 'add' | 'remove'): Rule[] {
  return (['domain', 'ipcidr', 'classical'] as const).flatMap(behavior =>
    (entries?.[behavior] ?? []).map((line, index) => {
      try {
        return parseRule(line.trim(), behavior)
      }
      catch (cause) {
        throw new Error(`Invalid ${name}.${operation}.${behavior} entry ${index + 1}`, { cause })
      }
    }),
  )
}

export function parseSource(content: string, source: Pick<Source, 'behavior' | 'format'>): Rule[] {
  let lines: string[]
  if (source.format === 'yaml') {
    const document: unknown = parse(content)
    const payload = document && typeof document === 'object' && 'payload' in document ? document.payload : undefined
    if (!Array.isArray(payload) || !payload.every(item => typeof item === 'string'))
      throw new Error('YAML source must contain a string payload array')
    lines = payload
  }
  else {
    lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  }
  return lines.map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('//'))
    .map((line) => {
      try {
        return parseRule(line, source.behavior)
      }
      catch (cause) {
        throw new Error(`Invalid ${source.behavior} entry: ${line}`, { cause })
      }
    })
}

function coversDomain(container: string, candidate: string): boolean {
  const outer = domainPattern(container)
  const inner = domainPattern(candidate)
  if (inner.minimum < outer.minimum || (!outer.recursive && (inner.recursive || inner.minimum !== outer.minimum)))
    return false
  // 从右向左证明每个固定标签都被覆盖；* 仅接受一个标签，前缀递归由长度约束处理。
  return outer.labels.every((label, index) => label === '*' || label === inner.labels[inner.labels.length - outer.labels.length + index])
}

export function removeRules(rules: readonly Rule[], removals: readonly Rule[]): Rule[] {
  const exact = new Set(removals.map(rule => rule.text))
  const domains = removals.filter(rule => rule.behavior === 'domain').map(rule => rule.value)
  const networks = removals.filter(rule => rule.behavior === 'ipcidr').map(rule => ipaddr.parseCIDR(rule.value))
  return rules.filter((rule) => {
    if (exact.has(rule.text))
      return false
    if (rule.behavior === 'domain')
      return !domains.some(domain => coversDomain(domain, rule.value))
    if (rule.behavior === 'ipcidr' && networks.length) {
      const [address, prefix] = ipaddr.parseCIDR(rule.value)
      return !networks.some(([network, mask]) => network.kind() === address.kind() && prefix >= mask && address.match(network, mask))
    }
    return true
  })
}

export function deduplicateRules(rules: readonly Rule[]): Rule[] {
  const byText = new Map<string, Rule>()
  for (const rule of rules) {
    if (!byText.has(rule.text) || rule.behavior === 'domain')
      byText.set(rule.text, rule)
  }
  const unique = [...byText.values()]
  const suffixes = new Set(unique
    .filter(rule => rule.behavior === 'domain' && rule.value.startsWith('+.') && !rule.value.includes('*'))
    .map(rule => rule.value.slice(2)))

  return unique.filter((rule) => {
    if (rule.behavior !== 'domain')
      return true
    const labels = rule.value.replace(/^\+?\./, '').split('.')
    // 后缀不能删除自身，其他域名模式可以被同级后缀完全覆盖。
    for (let start = rule.value.startsWith('+.') ? 1 : 0; start < labels.length; start++) {
      if (suffixes.has(labels.slice(start).join('.')))
        return false
    }
    return true
  })
}

export function renderRule(rule: Rule, behavior: Behavior): string {
  return behavior === 'classical' ? rule.text : rule.value
}
