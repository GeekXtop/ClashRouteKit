/**
 * v2 作者配置 → 页面渲染输入（RouteKitProjectConfig 投影）。
 *
 * 路由列表 / 策略组列表 / INI 预览等共享渲染组件继续消费 v1 形状：
 * 经 normalizeAuthorProjectConfig + toRouteKitConfig 产出（成员 preset 展开、
 * policy / provider 引用解析为显示名与输出文件名）。列表行显示组名 / 来源名，
 * mutation 由编辑会话按稳定 ID 提交。
 *
 * toRouteKitConfig 对悬空 policy / provider 引用会抛错；编辑中间态允许出现
 * 悬空引用（诊断条已呈现 error），渲染投影剔除这类路由，保证页面永不因
 * 渲染崩溃。v2 作者配置不携带 publishBaseUrl / subconverterUrl（spec 5.3，
 * 迁入本地设置），渲染输入由装载时的 runtimeUrls（GET /api/project/config
 * 响应透传）填充；缺失时保持空串 / undefined 占位。
 */
import {
  normalizeAuthorProjectConfig,
  toRouteKitConfig,
  type AuthorProjectConfigV2,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";

import type { RuntimeUrls } from "./v2Project.js";

const FALLBACK_TEMPLATE_OUTPUT = "Custom_Clash.ini";

export function renderV2PageConfig(
  config: AuthorProjectConfigV2,
  runtimeUrls?: RuntimeUrls,
): RouteKitProjectConfig {
  const { project } = normalizeAuthorProjectConfig(config);
  const renderable = {
    ...project,
    routes: project.routes.filter(
      (route) =>
        ("builtin" in route.policy || route.policy.groupExists) &&
        (route.source.type !== "rule-provider" ||
          project.providerById.has(route.source.provider)),
    ),
  };
  const rendered = toRouteKitConfig(renderable);
  return {
    ...rendered,
    publishBaseUrl: runtimeUrls?.publishBaseUrl ?? "",
    subconverterUrl: runtimeUrls?.subconverterUrl,
    template: { output: config.project?.template?.output ?? FALLBACK_TEMPLATE_OUTPUT },
    vendorRepos: config.vendorRepos ?? [],
    // v2 provider / vendorRepo 形状是 v1 的超集（多稳定 id），投影原样透传，
    // 供规则库健康统计与侧栏按 name 渲染；编辑 mutation 走稳定 ID 通路。
    ruleProviders: config.ruleProviders,
  };
}
