import { useMemo, useState } from "react";
import { Button, Empty, Space } from "antd";
import { renderIni, type RouteKitProjectConfig } from "@clash-route-kit/core";
import type { useProjectDraftActions } from "../useProjectDraftActions.js";
import { createCustomProxyGroupStats, selectInboundRuleSets } from "../routeSummary.js";
import { GroupNav } from "./GroupNav.js";
import { GroupDrawer } from "./GroupDrawer.js";
import { PreviewDock } from "./PreviewDock.js";
import { RuleStream } from "./RuleStream.js";
import { SourcePickerModal } from "./SourcePickerModal.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function RoutingPage({
  config,
  selectedRuleSetId,
  draftActions,
  fetcher,
  onOpenImport,
}: {
  config: RouteKitProjectConfig;
  selectedRuleSetId: string;
  draftActions: ReturnType<typeof useProjectDraftActions>;
  fetcher?: Fetcher;
  onOpenImport?: () => void;
}) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [drawerGroup, setDrawerGroup] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const stats = useMemo(() => createCustomProxyGroupStats(config), [config]);
  const iniPreview = useMemo(() => renderIni(config), [config]);
  const policies = config.customProxyGroups.map((group) => group.name);
  const sections = [
    ...new Set(config.ruleSets.map((ruleSet) => ruleSet.section).filter((s): s is string => Boolean(s))),
  ];
  const allOrderedIds = config.ruleSets.map((ruleSet) => ruleSet.id);
  const visibleRuleSets = selectedGroup
    ? config.ruleSets.filter((ruleSet) => ruleSet.policy === selectedGroup)
    : config.ruleSets;
  const editingGroup = config.customProxyGroups.find((group) => group.name === drawerGroup);

  if (config.ruleSets.length === 0 && config.customProxyGroups.length === 0) {
    return (
      <Empty description="还没有路由规则与策略组" style={{ paddingTop: 100 }}>
        <Space>
          <Button type="primary" onClick={onOpenImport}>
            从模板导入开始
          </Button>
          <Button onClick={draftActions.createCustomProxyGroup}>手动新建策略组</Button>
        </Space>
      </Empty>
    );
  }

  return (
    <div className="rk-page-col" style={{ height: "100%" }}>
      <div className="rk-routing" style={{ flex: 1 }}>
        <div className="rk-pane">
          <GroupNav
            groups={config.customProxyGroups}
            stats={stats}
            totalRules={config.ruleSets.length}
            selectedGroup={selectedGroup}
            onSelectGroup={setSelectedGroup}
            onEditGroup={setDrawerGroup}
            onCreateGroup={draftActions.createCustomProxyGroup}
          />
        </div>
        <div className="rk-pane">
          <RuleStream
            ruleSets={visibleRuleSets}
            selectedGroup={selectedGroup}
            policies={policies}
            selectedRuleSetId={selectedRuleSetId}
            allOrderedIds={allOrderedIds}
            onSelectRuleSet={draftActions.selectRuleSet}
            onPolicyChange={(id, policy) => draftActions.updateRuleSet(id, { policy })}
            onToggle={draftActions.toggleRuleSet}
            onDelete={draftActions.deleteRuleSet}
            onEditSource={(id) => {
              setEditingRuleId(id);
              setPickerOpen(true);
            }}
            onReorder={draftActions.reorderRuleSets}
            onAddRule={() => {
              setEditingRuleId(null);
              setPickerOpen(true);
            }}
          />
        </div>
      </div>
      <PreviewDock ini={iniPreview} />

      <GroupDrawer
        open={drawerGroup !== null}
        group={editingGroup}
        groups={config.customProxyGroups}
        inbound={drawerGroup ? selectInboundRuleSets(config, drawerGroup) : []}
        onClose={() => setDrawerGroup(null)}
        onUpdate={(patch) => drawerGroup && draftActions.updateCustomProxyGroup(drawerGroup, patch)}
        onRename={(next) => {
          if (drawerGroup) {
            draftActions.renameCustomProxyGroup(drawerGroup, next);
            setDrawerGroup(next);
          }
        }}
        onSetListField={(field, values) => drawerGroup && draftActions.setCustomProxyGroupListField(drawerGroup, field, values)}
        onDelete={() => {
          if (drawerGroup) {
            draftActions.deleteCustomProxyGroup(drawerGroup);
            setDrawerGroup(null);
          }
        }}
        onJumpToRule={(id) => {
          draftActions.selectRuleSet(id);
          setDrawerGroup(null);
        }}
      />

      {pickerOpen ? (
        <SourcePickerModal
          open
          policies={policies}
          defaultPolicy={
            (editingRuleId && config.ruleSets.find((r) => r.id === editingRuleId)?.policy) ||
            selectedGroup ||
            policies[0] ||
            "DIRECT"
          }
          sections={sections}
          fetcher={fetcher}
          onAdd={(source, policy, section) => {
            if (editingRuleId) {
              draftActions.updateRuleSet(editingRuleId, { source });
            } else {
              draftActions.addRoute(source, policy, section);
            }
          }}
          onClose={() => {
            setPickerOpen(false);
            setEditingRuleId(null);
          }}
        />
      ) : null}
    </div>
  );
}
