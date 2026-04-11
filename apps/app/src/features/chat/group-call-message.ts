import type { DesktopChatCallKind } from "../desktop/chat/desktop-chat-header-actions";

const DIRECT_VOICE_CALL_PREFIX = "[语音通话]";
const DIRECT_VIDEO_CALL_PREFIX = "[视频通话]";
const GROUP_VOICE_CALL_PREFIX = "[群语音通话]";
const GROUP_VIDEO_CALL_PREFIX = "[群视频通话]";

export type GroupCallInviteStatus = "ongoing" | "ended";
export type DirectCallInviteStatus = "waiting" | "connected" | "ended";
export type CallInviteSource = "desktop" | "mobile";
export type DirectCallInviteSource = CallInviteSource;
export type GroupCallInviteSource = CallInviteSource;

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
        source?: DirectCallInviteSource;
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
  const sourceLabel =
    typeof status === "string" ? null : formatCallInviteSource(status.source);
  const statusLabel = formatDirectCallStatusLabel(kind, normalizedStatus);
  const summaryLines = buildDirectCallSummaryLines({
    kind,
    status: normalizedStatus,
    sourceLabel,
  });

  return [
    kind === "voice" ? DIRECT_VOICE_CALL_PREFIX : DIRECT_VIDEO_CALL_PREFIX,
    conversationTitle.trim() || "当前聊天",
    `当前状态 ${statusLabel}`,
    `${normalizedStatus === "ended" ? "结束于" : "发起于"} ${recordedAt ?? new Date().toISOString()}`,
    durationLabel ? `最近一轮 ${durationLabel}` : null,
    sourceLabel ? `发起设备 ${sourceLabel}` : null,
    ...summaryLines,
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
  source?: GroupCallInviteSource,
  snapshotRecordedAt = recordedAt,
  durationMs?: number,
  startedAt?: string,
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
  const sourceLabel = formatCallInviteSource(source);
  const durationLabel = formatCallInviteDuration(durationMs ?? null);
  const summaryLines = buildGroupCallSummaryLines({
    kind,
    status,
    sourceLabel,
  });

  return [
    kind === "voice" ? GROUP_VOICE_CALL_PREFIX : GROUP_VIDEO_CALL_PREFIX,
    groupName.trim() || "当前群聊",
    `状态 ${formatGroupCallStatusLabel(kind, status)}`,
    `${status === "ended" ? "结束于" : "发起于"} ${recordedAt}`,
    durationLabel ? `最近一轮 ${durationLabel}` : null,
    status === "ended" && startedAt ? `开始于 ${startedAt}` : null,
    sourceLabel ? `发起设备 ${sourceLabel}` : null,
    `人数快照 ${snapshotRecordedAt}`,
    normalizedTotalCount
      ? `当前在线 ${normalizedActiveCount}/${normalizedTotalCount} 人`
      : "当前在线人数待同步",
    normalizedTotalCount ? `待加入 ${waitingCount} 人` : "待加入人数待同步",
    ...summaryLines,
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
  const sourceLabel = parseCallInviteSource(
    lines[3 + Number(Boolean(timestampLabel)) + Number(Boolean(durationLabel))],
  );
  const source = parseCallInviteSourceValue(
    lines[3 + Number(Boolean(timestampLabel)) + Number(Boolean(durationLabel))],
  );
  const summaryOffset =
    3 +
    Number(Boolean(timestampLabel)) +
    Number(Boolean(durationLabel)) +
    Number(Boolean(sourceLabel));

  return {
    kind: header === DIRECT_VOICE_CALL_PREFIX ? "voice" : "video",
    title: lines[1] || "当前聊天",
    connectionStatus: parseDirectCallStatus(lines[2]),
    timestampLabel,
    durationLabel,
    source,
    sourceLabel,
    summaryLines: lines.slice(summaryOffset),
  } satisfies {
    kind: DesktopChatCallKind;
    title: string;
    connectionStatus: DirectCallInviteStatus | null;
    timestampLabel: string | null;
    durationLabel: string | null;
    source: DirectCallInviteSource | null;
    sourceLabel: string | null;
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
  const durationLabel = parseCallInviteDuration(lines[timestampLabel ? 4 : 3]);
  const startedAtLabel = parseCallInviteStartedAt(
    lines[3 + Number(Boolean(timestampLabel)) + Number(Boolean(durationLabel))],
  );
  const sourceLabel = parseCallInviteSource(
    lines[
      3 +
        Number(Boolean(timestampLabel)) +
        Number(Boolean(durationLabel)) +
        Number(Boolean(startedAtLabel))
    ],
  );
  const source = parseCallInviteSourceValue(
    lines[
      3 +
        Number(Boolean(timestampLabel)) +
        Number(Boolean(durationLabel)) +
        Number(Boolean(startedAtLabel))
    ],
  );
  const snapshotLabel = parseGroupCallSnapshotLabel(
    lines[
      3 +
        Number(Boolean(timestampLabel)) +
        Number(Boolean(durationLabel)) +
        Number(Boolean(startedAtLabel)) +
        Number(Boolean(sourceLabel))
    ],
  );
  const metricOffset =
    Number(Boolean(timestampLabel)) +
    Number(Boolean(durationLabel)) +
    Number(Boolean(startedAtLabel)) +
    Number(Boolean(sourceLabel)) +
    Number(Boolean(snapshotLabel));

  return {
    kind: header === GROUP_VOICE_CALL_PREFIX ? "voice" : "video",
    groupName: lines[1] || "当前群聊",
    status: parseGroupCallStatus(lines[2]),
    timestampLabel,
    recordedAt: parseCallInviteTimestampValue(lines[3]),
    durationLabel,
    startedAtLabel,
    startedAt: parseCallInviteStartedAtValue(startedAtLabel),
    source,
    sourceLabel,
    snapshotLabel,
    snapshotRecordedAt: snapshotLabel,
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
    recordedAt: string | null;
    durationLabel: string | null;
    startedAtLabel: string | null;
    startedAt: string | null;
    source: GroupCallInviteSource | null;
    sourceLabel: string | null;
    snapshotLabel: string | null;
    snapshotRecordedAt: string | null;
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

  if (line.includes("画面已接通")) {
    return "connected";
  }

  if (line.includes("等待接听")) {
    return "waiting";
  }

  if (line.includes("等待接入画面")) {
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

function parseCallInviteTimestampValue(line: string | undefined) {
  const timestampLabel = parseCallInviteTimestamp(line);
  if (!timestampLabel) {
    return null;
  }

  return timestampLabel.replace(/^(发起于|结束于)\s+/, "").trim() || null;
}

function parseCallInviteStartedAt(line: string | undefined) {
  if (!line) {
    return null;
  }

  if (line.startsWith("开始于 ")) {
    return line;
  }

  return null;
}

function parseCallInviteStartedAtValue(line: string | null) {
  if (!line) {
    return null;
  }

  return line.replace(/^开始于\s+/, "").trim() || null;
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

function parseCallInviteSource(line: string | undefined) {
  if (!line) {
    return null;
  }

  if (line.startsWith("发起设备 ")) {
    return line.replace(/^发起设备\s+/, "").trim() || null;
  }

  return null;
}

function parseCallInviteSourceValue(
  line: string | undefined,
): CallInviteSource | null {
  const sourceLabel = parseCallInviteSource(line);
  if (sourceLabel === "桌面端") {
    return "desktop";
  }

  if (sourceLabel === "手机端") {
    return "mobile";
  }

  return null;
}

function parseGroupCallSnapshotLabel(line: string | undefined) {
  if (!line) {
    return null;
  }

  if (line.startsWith("人数快照 ")) {
    return line.replace(/^人数快照\s+/, "").trim() || null;
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

function formatCallInviteSource(source: DirectCallInviteSource | undefined) {
  if (source === "desktop") {
    return "桌面端";
  }

  if (source === "mobile") {
    return "手机端";
  }

  return null;
}

export function buildGroupCallSummaryLines(input: {
  kind: DesktopChatCallKind;
  status: GroupCallInviteStatus;
  sourceLabel: string | null;
}) {
  const callLabel = input.kind === "video" ? "群视频通话" : "群语音通话";
  const panelLabel = input.kind === "video" ? "群视频通话面板" : "群语音通话面板";
  const sourceLabel = input.sourceLabel ?? "当前设备";

  if (input.status === "ended") {
    return [
      `本轮${callLabel}已结束，当前卡片会保留这轮状态记录。`,
      `如需再次发起，请重新打开当前群聊顶部的${panelLabel}。`,
    ];
  }

  return [
    `已从${sourceLabel}发起${callLabel}，当前工作台会继续同步在线人数和加入状态。`,
    `如需继续邀请成员、切回聊天或转到其他设备，请回到当前群聊顶部的${panelLabel}。`,
  ];
}

export function formatGroupCallStatusLabel(
  kind: DesktopChatCallKind,
  status: GroupCallInviteStatus,
) {
  if (status === "ended") {
    return "已结束";
  }

  return kind === "video" ? "画面进行中" : "进行中";
}

function formatDirectCallStatusLabel(
  kind: DesktopChatCallKind,
  status: DirectCallInviteStatus,
) {
  if (status === "ended") {
    return "已结束";
  }

  if (status === "connected") {
    return kind === "video" ? "画面已接通" : "已接通";
  }

  return kind === "video" ? "等待接入画面" : "等待接听";
}

function buildDirectCallSummaryLines(input: {
  kind: DesktopChatCallKind;
  status: DirectCallInviteStatus;
  sourceLabel: string | null;
}) {
  const callLabel = input.kind === "video" ? "单聊视频通话" : "单聊语音通话";
  const stateLabel =
    input.kind === "video" ? "当前画面与通话状态" : "当前通话状态";
  const panelLabel =
    input.kind === "video" ? "视频通话面板" : "语音通话面板";
  const sourceLabel = input.sourceLabel ?? "当前设备";

  if (input.status === "ended") {
    return [
      `本轮${callLabel}已结束，可继续在聊天里跟进。`,
      `如需再次发起，请重新打开当前聊天顶部的${panelLabel}。`,
    ];
  }

  return [
    `已从${sourceLabel}打开${callLabel}工作台，可直接查看${stateLabel}。`,
    `如需继续加入或切回聊天，请在当前聊天顶部的${panelLabel}里操作。`,
  ];
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
