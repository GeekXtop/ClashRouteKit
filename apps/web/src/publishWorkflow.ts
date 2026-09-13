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
  rules: string;
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

export function parseGitHubRemote(value: string): GitHubRepo | undefined {
  const trimmed = value.trim();
  const ssh = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/.exec(trimmed);
  if (ssh) return { owner: ssh[1]!, repo: ssh[2]! };
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return undefined;
    const [owner, repoRaw] = url.pathname.split("/").filter(Boolean);
    if (!owner || !repoRaw) return undefined;
    return { owner, repo: repoRaw.replace(/\.git$/, "") };
  } catch {
    return undefined;
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type WorkflowRunState =
  | "success"
  | "in-progress"
  | "queued"
  | "failed"
  | "unknown"
  | "unsupported";

export interface WorkflowRunStatus {
  state: WorkflowRunState;
  runUrl?: string;
  createdAt?: string;
  conclusion?: string;
}

export interface PublishStatusPayload {
  branch: string;
  workflow: WorkflowRunStatus;
}

export async function fetchGitRemote(fetcher: Fetcher = globalThis.fetch): Promise<string> {
  const response = await fetcher("/api/git/remote");
  const payload = (await response.json()) as { url?: unknown };
  if (!response.ok || typeof payload.url !== "string") {
    throw new Error("Invalid git remote response");
  }
  return payload.url;
}

export async function fetchPublishStatus(fetcher: Fetcher = globalThis.fetch): Promise<PublishStatusPayload> {
  const response = await fetcher("/api/git/publish-status");
  const payload = (await response.json()) as Partial<PublishStatusPayload> | null;
  if (
    !response.ok
    || !payload
    || typeof payload.branch !== "string"
    || !payload.workflow
    || typeof payload.workflow.state !== "string"
  ) {
    throw new Error("Invalid publish status response");
  }
  return payload as PublishStatusPayload;
}

export function createRawUrlTemplates(
  repo: GitHubRepo,
  templateOutput = "Custom_Clash.ini",
): RawUrlTemplates {
  const base = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/publish`;
  return {
    template: `${base}/templates/${templateOutput}`,
    rules: `${base}/rules/`,
  };
}
