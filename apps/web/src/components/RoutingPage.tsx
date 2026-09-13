import { useMemo, useState } from "react";
import { Button, Empty, Space } from "antd";
import { Eye } from "lucide-react";
import {
  validateLegacyProjectConfig,
  type Diagnostic,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import type { useProjectDraftActions } from "../useProjectDraftActions.js";
import type { useV2DraftActions } from "../v2/useV2DraftActions.js";
import type { V2ProjectState } from "../v2/v2Project.js";
import { createCustomProxyGroupStats, selectInboundRuleSets } from "../routeSummary.js";
import { GroupNav, type GroupLocate } from "./GroupNav.js";
import { GroupDrawer } from "./GroupDrawer.js";
import { IniResultModal } from "./IniResultModal.js";
import { ValidationBar } from "./ValidationBar.js";
import {
  ProjectDefaultsDrawer,
  type ProjectDefaultsSection,
} from "./ProjectDefaultsDrawer.js";
import { RuleDrawer } from "./RuleDrawer.js";
import { RuleStream, type RuleLocate } from "./RuleStream.js";
import { SourcePickerModal } from "./SourcePickerModal.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type LocateTarget =
  | ({ kind: "rule" } & RuleLocate)
  | ({ kind: "group" } & GroupLocate);

const RULESET_PATH = /^ruleSets\[(\d+)\]/;
const GROUP_PATH = /^customProxyGroups\[(\d+)\]/;
const V2_ROUTE_PATH = /^routes\[(\d+)\]/;
const V2_GROUP_INDEX_PATH = /^proxyGroups\[(\d+)\]/;
const V2_GROUP_ID_PATH = /^proxyGroups\.([a-z0-9][a-z0-9_-]*)/;

/** Schema v2 编辑会话：v2 状态 + 稳定 ID 动作。存在时页面走 v2 通路。 */
export interface RoutingV2Session {
  state: V2ProjectState;
  actions: ReturnType<typeof useV2DraftActions>;
}

function collectIssuesByGroup(
  diagnostics: readonly Diagnostic[],
  groups: RouteKitProjectConfig["customProxyGroups"],
): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const match = GROUP_PATH.exec(diagnostic.path ?? "");
    const group = match ? groups[Number(match[1])] : undefined;
    if (!group) continue;
    const bucket = map.get(group.name) ?? [];
    bucket.push(diagnostic);
    map.set(group.name, bucket);
  }
  return map;
}

function collectIssuesByRuleId(
  diagnostics: readonly Diagnostic[],
  ruleSets: RouteKitProjectConfig["ruleSets"],
): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const match = RULESET_PATH.exec(diagnostic.path ?? "");
    const ruleSet = match ? ruleSets[Number(match[1])] : undefined;
    if (!ruleSet) continue;
    const bucket = map.get(ruleSet.id) ?? [];
    bucket.push(diagnostic);
    map.set(ruleSet.id, bucket);
  }
  return map;
}

/** v2 诊断按路由 ID 聚合：v2 path 形如 `routes[3].policy.group`。 */
function collectV2IssuesByRouteId(
  diagnostics: readonly Diagnostic[],
  routes: { id: string }[],
): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const match = V2_ROUTE_PATH.exec(diagnostic.path ?? "");
    const route = match ? routes[Number(match[1])] : undefined;
    if (!route) continue;
    const bucket = map.get(route.id) ?? [];
    bucket.push(diagnostic);
    map.set(route.id, bucket);
  }
  return map;
}

/** v2 诊断按组显示名聚合：path 兼容 `proxyGroups[i]...`（作者层）与 `proxyGroups.<id>`（规范化层）。 */
function collectV2IssuesByGroup(
  diagnostics: readonly Diagnostic[],
  groups: { id: string; name: string }[],
): Map<string, Diagnostic[]> {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const map = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    const path = diagnostic.path ?? "";
    let group: { name: string } | undefined;
    const indexMatch = V2_GROUP_INDEX_PATH.exec(path);
    if (indexMatch) {
      group = groups[Number(indexMatch[1])];
    } else {
      const idMatch = V2_GROUP_ID_PATH.exec(path);
      group = idMatch ? byId.get(idMatch[1]) : undefined;
    }
    if (!group) continue;
    const bucket = map.get(group.name) ?? [];
    bucket.push(diagnostic);
    map.set(group.name, bucket);
  }
  return map;
}

export function RoutingPage({
  config,
  selectedRuleSetId,
  draftActions,
  v2,
  fetcher,
  onOpenImport,
}: {
  config: RouteKitProjectConfig;
  selectedRuleSetId: string;
  draftActions: ReturnType<typeof useProjectDraftActions>;
  /** Schema v2 编辑会话：存在时 mutation 走稳定 ID 通路，config 为渲染投影。 */
  v2?: RoutingV2Session;
  fetcher?: Fetcher;
  onOpenImport?: () => void;
}) {
  const v2State = v2?.state;
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [drawerGroup, setDrawerGroup] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [defaultsSection, setDefaultsSection] = useState<ProjectDefaultsSection | null>(null);
  const [iniResultOpen, setIniResultOpen] = useState(false);
  const [locate, setLocate] = useState<LocateTarget | null>(null);

  // v1：本地实时校验随草稿更新；v2：诊断随 mutation 由 analyzeV2Config 重算
  // （App 自动保存前已作为闸门），不再重复校验 v1 投影。
  const diagnostics = useMemo(
    () => (v2State ? v2State.diagnostics : validateLegacyProjectConfig(config)),
    [v2State, config],
  );
  const issuesByRuleId = useMemo(
    () =>
      v2State
        ? collectV2IssuesByRouteId(diagnostics, v2State.config.routes)
        : collectIssuesByRuleId(diagnostics, config.ruleSets),
    [diagnostics, v2State, config.ruleSets],
  );
  const issuesByGroup = useMemo(
    () =>
      v2State
        ? collectV2IssuesByGroup(diagnostics, v2State.config.proxyGroups)
        : collectIssuesByGroup(diagnostics, config.customProxyGroups),
    [diagnostics, v2State, config.customProxyGroups],
  );

  const stats = useMemo(() => createCustomProxyGroupStats(config), [config]);
  const policies = config.customProxyGroups.map((group) => group.name);
  const incompleteProviderOutputs = useMemo(
    () =>
      new Set(
        (config.ruleProviders ?? [])
          .filter((provider) => provider.sources.length === 0)
          .map((provider) => provider.output),
      ),
    [config.ruleProviders],
  );
  const sections = [
    ...new Set(config.ruleSets.map((ruleSet) => ruleSet.section).filter((s): s is string => Boolean(s))),
  ];
  const allOrderedIds = v2State
    ? v2State.config.routes.map((route) => route.id)
    : config.ruleSets.map((ruleSet) => ruleSet.id);
  const visibleRuleSets = selectedGroup
    ? config.ruleSets.filter((ruleSet) => ruleSet.policy === selectedGroup)
    : config.ruleSets;
  const editingGroup = v2State
    ? undefined
    : config.customProxyGroups.find((group) => group.name === drawerGroup);
  const editingV2Group =
    v2State && drawerGroup
      ? v2State.config.proxyGroups.find((group) => group.name === drawerGroup)
      : undefined;
  const editingV2Route =
    v2State && editRuleId
      ? v2State.config.routes.find((route) => route.id === editRuleId)
      : undefined;

  function pushLocate(next: { ruleId: string } | { groupName: string }) {
    setLocate((prev) =>
      "ruleId" in next
        ? { kind: "rule", ruleId: next.ruleId, nonce: (prev?.nonce ?? 0) + 1 }
        : { kind: "group", groupName: next.groupName, nonce: (prev?.nonce ?? 0) + 1 },
    );
  }

  function canLocateDiagnostic(diagnostic: Diagnostic): boolean {
    const path = diagnostic.path ?? "";
    if (v2State) {
      return (
        V2_ROUTE_PATH.test(path) || V2_GROUP_INDEX_PATH.test(path) || V2_GROUP_ID_PATH.test(path)
      );
    }
    return RULESET_PATH.test(path) || GROUP_PATH.test(path);
  }

  function locateDiagnostic(diagnostic: Diagnostic) {
    const path = diagnostic.path ?? "";
    if (v2State) {
      const routeMatch = V2_ROUTE_PATH.exec(path);
      if (routeMatch) {
        const route = v2State.config.routes[Number(routeMatch[1])];
        if (route) {
          setSelectedGroup(null);
          pushLocate({ ruleId: route.id });
          return;
        }
      }
      const indexMatch = V2_GROUP_INDEX_PATH.exec(path);
      if (indexMatch) {
        const group = v2State.config.proxyGroups[Number(indexMatch[1])];
        if (group) pushLocate({ groupName: group.name });
        return;
      }
      const idMatch = V2_GROUP_ID_PATH.exec(path);
      if (idMatch) {
        const group = v2State.config.proxyGroups.find((item) => item.id === idMatch[1]);
        if (group) pushLocate({ groupName: group.name });
      }
      return;
    }
    const ruleMatch = RULESET_PATH.exec(path);
    if (ruleMatch) {
      const ruleSet = config.ruleSets[Number(ruleMatch[1])];
      if (ruleSet) {
        // 先清过滤，避免目标行被当前筛选隐藏。
        setSelectedGroup(null);
        pushLocate({ ruleId: ruleSet.id });
        return;
      }
    }
    const groupMatch = GROUP_PATH.exec(path);
    if (groupMatch) {
      const group = config.customProxyGroups[Number(groupMatch[1])];
      if (group) pushLocate({ groupName: group.name });
    }
  }

  function filterRouteListByGroup(groupName: string) {
    setSelectedGroup(groupName);
    setDrawerGroup(null);
    const first = config.ruleSets.find((ruleSet) => ruleSet.policy === groupName);
    if (first) pushLocate({ ruleId: first.id });
  }

  if (config.ruleSets.length === 0 && config.customProxyGroups.length === 0) {
    return (
      <Empty description="还没有路由规则与策略组" style={{ paddingTop: 100 }}>
        <Space>
          <Button type="primary" onClick={onOpenImport}>
            从模板导入开始
          </Button>
          <Button onClick={() => (v2?.actions ?? draftActions).createCustomProxyGroup()}>
            手动新建策略组
          </Button>
        </Space>
      </Empty>
    );
  }

  return (
    <div className="rk-page-col" style={{ height: "100%" }}>
      <div className="rk-routing-top">
        <ValidationBar
          diagnostics={diagnostics}
          canLocate={canLocateDiagnostic}
          onLocate={locateDiagnostic}
        />
        <Button icon={<Eye size={14} />} onClick={() => setIniResultOpen(true)}>
          查看生成结果
        </Button>
      </div>
      <div className="rk-routing" style={{ flex: 1 }}>
        <div className="rk-pane">
          <GroupNav
            groups={config.customProxyGroups}
            stats={stats}
            diagnosticsByGroup={issuesByGroup}
            totalRules={config.ruleSets.length}
            selectedGroup={selectedGroup}
            locate={locate?.kind === "group" ? locate : null}
            onSelectGroup={setSelectedGroup}
            onEditGroup={setDrawerGroup}
            onCreateGroup={(v2?.actions ?? draftActions).createCustomProxyGroup}
            onOpenDefaults={() => setDefaultsSection("proxy-groups")}
          />
        </div>
        <div className="rk-pane">
          <RuleStream
            ruleSets={visibleRuleSets}
            selectedGroup={selectedGroup}
            selectedRuleSetId={selectedRuleSetId}
            allOrderedIds={allOrderedIds}
            incompleteProviderOutputs={incompleteProviderOutputs}
            defaults={config.defaults}
            issuesByRuleId={issuesByRuleId}
            locate={locate?.kind === "rule" ? locate : null}
            showEnabledToggle={!v2State}
            emptyDescription={
              selectedGroup ? (
                <>
                  <div>当前没有 RuleSet 直接指向此组。</div>
                  <div>该组仍可作为下游策略组被其他组引用。</div>
                </>
              ) : undefined
            }
            onSelectRuleSet={(v2?.actions ?? draftActions).selectRuleSet}
            onToggle={(v2?.actions ?? draftActions).toggleRuleSet}
            onEditRule={(id) => {
              (v2?.actions ?? draftActions).selectRuleSet(id);
              setEditRuleId(id);
            }}
            onReorder={(v2?.actions ?? draftActions).reorderRuleSets}
            onAddRule={() => setPickerOpen(true)}
          />
        </div>
      </div>

      <GroupDrawer
        open={drawerGroup !== null}
        group={editingGroup}
        v2={
          v2 && editingV2Group
            ? {
                group: editingV2Group,
                memberSets: v2State?.config.memberSets ?? {},
                groupOptions: (v2State?.config.proxyGroups ?? [])
                  .filter((group) => group.id !== editingV2Group.id)
                  .map((group) => ({ id: group.id, name: group.name })),
                onSave: (nextGroup) => {
                  if (!editingV2Group) return;
                  v2.actions.saveProxyGroup(editingV2Group.id, nextGroup);
                  if (selectedGroup === drawerGroup) setSelectedGroup(nextGroup.name);
                  setDrawerGroup(null);
                },
                onUpsertMemberSet: (setId, members) => v2.actions.upsertMemberSet(setId, members),
                onRemoveMemberSet: (setId) => v2.actions.removeMemberSet(setId),
              }
            : undefined
        }
        groups={config.customProxyGroups}
        defaults={v2State ? v2State.config.project?.defaults : config.defaults}
        inboundCount={drawerGroup ? selectInboundRuleSets(config, drawerGroup).length : 0}
        onSave={(nextGroup) => {
          if (!drawerGroup) return;
          draftActions.saveCustomProxyGroup(drawerGroup, nextGroup);
          if (selectedGroup === drawerGroup) setSelectedGroup(nextGroup.name);
          setDrawerGroup(null);
        }}
        onCancel={() => setDrawerGroup(null)}
        onDelete={() => {
          if (drawerGroup) {
            (v2?.actions ?? draftActions).deleteCustomProxyGroup(
              editingV2Group ? editingV2Group.id : drawerGroup,
            );
            setDrawerGroup(null);
          }
        }}
        onFilterInRouteList={filterRouteListByGroup}
      />

      <RuleDrawer
        open={editRuleId !== null}
        ruleSet={v2State ? undefined : config.ruleSets.find((r) => r.id === editRuleId)}
        v2={
          v2 && editingV2Route
            ? {
                route: editingV2Route,
                groups: (v2State?.config.proxyGroups ?? []).map((group) => ({
                  id: group.id,
                  name: group.name,
                })),
                providers: (v2State?.config.ruleProviders ?? []).map((provider) => ({
                  id: provider.id,
                  name: provider.name,
                })),
                routeIds: v2State?.config.routes.map((route) => route.id) ?? [],
                onSave: (nextRoute) => {
                  if (!editingV2Route) return;
                  v2.actions.saveRoute(editingV2Route.id, nextRoute);
                  setEditRuleId(null);
                },
              }
            : undefined
        }
        ruleSetIds={config.ruleSets.map((ruleSet) => ruleSet.id)}
        policies={policies}
        defaults={v2State ? v2State.config.project?.defaults : config.defaults}
        onSave={(nextRuleSet) => {
          if (!editRuleId) return;
          draftActions.saveRuleSet(editRuleId, nextRuleSet);
          setEditRuleId(null);
        }}
        onCancel={() => setEditRuleId(null)}
        onDelete={() => {
          if (editRuleId) (v2?.actions ?? draftActions).deleteRuleSet(editRuleId);
          setEditRuleId(null);
        }}
      />

      {defaultsSection ? (
        <ProjectDefaultsDrawer
          open
          initialSection={defaultsSection}
          defaults={v2State ? v2State.config.project?.defaults : config.defaults}
          onSave={(defaults) => {
            (v2?.actions ?? draftActions).setProjectDefaults(defaults);
            setDefaultsSection(null);
          }}
          onCancel={() => setDefaultsSection(null)}
        />
      ) : null}

      {pickerOpen ? (
        <SourcePickerModal
          open
          policies={policies}
          defaultPolicy={selectedGroup || policies[0] || "DIRECT"}
          sections={sections}
          fetcher={fetcher}
          onAdd={(source, policy, section) => (v2?.actions ?? draftActions).addRoute(source, policy, section)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}

      <IniResultModal
        open={iniResultOpen}
        config={config}
        onClose={() => setIniResultOpen(false)}
      />
    </div>
  );
}
