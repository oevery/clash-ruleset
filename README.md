# mihomo-config

面向 Mihomo 的个人分流配置与 TypeScript 规则构建器。聚合 MetaCubeX、Sukka、blackmatrix 等上游，结合个人补充，生成独立规则集与完整配置。

- 域名和 IP 优先输出 MRS，进程、关键词、ASN 和逻辑规则保留 classical。
- 分类统一维护来源、增删规则与目标策略，自动生成 Provider 和路由。
- 客户端不依赖 GEOSITE/GEOIP 数据库；ASN 规则仍可能触发 Mihomo 下载 ASN 数据库。

## 使用配置

本项目面向 Mihomo，不保证兼容其他 Clash 内核。配置使用 YAML 合并键与 MRS 等能力，使用前请在目标客户端验证。

1. 从主分支取得 `config/config.yaml`，作为自己的配置副本。
2. 替换订阅示例地址和 `CHANGE_ME`，按设备需求检查 DNS、TUN 与控制接口设置。不要把订阅凭据提交到公开仓库。
3. 确认配置引用的 `release` 规则已发布且下载地址可访问，再导入客户端。
4. 选择节点和业务出口。默认“兜底”为直连；日常设备可切换为代理，路由器按需保留直连。

“国外媒体”默认跟随“代理”，可手动固定到某个地区。媒体规则包含影音、播客及平台配套服务，部分进程规则会分流整个应用，不仅是播放请求；路由器不能依赖它们识别客户端应用。配置检查或节点连通不代表媒体解锁、AI 服务可用或真实设备验收。

主分支保存源码和完整配置，`release` 分支仅发布规则及 `manifest.json`。只使用规则集时，参考 `config/routing.yaml` 的 Provider 定义，并将目标策略改为自己的策略组名称。

## 本地构建

需要 Node.js 24+ 和 `package.json` 指定的 pnpm。构建默认生成 MRS，首次需要时会从官方 Release 下载 Mihomo 到项目 `.tools/`，后续复用缓存，不修改系统安装。自动下载支持 macOS/Linux x64、arm64；其他平台请设置 `MIHOMO_BIN`。

```sh
pnpm install
cp .env.example .env
pnpm run build
pnpm run check
pnpm run config:test
```

完整构建下载上游并生成 `.output/`，再生成 `config/routing.yaml` 和 `config/config.yaml`。修改分类后，应同步维护这两个生成文件，不手工编辑它们。

### 环境变量

脚本通过 dotenv 自动读取仓库根目录的 `.env`，不依赖启动目录；文件不存在时继续使用默认配置。优先级为 shell / CI 环境变量 > `.env` > 默认值，不展开变量引用。`.env` 不提交，共享配置示例放在 `.env.example`。

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `MIHOMO_BIN` | 自动管理项目缓存 | 显式指定程序路径或 PATH 中的命令；无效时报错，不回退下载 |
| `MIHOMO_VERSION` | `latest` | 首次下载稳定版，或固定 `vX.Y.Z`；设置 `MIHOMO_BIN` 时忽略 |
| `MRS` | `true` | 设为 `false` 时只生成文本规则，配置同步引用文本分区 |
| `RULESET_BASE_URL` | 下方镜像前缀 | 完整构建时写入规则 Provider 的地址前缀 |
| `RULESET_DIR` | 未设置 | `config:test` 使用的本地规则目录，不改变构建输出位置 |

`.env.example` 将 `RULESET_DIR` 设为 `.output`，方便构建后验证。`MIHOMO_BIN` 相对路径以仓库根目录为基准；纯命令名从 PATH 查找。

### Mihomo 缓存与更新

```sh
pnpm mihomo          # 准备内核，已有匹配缓存则复用
pnpm mihomo --force  # 重新下载并替换项目缓存
```

`latest` 不会在每次构建时联网检查更新；`--force` 重新查询最新稳定版，固定版本时只重装该版本。缓存按系统、架构和版本选项隔离。下载核对官方 SHA-256 摘要并执行 `mihomo -v`，全部成功后才替换缓存；失败保留原文件并报错。旧 Release 缺少摘要时拒绝自动安装，可自行验证后使用 `MIHOMO_BIN`。

`--force` 不覆盖 `.env`、系统内核或外部文件；已指定 `MIHOMO_BIN` 时会拒绝强制更新。下载使用独立临时目录，验证后原子替换缓存，不使用持久锁。并发调用可能重复下载，但不会暴露半成品；中断后可直接重试，旧版残留锁目录也不再阻塞下载。

默认规则地址前缀：

```text
https://gh.oevery.me/raw.githubusercontent.com/oevery/mihomo-config/release/
```

切换直连、其他镜像或自托管地址：

```sh
RULESET_BASE_URL=https://raw.githubusercontent.com/oevery/mihomo-config/release/ MIHOMO_BIN=/absolute/path/to/mihomo pnpm run build
```

`RULESET_BASE_URL` 允许省略末尾 `/`；未设置或留空使用默认值。只接受不含凭据、查询参数和片段的 HTTP(S) 目录地址。它不是客户端运行时变量，`config:build` 不会更新前缀。GitHub Actions 可通过同名仓库变量覆盖。

无需 Mihomo 的文本构建使用 `MRS=false pnpm run build`；恢复 MRS 引用需重新执行默认构建。

### 常用命令与验证

| 命令 | 作用 |
| --- | --- |
| `pnpm run build` | 下载规则，生成分区、路由和完整配置 |
| `pnpm run config:build` | 仅组合配置片段，适合修改订阅、基础设置或策略组后运行 |
| `pnpm run check` | 类型检查、ESLint、配置一致性检查和行为测试 |
| `pnpm run config:check` | 检查完整配置与片段是否一致，以及 DNS Provider 引用 |
| `pnpm run config:test` | 使用 Mihomo `-t` 检查完整配置 |

行为测试使用本地 HTTP 服务或模拟下载响应，不访问真实上游；设置 `MIHOMO_BIN` 后还会实际生成并反解 MRS。普通测试、lint、类型检查和配置拼装不自动下载内核；`build` 仅在生成 MRS 时准备内核，`config:test` 总会准备内核。

`config:test` 设置 `RULESET_DIR=.output` 时，仅在临时副本中将规则 Provider 替换为本地文件，避免依赖尚未发布的规则；未设置时保留原始 HTTP 配置。它不替代远程地址可用性、节点或客户端验收。

## 分类与分流

以下顺序对应 `rulesets/index.ts` 中的实际路由顺序，不按名称排序：

| 分类 | 主要内容 | 策略 |
| --- | --- | --- |
| `direct` | Private、Tracker、个人直连及进程规则 | 直连 |
| `ai` | MetaCubeX AI / Apple Intelligence、Sukka AI 与语音 IP | AI |
| `domestic_services` | Apple / Microsoft 国内服务、国内游戏下载和 CDN 例外 | 国内 |
| `speedtest` | MetaCubeX Speedtest | 测速 |
| `game_download` | 海外游戏下载资源 | 游戏下载 |
| `global_media` | Sukka stream、MetaCubeX Netflix IP、blackmatrix Hulu | 国外媒体 |
| `telegram` | Telegram 域名和 IP | Telegram |
| `apple` / `microsoft` | 各平台域名 | Apple / Microsoft |
| `proxy` | MetaCubeX gfw 与个人补充 | 代理 |
| `domestic` | MetaCubeX cn 域名、CN IP 与个人补充 | 国内 |
| `fakeip_filter` | Meta private、ShellCrash 兼容补充与个人域名 | 仅 DNS |

每个业务分类按 domain → classical → ip 相邻排列，最后为 `MATCH,兜底`。默认不加载广告列表，也不设独立 CDN 分类；专属资源跟随业务，其余请求继续匹配后续规则。

`global_media` 以 Sukka 的 `non_ip/stream` 和 `ip/stream` 为主，Netflix IP 与 Hulu 补充覆盖，不额外合并 GlobalMedia 等大型聚合。保留包括 `PROCESS-NAME,music`、`PROCESS-NAME,tv` 在内的平台进程规则。不同平台需要同时使用不同地区时，应增加前置的平台分类与策略组。

`noResolve` 默认 `true`，为 classical/IP 路由追加 `no-resolve`；domain 不追加。`domestic` 显式设为 `false`，允许末尾国内 IP 规则主动解析以补漏。简单 IP 规则内部的 `no-resolve` 会被移除，交给外层路由控制；复杂逻辑内部的规则保持不变。

## 自定义规则

修改 `rulesets/` 中对应分类；新增分类后在 `rulesets/index.ts` 中安排路由位置。

分类名还需避免产物重名：例如 `demo` 与 `demo-domain` 不能共存，因为完整集合和域名分区都会使用 `demo-domain.txt`。构建前会预留所有分区文件名并检查冲突，即使某个分区当前为空也不例外。

```ts
import { defineRuleset, fromUrl } from './src/index.ts'

const example = defineRuleset('example', {
  policy: '代理',
  sources: [
    fromUrl('https://example.org/domains.list', { behavior: 'domain', format: 'text' }),
  ],
  remove: {
    domain: ['+.example.com'],
  },
  add: {
    domain: ['+.ai.example.com', 'api.example.net'],
    classical: ['PROCESS-NAME,curl'],
  },
})
```

示例先移除上游中属于 `example.com` 的规则，再补回 `ai.example.com` 及其子域。该分类需加入构建列表才会生效。`add` / `remove` 条目按 A–Z 排列，方便维护。

### 处理顺序与边界

1. 统一规范化 `sources`、`remove` 和 `add`。
2. 对上游应用 `remove`，再合并 `add`。
3. 应用公共过滤与分类 `filter`，组内覆盖去重、排序并分区输出。

`add` 可以补回本分类被移除的规则，但仍受过滤约束；它不获得跨分类优先级。跨分类始终按路由顺序匹配。公共来源标记在 `rulesets/index.ts` 手动维护，不自动追踪上游标记变化。

| 输入 | 规范化 / 删除语义 |
| --- | --- |
| `DOMAIN,example.com` | 转为 domain 精确规则 `example.com` |
| `DOMAIN-SUFFIX,example.com` | 转为 `+.example.com`，覆盖根域及子域 |
| `.example.com` | 仅子域，不包含根域 |
| `*.example.com` | 仅一层子域 |
| 普通 CIDR | 规范化网络地址与 IPv6 写法；删除同地址族中被完整包含的网段 |
| 关键词、正则、进程、逻辑及特殊参数规则 | 保留 classical；仅按规范化文本精确删除 |

`remove` 只删除被完整覆盖的条目，不从父域或大网段中挖除例外。保留父域但让部分子域走其他策略，应增加前置路由。未命中的删除项允许存在，非法规则会中止构建。不跨分类去重，不推断正则或逻辑规则的语义等价，也不将 IPv4-mapped IPv6 当作 IPv4。

来源支持 `domain` / `ipcidr` / `classical` 和 `text` / `yaml`；YAML 使用字符串 `payload` 数组。输入格式不决定最终分区。高级 `filter` / `sort` 接收规范化的 `Rule`，通过 `behavior` 区分类别；`value` 是分区值，`text` 是完整 classical 文本，只有 classical 提供 `type` / `options`。完整接口见 `src/types.ts`。

## 目录与产物

```text
config/           # 配置片段与生成的完整配置
rulesets/         # 分类、上游、自定义规则与路由顺序
src/              # 规则构建器；config/ 子目录负责配置生成与验证
scripts/          # 命令入口，仅编排任务
  lib/            # 脚本共享逻辑：dotenv 加载与 Mihomo 下载缓存
test/             # 行为测试
.output/          # 生成规则，不手工维护
.tools/           # 自动下载的本地内核，不提交
```

`scripts/` 负责环境加载、工具准备与命令编排，`src/` 保留规则构建及配置处理，不自动加载 `.env` 或下载内核。`rulesets/` 存放业务分类，`config/` 只存放 YAML；当前规模下测试保持在 `test/` 平铺，避免增加不必要的目录层级。

配置按 `providerset.yaml` → `header.yaml` → `proxyset.yaml` → `routing.yaml` 合成 `config.yaml`，保留 YAML 锚点、别名及合并引用：

- `providerset.yaml`：订阅 Provider 示例。
- `header.yaml`：基础参数、DNS、TUN。
- `proxyset.yaml`：业务与地区策略组。
- `routing.yaml`：根据实际规则分区自动生成。

以 AI 分类为例：

```text
.output/
├── manifest.json
├── ai.txt             # 完整 classical 集合
├── ai-domain.txt
├── ai-domain.mrs
├── ai-ip.txt
├── ai-ip.mrs
└── ai-classical.txt    # 无法转为 domain/IP 的剩余规则
```

空分区不输出，Provider 仅引用实际存在的分区。`ai.txt` 与拆分分区是替代关系，不应同时加载；单独引用完整 classical 集合时需自行设置外层 `no-resolve`。原生域名通配模式在完整集合中用等价 `DOMAIN-REGEX` 表达，不扩大为后缀匹配。

规则输出全部成功后才替换 `.output/`，规则构建失败保留上一版；成功构建会移除过时分类。构建器拒绝覆盖工作目录、父目录或非本工具生成的非空目录。同一 URL 每次构建只下载一次，不维护上游快照。

## CI 与发布

`.github/workflows/build.yml` 在主分支推送、PR、每日定时及手动触发时运行：安装依赖，通过同一个 `pnpm mihomo` 入口准备内核，执行检查、构建及基于本地产物的配置验证，然后上传规则产物。可用仓库变量 `MIHOMO_VERSION` 固定版本；准备命令通过 `GITHUB_ENV` 向后续步骤传递内核路径，确保 MRS 集成测试实际运行。

PR 不发布；其他触发成功后更新 `release` 分支，无变化不提交，不强推历史。上游下载、转换或配置验证失败不会发布。CI 不自动提交主分支的生成配置；修改分类或分区后，需本地构建并同步配置。

### 旧配置迁移

- 仓库由 `clash-ruleset` 更名为 `mihomo-config`：更新客户端规则地址前缀。
- `media-*` / `global_stream-*` 统一为 `global_media-*`，策略名称为“国外媒体”：同步修改 Provider 名称、URL、缓存路径和路由引用。
- `my_plus` 已合并到 `domestic`，使用可切换的“国内”策略；“其他”策略已更名为“兜底”。

不生成旧名兼容产物。先确认新规则已发布，再更新客户端；策略组改名后可能需要重新选择出口。

## 上游与许可

规则来源包括 MetaCubeX/meta-rules-dat、Sukka Ruleset、blackmatrix7/ios_rule_script 和 juewuy/ShellCrash；具体地址集中在 `rulesets/upstreams.ts`。

本仓库许可证见 `LICENSE`（AGPL-3.0）。引用与分发上游规则时，仍需遵守各来源的许可和署名要求。
