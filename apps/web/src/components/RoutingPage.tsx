import { useMemo, useState } from "react";
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
}: {
  config: RouteKitProjectConfig;
  selectedRuleSetId: string;
  draftActions: ReturnType<typeof useProjectDraftActions>;
  fetcher?: Fetcher;
}) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [drawerGroup, setDrawerGroup] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
            onEditSource={draftActions.selectRuleSet}
            onReorder={draftActions.reorderRuleSets}
            onAddRule={() => setPickerOpen(true)}
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
          defaultPolicy={selectedGroup ?? policies[0] ?? "DIRECT"}
          sections={sections}
          fetcher={fetcher}
          onAdd={(source, policy, section) => draftActions.addRoute(source, policy, section)}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
