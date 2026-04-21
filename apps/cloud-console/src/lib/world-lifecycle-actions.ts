import type {
  CloudWorldLifecycleStatus,
  CloudWorldSummary,
} from "@yinjie/contracts";
import { cloudAdminApi } from "./cloud-admin-api";

export type WorldLifecycleAction =
  | "resume"
  | "suspend"
  | "retry"
  | "reconcile";

export const ALL_WORLD_LIFECYCLE_ACTIONS = [
  "resume",
  "suspend",
  "retry",
  "reconcile",
] as const satisfies readonly WorldLifecycleAction[];

export const WORLDS_PAGE_ACTIONS =
  ALL_WORLD_LIFECYCLE_ACTIONS satisfies readonly WorldLifecycleAction[];

export const JOBS_PAGE_ACTIONS = [
  "resume",
  "retry",
  "reconcile",
] as const satisfies readonly WorldLifecycleAction[];

export const DASHBOARD_ACTIVE_JOB_ACTIONS = [
  "resume",
  "reconcile",
] as const satisfies readonly WorldLifecycleAction[];

export const DASHBOARD_FAILED_JOB_ACTIONS = [
  "resume",
  "retry",
  "reconcile",
] as const satisfies readonly WorldLifecycleAction[];

export const DASHBOARD_ATTENTION_ACTIONS = [
  "resume",
  "retry",
  "reconcile",
] as const satisfies readonly WorldLifecycleAction[];

export type ConfirmableWorldLifecycleAction = Extract<
  WorldLifecycleAction,
  "suspend" | "retry"
>;

export const CONFIRMABLE_WORLD_LIFECYCLE_ACTIONS = [
  "suspend",
  "retry",
] as const satisfies readonly ConfirmableWorldLifecycleAction[];

export const WORLD_LIFECYCLE_ACTION_RULES = {
  queued: ["resume", "retry", "reconcile"],
  creating: ["retry", "reconcile"],
  bootstrapping: ["retry", "reconcile"],
  starting: ["suspend", "retry", "reconcile"],
  ready: ["suspend", "reconcile"],
  sleeping: ["resume", "reconcile"],
  stopping: ["resume", "reconcile"],
  failed: ["resume", "retry", "reconcile"],
  disabled: ["reconcile"],
  deleting: ["reconcile"],
} as const satisfies Record<
  CloudWorldLifecycleStatus,
  readonly WorldLifecycleAction[]
>;

function getAllowedWorldActions(status: CloudWorldLifecycleStatus) {
  return WORLD_LIFECYCLE_ACTION_RULES[status] as readonly WorldLifecycleAction[];
}

export function canResumeWorld(status: CloudWorldLifecycleStatus) {
  return getAllowedWorldActions(status).includes("resume");
}

export function canSuspendWorld(status: CloudWorldLifecycleStatus) {
  return getAllowedWorldActions(status).includes("suspend");
}

export function canRetryWorld(status: CloudWorldLifecycleStatus) {
  return getAllowedWorldActions(status).includes("retry");
}

export function isWorldActionAllowed(
  status: CloudWorldLifecycleStatus,
  action: WorldLifecycleAction,
) {
  return getAllowedWorldActions(status).includes(action);
}

export function listAllowedWorldActions(
  status: CloudWorldLifecycleStatus,
  actions: readonly WorldLifecycleAction[],
) {
  return actions.filter((action) => isWorldActionAllowed(status, action));
}

export function createWorldActionLabel(
  action: WorldLifecycleAction,
  world: Pick<CloudWorldSummary, "name">,
) {
  switch (action) {
    case "resume":
      return `${world.name} resume queued.`;
    case "suspend":
      return `${world.name} suspend queued.`;
    case "retry":
      return `${world.name} retry queued.`;
    case "reconcile":
    default:
      return `${world.name} reconcile triggered.`;
  }
}

export function createWorldActionDisplayLabel(action: WorldLifecycleAction) {
  switch (action) {
    case "resume":
      return "Resume";
    case "suspend":
      return "Suspend";
    case "retry":
      return "Retry";
    case "reconcile":
    default:
      return "Reconcile";
  }
}

export function createWorldActionPendingLabel(action: WorldLifecycleAction) {
  switch (action) {
    case "resume":
      return "Resuming...";
    case "suspend":
      return "Suspending...";
    case "retry":
      return "Retrying...";
    case "reconcile":
    default:
      return "Reconciling...";
  }
}

export function createWorldActionAriaLabel(
  action: WorldLifecycleAction,
  world: Pick<CloudWorldSummary, "name">,
) {
  return `${createWorldActionDisplayLabel(action)} ${world.name}`;
}

export function requiresWorldActionConfirmation(
  action: WorldLifecycleAction,
): action is ConfirmableWorldLifecycleAction {
  return (
    CONFIRMABLE_WORLD_LIFECYCLE_ACTIONS as readonly WorldLifecycleAction[]
  ).includes(action);
}

export function createWorldActionConfirmationCopy(
  action: ConfirmableWorldLifecycleAction,
  world: Pick<CloudWorldSummary, "name">,
) {
  switch (action) {
    case "suspend":
      return {
        title: `Suspend ${world.name}?`,
        description:
          "The world will move toward sleeping state and active sessions may need to reconnect after it wakes again.",
        confirmLabel: "Suspend world",
        pendingLabel: createWorldActionPendingLabel(action),
        danger: true,
      };
    case "retry":
    default:
      return {
        title: `Retry recovery for ${world.name}?`,
        description:
          "This will queue a new recovery action and clear the current failure state for the world.",
        confirmLabel: "Retry recovery",
        pendingLabel: createWorldActionPendingLabel(action),
        danger: true,
      };
  }
}

export function performWorldLifecycleAction(
  worldId: string,
  action: WorldLifecycleAction,
) {
  switch (action) {
    case "resume":
      return cloudAdminApi.resumeWorld(worldId);
    case "suspend":
      return cloudAdminApi.suspendWorld(worldId);
    case "retry":
      return cloudAdminApi.retryWorld(worldId);
    case "reconcile":
    default:
      return cloudAdminApi.reconcileWorld(worldId);
  }
}

export function performWorldLifecycleActionWithMeta(
  worldId: string,
  action: WorldLifecycleAction,
) {
  switch (action) {
    case "resume":
      return cloudAdminApi.resumeWorldWithMeta(worldId);
    case "suspend":
      return cloudAdminApi.suspendWorldWithMeta(worldId);
    case "retry":
      return cloudAdminApi.retryWorldWithMeta(worldId);
    case "reconcile":
    default:
      return cloudAdminApi.reconcileWorldWithMeta(worldId);
  }
}
