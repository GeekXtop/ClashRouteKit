# 2026-10-19 修发布链 + 写冲突防护

- 会话：ZCode session（本仓库工作树）；深度流程批次，spec 见 `docs/superpowers/specs/2026-10-19-publish-chain-and-write-conflict-design.md`，plan 见 `docs/superpowers/plans/2026-10-19-publish-chain-and-write-conflict.md`。
- 任务：① 修复断四周的发布链（routes.yaml 入库、git-commit stage 路径、example 升 v2、freshness 门禁）；② PUT baseMtime 冲突检测 + `.list` 原子写；③ 文档修正。
- 状态：**已完成并推送**。提交链 da76232(spec) → fd6b3b0(plan) → f42c2a5(发布链) → 01a0d23(baseMtime) → b1905d6(原子写) → 4d82f5f(docs) → 7d4d821(cli 测试断言补交) → f69a85f(终审修复：冲突挂起)。全量 601/601 绿、typecheck/build 绿；CI 39190211643 绿，publish 分支更新至 7fcea48（设备恢复更新）。
- 关键决策：routes.yaml 入库 main（用户拍板）；baseMtime 严格模式；终审 Important 两项（409 无限重试循环 + App 级测试缺席）已按 TDD 修复（appConflictFlow.test.tsx 先红后绿）。
- 边界（后续批次候选）：连接校验中间件（Origin/Host/token）、命中模拟器、注释保真（parseDocument）、语义化 id、终审 deferred minors（TOCTOU 注释、mtime 回落、spec 409 体勘误、spy restore、旧 bundle 提示文案）。
- 经验候选（供 `$obclose` 评估入 lessons）：① 从 apps/web cwd 调 vitest 会被无 test 段的 apps/web/vite.config.ts 遮蔽根配置 → setupFiles 不生效 → matchMedia 类假失败；web 测试一律从仓库根跑 `pnpm test`。② 本 vitest 5 配置下 vi.mock 对相对路径源码模块未生效，`vi.spyOn(模块命名空间)` 可替代（保留原实现透传）。
