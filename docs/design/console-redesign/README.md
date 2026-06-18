# 控制台重设计 · 视觉与布局基准

这些 HTML 是 ClashRouteKit web 控制台重设计的**最终设计稿**，用浏览器直接打开即可查看。它们是计划 4（web UI）实现时的**视觉与布局唯一基准（source of truth）**——B 层每个页面都要做成这个样子（深色 GitHub 风主题、5 标签工作流导航、三列/段/拖动等布局），而不是沿用现有 app 的原风格。

- **final-design-book.html** — 5 个页面的合订定稿（① 规则目录已采用密集版）：① 规则目录 ② 规则源 ③ 策略组 ④ 路由 ⑤ 发布，按工作流排序。浏览器打开即可逐页查看。

## 配色 token（B 层应抽成 CSS 变量统一应用）

| 用途 | 值 |
|---|---|
| 背景 0/1/2/3 | `#0d1117` / `#10151c` / `#161b22` / `#11161d` |
| 边框 | `#30363d` / `#21262d` |
| 文字 主/次/弱 | `#e6edf3` / `#c9d1d9` / `#7d8590` / `#586069` |
| 主色（蓝） | `#1f6feb` |
| 策略色：直连/拦截/服务组/地区·代理/收尾 | `#3fb950` / `#f85149` / `#8957e5` / `#1f6feb` / `#e3b341` |

## 对应的实现计划

`docs/superpowers/plans/2026-06-08-console-redesign-4-web.md`（B1–B6）。实现时对照本目录的 HTML 还原视觉。

> 历史：这些图最初在头脑风暴会话的临时目录里迭代产出，后被误删，已据当时定稿完整恢复并提交于此。

## 本轮精修（2026-06-18，修 9 个可用性问题）

实施计划：`docs/superpowers/plans/2026-06-18-console-refinement.md`（全部完成）。

新增共享类（在既有 token 之上）：
- `.type-badge.tb-*`（策略组类型徽标）、`.cpg-row-main`（策略组列表行）
- `.inbound-rules`/`.inbound-rule`（策略组详情「指向本组的规则」，#9）
- `.route-preview-dock`/`.dock-toggle`（路由页底部常驻 INI 预览，#2）
- `.seg`/`.seg-item`/`.seg-on`（数据源左栏分段）、`.src-row`/`.src-pick`/`.src-sync`/`.src-add-row`/`.add-repo-form`（#5#6#7）
- `.import-template-btn`、`.command-button.danger`、`.wizard-*`（模板导入向导，#8）

9 问题落点：#1 各页沿用既有深色设计系统；#2 路由底部常驻预览 + 跨页跳转高亮；#3 dler-io 钉 `branch: main`；#4 叶子分类无箭头、消除「无 include」误导；#5 每源单独同步（`syncVendor({only})` + `?name=`）；#6 `vendorRepos.catalog` 配置驱动 + `/api/vendor/add` + 新建 .list 做真；#7 本地 .list 平铺左栏 + 右侧直接编辑；#8 统一导入向导（数据源模板 / 粘贴 / 上传 → 预览 → 覆盖）；#9 策略组详情内嵌「入站规则」（模型 1）。
