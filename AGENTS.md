# 项目协作约定

- 不手改 `config/routing.yaml` 和 `config/config.yaml`；修改源规则或配置片段后，通过构建同步生成文件。
- `rulesets/index.ts` 的分类顺序决定路由优先级，不能按名称排序；仅 add/remove 条目按 A–Z 排列。
- 保持先规范化、再 remove、再 add；add 不获得跨分类优先级，子域分流例外使用前置路由。
- 环境加载与内核下载留在 `scripts/`，不引入 `src/` 的隐式副作用。
- 代码修改运行 `pnpm check`；规则或配置变更还需构建并执行 `RULESET_DIR=.output pnpm config:test`。命令区别见 README.md。
- 项目注释和提交说明使用中文，提交沿用 Conventional Commits。
