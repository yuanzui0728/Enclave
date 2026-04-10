import type { DesktopChatCallKind } from "../desktop/chat/desktop-chat-header-actions";

const DIRECT_VOICE_CALL_PREFIX = "[语音通话]";
const DIRECT_VIDEO_CALL_PREFIX = "[视频通话]";
const GROUP_VOICE_CALL_PREFIX = "[群语音通话]";
const GROUP_VIDEO_CALL_PREFIX = "[群视频通话]";

export type GroupCallInviteStatus = "ongoing" | "ended";
export type DirectCallInviteStatus = "waiting" | "connected" | "ended";

export function buildDirectCallInviteMessage(
  kind: DesktopChatCallKind,
  conversationTitle: string,
  status:
    | DirectCallInviteStatus
    | {
        status?: DirectCallInviteStatus;
        remoteJoined?: boolean;
        recordedAt?: string;
        durationMs?: number;
      } = "waiting",
) {
  const normalizedStatus: DirectCallInviteStatus =
    typeof status === "string"
      ? status
      : status.status
        ? status.status
      : status.remoteJoined
        ? "connected"
        : "waiting";
  const recordedAt =
    typeof status === "string" ? new Date().toISOString() : status.recordedAt;
  const durationLabel =
    typeof status === "string"
      ? null
      : formatCallInviteDuration(status.durationMs ?? null);
  const statusLabel =
    normalizedStatus === "ended"
      ? "已结束"
      : normalizedStatus === "connected"
        ? "已接通"
        : "等待接听";

  return [
    kind === "voice" ? DIRECT_VOICE_CALL_PREFIX : DIRECT_VIDEO_CALL_PREFIX,
    conversationTitle.trim() || "当前聊天",
    `当前状态 ${statusLabel}`,
    `${normalizedStatus === "ended" ? "结束于" : "发起于"} ${recordedAt ?? new Date().toISOString()}`,
    durationLabel ? `最近一轮 ${durationLabel}` : null,
    normalizedStatus === "ended"
      ? "本轮单聊通话已在桌面端结束，可继续在聊天里跟进。"
      : "已从桌面端打开单聊通话工作台，可直接查看当前通话状态。",
    normalizedStatus === "ended"
      ? "如需再次发起，请重新打开当前聊天顶部的通话面板。"
      : "如需继续加入或转到手机，请在当前聊天顶部的通话面板里操作。",
  ].join("\n");
}

export function buildGroupCallInviteMessage(
  kind: DesktopChatCallKind,
  groupName: string,
  counts?: {
    activeCount: number;
    totalCount: number;
  },
  status: GroupCallInviteStatus = "ongoing",
  recordedAt = new Date().toISOString(),
) {
  const normalizedTotalCount = Math.max(counts?.totalCount ?? 0, 0);
  const normalizedActiveCount = Math.min(
    Math.max(counts?.activeCount ?? 0, 0),
    normalizedTotalCount || Number.MAX_SAFE_INTEGER,
  );
  const waitingCount = Math.max(
    normalizedTotalCount - normalizedActiveCount,
    0,
  );

  return [
    kind === "voice" ? GROUP_VOICE_CALL_PREFIX : GROUP_VIDEO_CALL_PREFIX,
    groupName.trim() || "当前群聊",
    status === "ended" ? "状态 已结束" : "状态 进行中",
    `${status === "ended" ? "结束于" : "发起于"} ${recordedAt}`,
    normalizedTotalCount
      ? `当前在线 ${normalizedActiveCount}/${normalizedTotalCount} 人`
      : "当前在线人数待同步",
    normalizedTotalCount ? `待加入 ${waitingCount} 人` : "待加入人数待同步",
    status === "ended"
      ? "本轮群通话已在桌面端结束，可继续在群里跟进结果。"
      : "已从桌面端打开群通话工作台，可直接在聊天页继续查看成员状态。",
    status === "ended"
      ? "如需再次发起，请重新打开当前群聊顶部的通话面板。"
      : "如需继续加入或转到手机，请在当前群聊顶部的通话面板里操作。",
  ].join("\n");
}

export function parseDirectCallInviteMessage(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines[0];
  if (
    header !== DIRECT_VOICE_CALL_PREFIX &&
    header !== DIRECT_VIDEO_CALL_PREFIX
  ) {
    return null;
  }

  const timestampLabel = parseCallInviteTimestamp(lines[3]);
  const durationLabel = parseCallInviteDuration(lines[timestampLabel ? 4 : 3]);
  const summaryOffset = 3 + Number(Boolean(timestampLabel)) + Number(Boolean(durationLabel));

  return {
    kind: header === DIRECT_VOICE_CALL_PREFIX ? "voice" : "video",
    title: lines[1] || "当前聊天",
    connectionStatus: parseDirectCallStatus(lines[2]),
    timestampLabel,
    durationLabel,
    summaryLines: lines.slice(summaryOffset),
  } satisfies {
    kind: DesktopChatCallKind;
    title: string;
    connectionStatus: DirectCallInviteStatus | null;
    timestampLabel: string | null;
    durationLabel: string | null;
    summaryLines: string[];
  };
}

export function parseGroupCallInviteMessage(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines[0];
  if (
    header !== GROUP_VOICE_CALL_PREFIX &&
    header !== GROUP_VIDEO_CALL_PREFIX
  ) {
    return null;
  }

  const timestampLabel = parseCallInviteTimestamp(lines[3]);
  const metricOffset = timestampLabel ? 1 : 0;

  return {
    kind: header === GROUP_VOICE_CALL_PREFIX ? "voice" : "video",
    groupName: lines[1] || "当前群聊",
    status: parseGroupCallStatus(lines[2]),
    timestampLabel,
    activeCount: parseGroupCallMetric(
      lines[3 + metricOffset],
      /当前在线\s+(\d+)\/(\d+)\s+人/,
    ),
    waitingCount: parseGroupCallWaitingMetric(lines[4 + metricOffset]),
    summaryLines: lines.slice(5 + metricOffset),
  } satisfies {
    kind: DesktopChatCallKind;
    groupName: string;
    status: GroupCallInviteStatus;
    timestampLabel: string | null;
    activeCount: { current: number; total: number } | null;
    waitingCount: number | null;
    summaryLines: string[];
  };
}

function parseGroupCallStatus(line: string | undefined): GroupCallInviteStatus {
  if (line?.includes("已结束")) {
    return "ended";
  }

  return "ongoing";
}

function parseGroupCallMetric(line: string | undefined, pattern: RegExp) {
  if (!line) {
    return null;
  }

  const match = line.match(pattern);
  if (!match) {
    return null;
  }

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (Number.isNaN(current) || Number.isNaN(total)) {
    return null;
  }

  return {
    current,
    total,
  };
}

function parseDirectCallStatus(line: string | undefined) {
  if (!line) {
    return null;
  }

  if (line.includes("已结束")) {
    return "ended";
  }

  if (line.includes("已接通")) {
    return "connected";
  }

  if (line.includes("等待接听")) {
    return "waiting";
  }

  return null;
}

function parseCallInviteTimestamp(line: string | undefined) {
  if (!line) {
    return null;
  }

  if (line.startsWith("发起于 ") || line.startsWith("结束于 ")) {
    return line;
  }

  return null;
}

function parseCallInviteDuration(line: string | undefined) {
  if (!line) {
    return null;
  }

  if (line.startsWith("最近一轮 ")) {
    return line.replace(/^最近一轮\s+/, "").trim() || null;
  }

  return null;
}

function formatCallInviteDuration(durationMs: number | null) {
  if (durationMs === null || Number.isNaN(durationMs)) {
    return null;
  }

  const totalSeconds = Math.max(Math.round(durationMs / 1000), 0);
  if (totalSeconds < 60) {
    return `${totalSeconds} 秒`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!seconds) {
    return `${minutes} 分钟`;
  }

  return `${minutes} 分 ${seconds} 秒`;
}

function parseGroupCallWaitingMetric(line: string | undefined) {
  if (!line) {
    return null;
  }

  const match = line.match(/待加入\s+(\d+)\s+人/);
  if (!match) {
    return null;
  }

  const waitingCount = Number(match[1]);
  return Number.isNaN(waitingCount) ? null : waitingCount;
}
