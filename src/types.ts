export type Behavior = 'domain' | 'ipcidr' | 'classical'
export type SourceFormat = 'text' | 'yaml'

export interface Source {
  readonly url: string
  readonly behavior: Behavior
  readonly format: SourceFormat
}

interface BaseRule {
  readonly value: string
  /** 等价的 classical 可读文本，用于排序和完整输出。 */
  readonly text: string
}

export interface DomainRule extends BaseRule {
  readonly behavior: 'domain'
}

export interface IpCidrRule extends BaseRule {
  readonly behavior: 'ipcidr'
}

export interface ClassicalRule extends BaseRule {
  readonly behavior: 'classical'
  readonly type: string
  readonly options: readonly string[]
}

/** value 使用所属分区的规范格式，与输入来源格式无关。 */
export type Rule = DomainRule | IpCidrRule | ClassicalRule

export type RuleEntries = Partial<Record<Behavior, readonly string[]>>

export interface RulesetOptions {
  /** 配置生成器使用；不指定时仅输出规则，例如 DNS 专用集合。 */
  policy?: string
  /** 默认 true；控制 classical/IP 的 RULE-SET 是否禁止主动解析。 */
  noResolve?: boolean
  sources?: readonly Source[]
  /** 删除上游后再补充；仍参与公共过滤、去重和排序。 */
  add?: RuleEntries
  /** 只删除上游中被完整覆盖的规则；复杂规则按规范化条目精确删除。 */
  remove?: RuleEntries
  filter?: (rule: Rule) => boolean
  sort?: (a: Rule, b: Rule) => number
}

export interface Ruleset extends RulesetOptions {
  readonly name: string
}

export interface BuildOptions {
  rulesets: readonly Ruleset[]
  outDir?: string
  /** 默认生成 MRS；设为 false 时不需要 Mihomo。 */
  mrs?: boolean
  /** Mihomo 可执行文件路径，默认使用 PATH 中的 mihomo。 */
  mihomo?: string
  timeoutMs?: number
}

export interface RulesetFile {
  behavior: Behavior
  count: number
  text: string
  mrs?: string
}

export interface RulesetOutput {
  name: string
  count: number
  /** 完整集合，使用 classical 可读语法。 */
  readable: string
  files: Partial<Record<Behavior, RulesetFile>>
}

export interface BuildResult {
  outDir: string
  rulesets: RulesetOutput[]
}
