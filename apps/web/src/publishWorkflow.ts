import type { LocalRouteKitAction } from "./actions.js";

export type ActionStatus = "idle" | "running" | "success" | "error";

export interface LocalActionState {
  status: ActionStatus;
  output: string;
}

export type LocalActionStates = Record<LocalRouteKitAction, LocalActionState>;

export interface GitHubRepo {
  owner: string;
  repo: string;
}

export interface RawUrlTemplates {
  template: string;
  providers: string;
}

export const publishActions: LocalRouteKitAction[] = [
  "check",
  "generate",
  "git-status",
  "git-commit",
  "git-push",
];

export function createInitialActionStates(): LocalActionStates {
  return Object.fromEntries(
    publishActions.map((action) => [action, { status: "idle", output: "尚未运行" }]),
  ) as LocalActionStates;
}

export function updateActionState(
  states: LocalActionStates,
  action: LocalRouteKitAction,
  patch: Partial<LocalActionState>,
): LocalActionStates {
  return {
    ...states,
    [action]: {
      ...states[action],
      ...patch,
    },
  };
}

export function getPublishActionWarning(
  action: LocalRouteKitAction,
  states: LocalActionStates,
): string | undefined {
  if (action !== "git-commit") return undefined;
  if (states.check.status !== "success" || states.generate.status !== "success") {
    return "提交前应先运行检查和生成输出";
  }
  if (/nothing to commit|working tree clean|无可提交/i.test(states["git-status"].output)) {
    return "Git 状态显示没有可提交更改";
  }
  return undefined;
}

export function parseGitHubRepo(value: string): GitHubRepo | undefined {
  try {
    const url = new URL(value);
    if (url.hostname !== "raw.githubusercontent.com") return undefined;
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return owner && repo ? { owner, repo } : undefined;
  } catch {
    return undefined;
  }
}

export function createRawUrlTemplates(
  repo: GitHubRepo,
  templateOutput = "Custom_Clash.ini",
): RawUrlTemplates {
  const base = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/publish`;
  return {
    template: `${base}/templates/${templateOutput}`,
    providers: `${base}/providers/`,
  };
}
