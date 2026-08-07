import { useMemo, useState } from "react";
import { Button, Empty, Space } from "antd";
import { renderIni, type RouteKitProjectConfig } from "@clash-route-kit/core";
import type { useProjectDraftActions } from "../useProjectDraftActions.js";
import {
  createCustomProxyGroupDetails,
  createCustomProxyGroupStats,
  selectInboundRuleSets,
} from "../routeSummary.js";
import { GroupContextPanel } from "./GroupContextPanel.js";
import { GroupNav } from "./GroupNav.js";
import { GroupDrawer } from "./GroupDrawer.js";
import { PreviewDock } from "./PreviewDock.js";
import {
  ProjectDefaultsDrawer,
  type ProjectDefaultsSection,
} from "./ProjectDefaultsDrawer.js";
import { RuleDrawer } from "./RuleDrawer.js";
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
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [defaultsSection, setDefaultsSection] = useState<ProjectDefaultsSection | null>(null);

  const stats = useMemo(() => createCustomProxyGroupStats(config), [config]);
  const iniPreview = useMemo(() => renderIni(config), [config]);
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
  const selectedGroupConfig = selectedGroup
    ? config.customProxyGroups.find((group) => group.name === selectedGroup)
    : undefined;
  const selectedGroupDetails = selectedGroup
    ? createCustomProxyGroupDetails(config, selectedGroup)
    : undefined;

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
            onOpenDefaults={() => setDefaultsSection("proxy-groups")}
          />
        </div>
        <div className="rk-pane">
          {selectedGroupConfig && selectedGroupDetails ? (
            <GroupContextPanel
              group={selectedGroupConfig}
              details={selectedGroupDetails}
              onEdit={() => setDrawerGroup(selectedGroupConfig.name)}
              onSelectParent={setSelectedGroup}
            >
              <RuleStream
                ruleSets={visibleRuleSets}
                selectedGroup={selectedGroupConfig.name}
                selectedRuleSetId={selectedRuleSetId}
                allOrderedIds={allOrderedIds}
                incompleteProviderOutputs={incompleteProviderOutputs}
                defaults={config.defaults}
                emptyDescription={(
                  <>
                    <div>当前没有 RuleSet 直接指向此组。</div>
                    <div>该组仍可作为下游策略组被其他组引用。</div>
                  </>
                )}
                onSelectRuleSet={draftActions.selectRuleSet}
                onToggle={draftActions.toggleRuleSet}
                onEditRule={(id) => {
                  draftActions.selectRuleSet(id);
                  setEditRuleId(id);
                }}
                onReorder={draftActions.reorderRuleSets}
                onAddRule={() => setPickerOpen(true)}
              />
            </GroupContextPanel>
          ) : (
            <RuleStream
              ruleSets={visibleRuleSets}
              selectedGroup={selectedGroup}
              selectedRuleSetId={selectedRuleSetId}
              allOrderedIds={allOrderedIds}
              incompleteProviderOutputs={incompleteProviderOutputs}
              defaults={config.defaults}
              onSelectRuleSet={draftActions.selectRuleSet}
              onToggle={draftActions.toggleRuleSet}
              onEditRule={(id) => {
                draftActions.selectRuleSet(id);
                setEditRuleId(id);
              }}
              onReorder={draftActions.reorderRuleSets}
              onAddRule={() => setPickerOpen(true)}
            />
          )}
        </div>
      </div>
      <PreviewDock ini={iniPreview} />

      <GroupDrawer
        open={drawerGroup !== null}
        group={editingGroup}
        groups={config.customProxyGroups}
        defaults={config.defaults}
        inbound={drawerGroup ? selectInboundRuleSets(config, drawerGroup) : []}
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
        onJumpToRule={(id) => {
          draftActions.selectRuleSet(id);
          setDrawerGroup(null);
        }}
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
    </div>
  );
}
