# Web Editor Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current local Web console into a usable route configuration editor that can safely edit `config/modules.yaml`, preview generated routing, validate before saving, and guide users through the local publish workflow.

**Architecture:** Keep the existing local-first model: browser UI talks to the Vite dev server API, and `config/modules.yaml` remains the source of truth. Refactor the Web app into focused feature modules with a single project state controller, then build editor surfaces around typed `RouteKitProjectConfig` mutations instead of raw YAML editing.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `@clash-route-kit/core`, local Vite middleware, CSS modules or structured global CSS.

---

## Current Problems

- `apps/web/src/App.tsx` is now about 700 lines and owns layout, data loading, local actions, subscriptions, route preview, panels, and form state in one component.
- The page is a cramped three-column dashboard, not an editing workflow. Important actions compete with previews and detail panels.
- Only module enable/disable is editable. Most source-of-truth fields are still read-only.
- The save flow rewrites `config/modules.yaml` without a clear dirty state, diff preview, or pre-save diagnostics.
- The right rail mixes unrelated concepts: local project status, module details, policy groups, and provider outputs.
- The layout degrades on smaller screens but still exposes too much at once.
- There is no first-class model for editing modules, policy groups, provider references, rule providers, or rule list files.

## Product Direction

This should become a focused editor, not a generic dashboard.

The primary mental model is:

```text
Project status -> Modules -> Policies -> Rule providers -> Preview -> Save -> Check -> Generate -> Commit/Push
```

The next phase should not try to implement every advanced rule feature. It should make one complete path reliable:

1. Load local `config/modules.yaml`.
2. Edit route modules through forms.
3. See route order and INI preview update.
4. See unsaved changes and YAML diff.
5. Run validation before saving.
6. Save local config.
7. Run generate and Git workflow from one publish panel.

## Information Architecture

Use a three-region app shell:

- **Left navigation:** Project, Modules, Policy Groups, Rule Providers, Preview, Publish.
- **Main workspace:** The currently selected editor or preview.
- **Inspector rail:** Contextual diagnostics, changed fields, selected item details, and save readiness.

Recommended first implementation views:

- **Project:** load/save status, publish URL, template output, current branch hints.
- **Modules:** list, search, reorder later, module editor form.
- **Preview:** rule order table and INI preview in tabs.
- **Publish:** check, generate, Git status, commit, push, command output.

Policy Groups and Rule Providers can initially be read-only summaries with clear “next phase” affordances. Do not build half-working editors for them until module editing is stable.

## File Structure

- Create `apps/web/src/projectController.ts`
  Owns project load/save state, dirty tracking, YAML serialization, and validation state.
- Create `apps/web/tests/projectController.test.ts`
  Covers dirty state, save readiness, and config mutation behavior.
- Create `apps/web/src/configMutations.ts`
  Pure functions for editing `RouteKitProjectConfig`: module add/update/delete/toggle, policy update, tag list updates, provider references.
- Create `apps/web/tests/configMutations.test.ts`
  Covers immutable config mutations.
- Create `apps/web/src/components/AppShell.tsx`
  Top-level layout and navigation.
- Create `apps/web/src/components/ModuleEditor.tsx`
  Form for one selected module.
- Create `apps/web/src/components/ModuleList.tsx`
  Searchable module list with enabled state and selected item.
- Create `apps/web/src/components/PreviewWorkspace.tsx`
  Rule order and INI preview.
- Create `apps/web/src/components/PublishPanel.tsx`
  Check/generate/git workflow.
- Create `apps/web/src/components/InspectorPanel.tsx`
  Diagnostics, dirty state, selected item summary.
- Modify `apps/web/src/App.tsx`
  Reduce to composition, data orchestration, and view selection.
- Modify `apps/web/src/styles.css`
  Replace the current dashboard layout with an editor shell and responsive workspace.

## Task 1: Establish Editor State Model

- [ ] Add `configMutations.ts` with pure immutable helpers:
  `updateModule`, `toggleModule`, `addModule`, `deleteModule`, `setModuleTags`, `setModuleProviderRefs`.
- [ ] Add tests for each helper before implementation.
- [ ] Add `projectController.ts` for dirty tracking:
  original YAML/config, draft config, save status, last validation output, selected view, selected module ID.
- [ ] Add tests for dirty state and save readiness.
- [ ] Keep all functions independent from React so they are easy to test.

Verification:

```powershell
pnpm test -- apps/web/tests/configMutations.test.ts apps/web/tests/projectController.test.ts
pnpm typecheck
```

## Task 2: Split App Into Real Components

- [ ] Extract `AppShell`, `ModuleList`, `ModuleEditor`, `PreviewWorkspace`, `PublishPanel`, and `InspectorPanel`.
- [ ] Keep `App.tsx` under 180 lines.
- [ ] Move subscription editor into its own component or temporarily hide it behind a secondary view so it no longer competes with route editing.
- [ ] Preserve current local API behavior while moving code.
- [ ] Add smoke tests for pure helpers only; do not add brittle DOM tests yet.

Verification:

```powershell
pnpm test
pnpm typecheck
```

## Task 3: Build Module Editing MVP

- [ ] Module list supports select, enable/disable, and create module.
- [ ] Module editor supports:
  `id`, `policy`, `enabled`, `geosite`, `geoip`, and provider references.
- [ ] Tag inputs use newline or chip editing, but serialize back to arrays.
- [ ] Provider reference editor supports `behavior`, `file`, and optional `interval`.
- [ ] Delete module requires a confirmation affordance in the UI.
- [ ] Route order preview updates from draft state immediately.

Verification:

```powershell
pnpm test -- apps/web/tests/configMutations.test.ts apps/web/tests/routeSummary.test.ts
pnpm typecheck
```

Manual browser checks:

- Select a module.
- Edit policy and tags.
- Toggle enabled.
- Confirm preview updates.
- Save and confirm `PUT /api/project/config` succeeds.

## Task 4: Add Save Readiness, Diff, and Diagnostics

- [ ] Show a persistent dirty indicator when draft config differs from loaded config.
- [ ] Add a YAML diff panel using line-based diff initially.
- [ ] Add a local validation panel that calls `check` and displays diagnostics before save/publish.
- [ ] Block or strongly warn on save when required fields are empty.
- [ ] Show exactly what file will be written: `config/modules.yaml`.
- [ ] After save succeeds, reset dirty baseline.

Verification:

```powershell
pnpm test -- apps/web/tests/projectController.test.ts apps/web/tests/localProject.test.ts
pnpm typecheck
```

Manual browser checks:

- Edit a module.
- Confirm dirty state appears.
- Confirm diff shows changed YAML lines.
- Save.
- Confirm dirty state clears.

## Task 5: Redesign Layout for Editor Use

- [ ] Replace the current three-column dashboard with a deliberate editor shell.
- [ ] Desktop layout:
  left navigation 220-260px, main workspace flexible, inspector 320-360px.
- [ ] Medium layout:
  navigation becomes horizontal tabs, inspector collapses below workspace.
- [ ] Mobile layout:
  single-column workflow with view tabs and no permanent right rail.
- [ ] Use clear states: loaded, dirty, saving, error, validated, generated.
- [ ] Keep typography, spacing, and controls consistent across forms, previews, and actions.

Design note:

If this becomes a full visual redesign implementation, run a visual concept pass first. The target should be a serious local engineering tool: dense enough for config work, but not a generic SaaS dashboard.

Verification:

```powershell
pnpm typecheck
pnpm build
```

Browser QA:

- Desktop viewport around 1440px.
- Narrow laptop viewport around 1024px.
- Mobile viewport around 390px.
- No horizontal overflow, clipped controls, hidden primary actions, or unreadable form fields.

## Task 6: Make Publish Workflow Understandable

- [ ] Publish view shows the recommended sequence:
  Save -> Check -> Generate -> Git Status -> Commit -> Push.
- [ ] Each action displays last run status and output.
- [ ] `Commit` button should warn when there are no changes or when check/generate has not run in this session.
- [ ] `Push` button should explain that Git credentials come from the local machine.
- [ ] Add copyable final raw URL templates based on repository owner/repo once that metadata is detectable or user-entered.

Verification:

```powershell
pnpm test -- apps/web/tests/actions.test.ts apps/web/tests/routeKitApi.test.ts
pnpm typecheck
```

Manual browser checks:

- Run check.
- Run generate.
- Run Git status.
- Confirm output panel remains readable.
- Do not push during automated QA.

## Task 7: Final QA For This Phase

- [ ] `pnpm test`
- [ ] `pnpm typecheck`
- [ ] `pnpm build`
- [ ] `pnpm check`
- [ ] `pnpm generate`
- [ ] Browser smoke test on desktop and mobile.
- [ ] Verify `config/modules.yaml` can be edited, saved, checked, generated, and committed locally.

Do not mark this phase complete until one real edit/save/check/generate loop works from the Web UI without touching YAML manually.

## Non-Goals For This Phase

- Full rule provider source editor.
- Full policy group editor.
- Provider payload viewer.
- Drag-and-drop route ordering.
- GitHub OAuth or hosted editing.
- Docker deployment.
- SubConverter conversion UI.

These are later phases. Building them before the module editor and save/diff workflow are stable will make the UI larger but not more usable.

## Recommended Next Action

Start with Task 1 and Task 2 only. The current `App.tsx` is already too large; adding more forms before extracting state and layout will make later work slower and riskier.
