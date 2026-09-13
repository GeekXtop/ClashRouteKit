# 2026-09-13 Phase D Task 4 UI 半边：v2 稳定 ID 编辑通路

- 任务：路由页/规则库页与三抽屉在 v2 项目下走稳定 ID 编辑通路，移除 SchemaV2Notice 占位（plan：docs/superpowers/plans/2026-09-13-web-workflow-redesign.md Task 4）。
- 状态：已完成并全量门禁通过（84 文件 670 测试，基线 82/644 不降）。
- 新增：`apps/web/src/v2/{useV2DraftActions,renderProject,drawerDrafts}.ts`；测试 `apps/web/tests/v2/{draftActions.test.ts,webEditing.test.tsx}`。
- 修改：`components/{RoutingPage,LibraryPage,GroupDrawer,RuleDrawer,RuleStream,RuleRow}.tsx`、`features/{project/ProjectPage,output/OutputPage}.tsx`、`App.tsx`、`projectController.ts`（最小）、`v2/mutations.ts`（updateProject + 导出 slugifyId/allocateId）。
- 删除：`features/project/SchemaV2Notice.tsx`。
- 待办（后续任务）：OutputPage 的 v2 渲染数据仍走投影（publishBaseUrl 为空串，spec 5.3 本地设置接入后替换）；v2 项目的 INI 模板导入被有意拦截。
