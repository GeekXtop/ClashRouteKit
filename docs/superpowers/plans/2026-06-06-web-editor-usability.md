# Web 编辑器可用性实施计划

> **给 agentic worker 的说明：** 必须按任务逐项执行本计划，并使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans。步骤使用 checkbox（`- [ ]`）语法追踪进度。

**目标：** 将当前本地 Web 控制台改造成可用的路由配置编辑器，能够安全编辑 `config/modules.yaml`、预览生成后的路由、保存前校验，并引导用户完成本地发布流程。

**架构：** 保持现有 local-first 模型：浏览器 UI 与 Vite dev server API 通信，`config/modules.yaml` 继续作为唯一事实来源。将 Web 应用重构为聚焦的功能模块，使用单一项目状态控制器，并围绕类型化的 `RouteKitProjectConfig` 变更构建编辑界面，而不是直接编辑原始 YAML。

**技术栈：** React 19、TypeScript、Vite、Vitest、`@clash-route-kit/core`、本地 Vite middleware、CSS modules 或结构化全局 CSS。

---

## 当前问题

- `apps/web/src/App.tsx` 目前约 700 行，在一个组件里同时承担布局、数据加载、本地操作、订阅、路由预览、面板和表单状态。
- 页面是拥挤的三列仪表盘，而不是编辑工作流。重要操作会与预览和详情面板争夺注意力。
- 目前只有模块启用/禁用可编辑。大部分事实来源字段仍然是只读的。
- 保存流程会重写 `config/modules.yaml`，但缺少清晰的 dirty 状态、差异预览和保存前诊断。
- 右侧栏混合了互不相关的概念：本地项目状态、模块详情、策略组和 provider 输出。
- 小屏幕下布局会退化，但仍然一次暴露过多内容。
- 还没有用于编辑模块、策略组、provider 引用、rule provider 或规则列表文件的一等模型。

## 产品方向

这应该成为一个聚焦的编辑器，而不是通用仪表盘。

主要心智模型是：

```text
项目状态 -> 模块 -> 策略 -> Rule providers -> 预览 -> 保存 -> 检查 -> 生成 -> 提交/推送
```

下一阶段不应尝试实现所有高级规则功能。它应该先把一条完整路径做可靠：

1. 加载本地 `config/modules.yaml`。
2. 通过表单编辑路由模块。
3. 看到路由顺序和 INI 预览同步更新。
4. 看到未保存修改和 YAML diff。
5. 保存前运行校验。
6. 保存本地配置。
7. 在同一个发布面板中运行 generate 和 Git 工作流。

## 信息架构

使用三区域应用壳：

- **左侧导航：** Project、Modules、Policy Groups、Rule Providers、Preview、Publish。
- **主工作区：** 当前选中的编辑器或预览。
- **检查器侧栏：** 上下文诊断、变更字段、选中项详情和保存就绪状态。

推荐第一版实现的视图：

- **Project：** 加载/保存状态、发布 URL、模板输出、当前分支提示。
- **Modules：** 列表、搜索、后续重排、模块编辑表单。
- **Preview：** 路由顺序表和 INI 预览 tabs。
- **Publish：** check、generate、Git status、commit、push、命令输出。

Policy Groups 和 Rule Providers 初期可以是只读摘要，并明确标注为“下一阶段”。在模块编辑稳定前，不要为它们构建半成品编辑器。

## 文件结构

- 创建 `apps/web/src/projectController.ts`
  负责项目加载/保存状态、dirty tracking、YAML 序列化和校验状态。
- 创建 `apps/web/tests/projectController.test.ts`
  覆盖 dirty 状态、保存就绪状态和配置变更行为。
- 创建 `apps/web/src/configMutations.ts`
  用于编辑 `RouteKitProjectConfig` 的纯函数：模块新增/更新/删除/切换、策略更新、标签列表更新、provider 引用。
- 创建 `apps/web/tests/configMutations.test.ts`
  覆盖不可变配置变更。
- 创建 `apps/web/src/components/AppShell.tsx`
  顶层布局和导航。
- 创建 `apps/web/src/components/ModuleEditor.tsx`
  单个选中模块的表单。
- 创建 `apps/web/src/components/ModuleList.tsx`
  可搜索模块列表，包含启用状态和选中项。
- 创建 `apps/web/src/components/PreviewWorkspace.tsx`
  路由顺序和 INI 预览。
- 创建 `apps/web/src/components/PublishPanel.tsx`
  Check/generate/git 工作流。
- 创建 `apps/web/src/components/InspectorPanel.tsx`
  诊断、dirty 状态、选中项摘要。
- 修改 `apps/web/src/App.tsx`
  缩减为组合、数据编排和视图选择。
- 修改 `apps/web/src/styles.css`
  将当前仪表盘布局替换为编辑器壳和响应式工作区。

## 任务 1：建立编辑器状态模型

- [x] 添加 `configMutations.ts`，提供纯不可变 helper：
  `updateModule`、`toggleModule`、`addModule`、`deleteModule`、`setModuleTags`、`setModuleProviderRefs`。
- [x] 在实现前为每个 helper 添加测试。
- [x] 添加 `projectController.ts`，用于 dirty tracking：
  原始 YAML/config、draft config、保存状态、上次校验输出、选中视图、选中模块 ID。
- [x] 添加 dirty 状态和保存就绪状态测试。
- [x] 保持所有函数独立于 React，便于测试。

验证：

```powershell
pnpm test -- apps/web/tests/configMutations.test.ts apps/web/tests/projectController.test.ts
pnpm typecheck
```

## 任务 2：将 App 拆成真实组件

- [x] 抽取 `AppShell`、`ModuleList`、`ModuleEditor`、`PreviewWorkspace`、`PublishPanel` 和 `InspectorPanel`。
- [x] 保持 `App.tsx` 少于 180 行。
- [x] 将订阅编辑器移入独立组件，或暂时放到次级视图中，避免与路由编辑竞争。
- [x] 移动代码时保留当前本地 API 行为。
- [x] 只为纯 helper 添加 smoke tests，暂不添加脆弱的 DOM 测试。

验证：

```powershell
pnpm test
pnpm typecheck
```

## 任务 3：构建模块编辑 MVP

- [x] 模块列表支持选择、启用/禁用和创建模块。
- [x] 模块编辑器支持：
  `id`、`policy`、`enabled`、`geosite`、`geoip` 和 provider 引用。
- [x] 标签输入使用换行或 chip 编辑，并序列化回数组。
- [x] Provider 引用编辑器支持 `behavior`、`file` 和可选 `interval`。
- [x] 删除模块需要 UI 中的确认机制。
- [x] 路由顺序预览会立即根据 draft state 更新。

验证：

```powershell
pnpm test -- apps/web/tests/configMutations.test.ts apps/web/tests/routeSummary.test.ts
pnpm typecheck
```

手动浏览器检查：

- 选择一个模块。
- 编辑策略和标签。
- 切换启用状态。
- 确认预览会更新。
- 保存并确认 `PUT /api/project/config` 成功。

## 任务 4：添加保存就绪状态、Diff 和诊断

- [x] 当 draft config 与已加载 config 不同时，显示持久 dirty 指示器。
- [x] 先添加基于行的 YAML diff 面板。
- [x] 添加本地校验面板，调用 `check` 并在保存/发布前显示诊断。
- [x] 必填字段为空时阻止保存，或给出强警告。
- [x] 明确显示将写入的文件：`config/modules.yaml`。
- [x] 保存成功后重置 dirty baseline。

验证：

```powershell
pnpm test -- apps/web/tests/projectController.test.ts apps/web/tests/localProject.test.ts
pnpm typecheck
```

手动浏览器检查：

- 编辑一个模块。
- 确认 dirty 状态出现。
- 确认 diff 展示 YAML 变更行。
- 保存。
- 确认 dirty 状态清除。

## 任务 5：面向编辑器使用重新设计布局

- [x] 将当前三列仪表盘替换为有意设计的编辑器壳。
- [x] 桌面布局：
  左侧导航 220-260px，主工作区自适应，检查器 320-360px。
- [x] 中等布局：
  导航变为横向 tabs，检查器折叠到工作区下方。
- [x] 移动端布局：
  单列工作流，使用视图 tabs，不保留常驻右侧栏。
- [x] 使用清晰状态：loaded、dirty、saving、error、validated、generated。
- [x] 在表单、预览和操作之间保持排版、间距和控件一致。

设计说明：

如果这演变成完整视觉重设计，需要先做视觉概念流程。目标应是严肃的本地工程工具：足够紧凑以支持配置工作，但不是通用 SaaS 仪表盘。

验证：

```powershell
pnpm typecheck
pnpm build
```

浏览器 QA：

- 桌面视口约 1440px。
- 窄笔记本视口约 1024px。
- 移动端视口约 390px。
- 不应出现横向溢出、控件裁切、主要操作隐藏或表单字段不可读。

## 任务 6：让发布工作流易于理解

- [x] 发布视图展示推荐顺序：
  Save -> Check -> Generate -> Git Status -> Commit -> Push。
- [x] 每个操作展示上次运行状态和输出。
- [x] `Commit` 按钮在无变更，或本次会话尚未运行 check/generate 时给出警告。
- [x] `Push` 按钮说明 Git 凭据来自本机。
- [x] 一旦能检测到或由用户输入仓库 owner/repo，就添加可复制的最终 raw URL 模板。

验证：

```powershell
pnpm test -- apps/web/tests/actions.test.ts apps/web/tests/routeKitApi.test.ts
pnpm typecheck
```

手动浏览器检查：

- 运行 check。
- 运行 generate。
- 运行 Git status。
- 确认输出面板保持可读。
- 自动 QA 期间不要 push。

## 任务 7：本阶段最终 QA

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm check`
- [x] `pnpm generate`
- [x] 桌面和移动端浏览器 smoke test。
- [x] 验证 `config/modules.yaml` 可以从 Web UI 编辑、保存、检查、生成并在本地提交。

除非有一次真实的 edit/save/check/generate 循环能从 Web UI 完成，并且不需要手动编辑 YAML，否则不要标记本阶段完成。

## 本阶段非目标

- 完整 rule provider source 编辑器。
- 完整 policy group 编辑器。
- Provider payload viewer。
- 拖拽式路由排序。
- GitHub OAuth 或托管编辑。
- Docker 部署。
- SubConverter 转换 UI。

说明：Docker 仍不是默认路径。下一阶段继续强化 local-first 编辑能力，而不是引入容器部署。

这些属于后续阶段。在模块编辑和 save/diff 工作流稳定前先做它们，只会让 UI 变大，而不会让它更可用。

## 推荐下一步

先从任务 1 和任务 2 开始。当前 `App.tsx` 已经过大；在抽取状态和布局前继续添加更多表单，会让后续工作变慢并增加风险。
