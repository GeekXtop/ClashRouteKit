import { useMemo, useState } from "react";
import { Button, Empty, Space } from "antd";
import { Eye } from "lucide-react";
import {
  validateLegacyProjectConfig,
  type Diagnostic,
  type RouteKitProjectConfig,
} from "@clash-route-kit/core";
import type { useProjectDraftActions } from "../useProjectDraftActions.js";
import type { ProjectSchemaVersion } from "../features/project/projectMeta.js";
import { SchemaV2Notice } from "../features/project/SchemaV2Notice.js";
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

export function RoutingPage({
  config,
  schemaVersion,
  selectedRuleSetId,
  draftActions,
  fetcher,
  onOpenImport,
}: {
  config: RouteKitProjectConfig;
  schemaVersion?: ProjectSchemaVersion;
  selectedRuleSetId: string;
  draftActions: ReturnType<typeof useProjectDraftActions>;
  fetcher?: Fetcher;
  onOpenImport?: () => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [drawerGroup, setDrawerGroup] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [defaultsSection, setDefaultsSection] = useState<ProjectDefaultsSection | null>(null);
  const [iniResultOpen, setIniResultOpen] = useState(false);
  const [locate, setLocate] = useState<LocateTarget | null>(null);

  // 本地实时校验：随草稿更新（与 /api/actions/check 共用同一 validate 实现），
  // 且诊断带 path，可用于行内就近显示与点击定位。
  const diagnostics = useMemo(() => validateLegacyProjectConfig(config), [config]);
  const issuesByRuleId = useMemo(
    () => collectIssuesByRuleId(diagnostics, config.ruleSets),
    [diagnostics, config.ruleSets],
  );
  const issuesByGroup = useMemo(
    () => collectIssuesByGroup(diagnostics, config.customProxyGroups),
    [diagnostics, config.customProxyGroups],
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
  const allOrderedIds = config.ruleSets.map((ruleSet) => ruleSet.id);
  const visibleRuleSets = selectedGroup
    ? config.ruleSets.filter((ruleSet) => ruleSet.policy === selectedGroup)
    : config.ruleSets;
  const editingGroup = config.customProxyGroups.find((group) => group.name === drawerGroup);

  function pushLocate(next: { ruleId: string } | { groupName: string }) {
    setLocate((prev) =>
      "ruleId" in next
        ? { kind: "rule", ruleId: next.ruleId, nonce: (prev?.nonce ?? 0) + 1 }
        : { kind: "group", groupName: next.groupName, nonce: (prev?.nonce ?? 0) + 1 },
    );
  }

  function canLocateDiagnostic(diagnostic: Diagnostic): boolean {
    const path = diagnostic.path ?? "";
    return RULESET_PATH.test(path) || GROUP_PATH.test(path);
  }

  function locateDiagnostic(diagnostic: Diagnostic) {
    const path = diagnostic.path ?? "";
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
          <Button onClick={() => draftActions.createCustomProxyGroup()}>手动新建策略组</Button>
        </Space>
      </Empty>
    );
  }

  return (
    <div className="rk-page-col" style={{ height: "100%" }}>
      {schemaVersion === 2 ? <SchemaV2Notice /> : null}
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
            onCreateGroup={draftActions.createCustomProxyGroup}
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
            emptyDescription={
              selectedGroup ? (
                <>
                  <div>当前没有 RuleSet 直接指向此组。</div>
                  <div>该组仍可作为下游策略组被其他组引用。</div>
                </>
              ) : undefined
            }
            onSelectRuleSet={draftActions.selectRuleSet}
            onToggle={draftActions.toggleRuleSet}
            onEditRule={(id) => {
              draftActions.selectRuleSet(id);
              setEditRuleId(id);
            }}
            onReorder={draftActions.reorderRuleSets}
            onAddRule={() => setPickerOpen(true)}
          />
        </div>
      </div>

      <GroupDrawer
        open={drawerGroup !== null}
        group={editingGroup}
        groups={config.customProxyGroups}
        defaults={config.defaults}
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
            draftActions.deleteCustomProxyGroup(drawerGroup);
            setDrawerGroup(null);
          }
        }}
        onFilterInRouteList={filterRouteListByGroup}
      />

      <RuleDrawer
        open={editRuleId !== null}
        ruleSet={config.ruleSets.find((r) => r.id === editRuleId)}
        ruleSetIds={config.ruleSets.map((ruleSet) => ruleSet.id)}
        policies={policies}
        defaults={config.defaults}
        onSave={(nextRuleSet) => {
          if (!editRuleId) return;
          draftActions.saveRuleSet(editRuleId, nextRuleSet);
          setEditRuleId(null);
        }}
        onCancel={() => setEditRuleId(null)}
        onDelete={() => {
          if (editRuleId) draftActions.deleteRuleSet(editRuleId);
          setEditRuleId(null);
        }}
      />

      {defaultsSection ? (
        <ProjectDefaultsDrawer
          open
          initialSection={defaultsSection}
          defaults={config.defaults}
          onSave={(defaults) => {
            draftActions.setProjectDefaults(defaults);
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
          onAdd={(source, policy, section) => draftActions.addRoute(source, policy, section)}
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
