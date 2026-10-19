# 2026-10-19 修发布链 + 写冲突防护

- 会话：ZCode session（本仓库工作树）；深度流程批次，spec 见 `docs/superpowers/specs/2026-10-19-publish-chain-and-write-conflict-design.md`。
- 任务：① 修复断四周的发布链（routes.yaml 入库、git-commit stage 路径、example 升 v2、freshness 门禁）；② PUT baseMtime 冲突检测 + `.list` 原子写。
- 状态：spec 已写待用户评审；plan 未开始。
- 关键决策：用户 2026-10-19 拍板 routes.yaml 入库 main（隐私面已核：22 URL 全公开，publish 分支早已公开同等内容）；baseMtime 严格模式。
- 拟涉及文件：`.gitignore`、`config/routes.yaml`（入库）、`config/routes.yaml.example`、`.github/workflows/publish.yml`（不动，兜底保留）、`packages/local-server/src/git/gitActions.ts`、`packages/local-server/src/config/configRepository.ts`、`packages/local-server/src/rules/ruleFiles.ts`、`apps/web/src/v2/v2Project.ts` 及保存调用点、`apps/cli/tests/configExamples.test.ts`（新增）、README / AGENTS.md / CLAUDE.md。
- 边界：命中模拟器、连接校验中间件、注释保真、语义化 id 均为后续批次。工作树有他人在途改动（package.json、pnpm-lock.yaml、.claude/settings.json），文件集零重叠，显式路径提交。
