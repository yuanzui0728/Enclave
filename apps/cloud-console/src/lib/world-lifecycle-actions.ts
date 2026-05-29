import type {
  CloudWorldLifecycleStatus,
  CloudWorldSummary,
} from "@yinjie/contracts";
import { cloudAdminApi } from "./cloud-admin-api";
import {
  formatCloudConsoleSuspendWorldTitle,
  formatCloudConsoleRetryWorldRecoveryTitle,
  selectCloudConsoleText,
} from "./cloud-console-i18n";

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
  // 注销墓碑世界（仅供后台寻址浏览），无任何生命周期操作。
  archived: [],
} as const satisfies Record<
  CloudWorldLifecycleStatus,
  readonly WorldLifecycleAction[]
>;

function getAllowedWorldActions(status: CloudWorldLifecycleStatus) {
  // 兜底空数组：任何未登记状态都不暴露操作，避免 .includes 读到 undefined 崩页。
  return (WORLD_LIFECYCLE_ACTION_RULES[status] ??
    []) as readonly WorldLifecycleAction[];
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

// i18n-ignore-start: selectCloudConsoleText multi-locale dictionaries — zh/ja/ko are translated values, not hardcoded UI copy
export function createWorldActionDisplayLabel(
  action: WorldLifecycleAction,
  locale?: string | null,
) {
  switch (action) {
    case "resume":
      return selectCloudConsoleText(locale, {
        "en-US": "Resume",
        "zh-CN": "恢复",
        "ja-JP": "再開",
        "ko-KR": "재개",
      });
    case "suspend":
      return selectCloudConsoleText(locale, {
        "en-US": "Suspend",
        "zh-CN": "挂起",
        "ja-JP": "一時停止",
        "ko-KR": "일시 중지",
      });
    case "retry":
      return selectCloudConsoleText(locale, {
        "en-US": "Retry",
        "zh-CN": "重试",
        "ja-JP": "再試行",
        "ko-KR": "재시도",
      });
    case "reconcile":
    default:
      return selectCloudConsoleText(locale, {
        "en-US": "Reconcile",
        "zh-CN": "对账",
        "ja-JP": "整合",
        "ko-KR": "조정",
      });
  }
}

export function createWorldActionPendingLabel(
  action: WorldLifecycleAction,
  locale?: string | null,
) {
  switch (action) {
    case "resume":
      return selectCloudConsoleText(locale, {
        "en-US": "Resuming...",
        "zh-CN": "正在恢复…",
        "ja-JP": "再開中…",
        "ko-KR": "재개 중…",
      });
    case "suspend":
      return selectCloudConsoleText(locale, {
        "en-US": "Suspending...",
        "zh-CN": "正在挂起…",
        "ja-JP": "一時停止中…",
        "ko-KR": "일시 중지 중…",
      });
    case "retry":
      return selectCloudConsoleText(locale, {
        "en-US": "Retrying...",
        "zh-CN": "正在重试…",
        "ja-JP": "再試行中…",
        "ko-KR": "재시도 중…",
      });
    case "reconcile":
    default:
      return selectCloudConsoleText(locale, {
        "en-US": "Reconciling...",
        "zh-CN": "正在对账…",
        "ja-JP": "整合中…",
        "ko-KR": "조정 중…",
      });
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
  locale?: string | null,
) {
  // 标题里的 worldName 由 formatCloudConsole...Title() 渲染，它对 undefined locale
  // 默认回退到 getCurrentCloudConsoleLocale()。而 description/confirmLabel 走的是
  // selectCloudConsoleText(locale, ...)，undefined 直接回退 en-US。两条路径对齐到
  // "locale 没传就当 en-US"，避免出现「中文标题 + 英文描述」的混搭。
  const resolvedLocale = locale ?? "en-US";
  switch (action) {
    case "suspend":
      return {
        title: formatCloudConsoleSuspendWorldTitle(world.name, resolvedLocale),
        description: selectCloudConsoleText(resolvedLocale, {
          "en-US":
            "The world will move toward sleeping state and active sessions may need to reconnect after it wakes again.",
          "zh-CN":
            "世界将进入休眠状态，重新唤醒后活跃会话可能需要重新连接。",
          "ja-JP":
            "ワールドはスリープ状態に移行し、再開後はアクティブなセッションを再接続する必要がある場合があります。",
          "ko-KR":
            "월드는 절전 상태로 전환되며, 다시 깨어난 후 활성 세션은 재연결이 필요할 수 있습니다.",
        }),
        confirmLabel: selectCloudConsoleText(resolvedLocale, {
          "en-US": "Suspend world",
          "zh-CN": "挂起世界",
          "ja-JP": "ワールドを一時停止",
          "ko-KR": "월드 일시 중지",
        }),
        pendingLabel: createWorldActionPendingLabel(action, resolvedLocale),
        danger: true,
      };
    case "retry":
    default:
      return {
        title: formatCloudConsoleRetryWorldRecoveryTitle(
          world.name,
          resolvedLocale,
        ),
        description: selectCloudConsoleText(resolvedLocale, {
          "en-US":
            "This will queue a new recovery action and clear the current failure state for the world.",
          "zh-CN":
            "这会排队一个新的恢复动作，并清除该世界当前的失败状态。",
          "ja-JP":
            "新しい復旧アクションをキューに追加し、ワールドの現在の失敗状態をクリアします。",
          "ko-KR":
            "새 복구 작업을 큐에 추가하고 월드의 현재 실패 상태를 초기화합니다.",
        }),
        confirmLabel: selectCloudConsoleText(resolvedLocale, {
          "en-US": "Retry recovery",
          "zh-CN": "重试恢复",
          "ja-JP": "復旧を再試行",
          "ko-KR": "복구 재시도",
        }),
        pendingLabel: createWorldActionPendingLabel(action, resolvedLocale),
        danger: true,
      };
  }
}
// i18n-ignore-end

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
