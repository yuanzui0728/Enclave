const GROUP_RELAY_MESSAGE_PREFIX = "[群接龙]";

export type GroupRelaySummaryStatus =
  | "pending"
  | "completed"
  | "published";
export type GroupRelaySummarySource = "desktop" | "mobile";

export function buildGroupRelaySummaryMessage(
  sourceGroupName: string,
  status: GroupRelaySummaryStatus = "pending",
  recordedAt = new Date().toISOString(),
  publishedAt?: string,
  launchSource: GroupRelaySummarySource = "desktop",
  publishedSource: GroupRelaySummarySource = launchSource,
) {
  return [
    `${GROUP_RELAY_MESSAGE_PREFIX} ${sourceGroupName}`,
    `状态 ${formatGroupRelayStatusLabel(status)}`,
    `时间 ${recordedAt}`,
    publishedAt ? `回填于 ${publishedAt}` : null,
    `发起来源 ${formatGroupRelaySourceLabel(launchSource)}`,
    publishedAt ? `回填来源 ${formatGroupRelaySourceLabel(publishedSource)}` : null,
    ...buildGroupRelaySummaryLines(status, launchSource),
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseGroupRelaySummaryMessage(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines[0];

  if (!header?.startsWith(`${GROUP_RELAY_MESSAGE_PREFIX} `)) {
    return null;
  }

  const sourceGroupName =
    header.slice(GROUP_RELAY_MESSAGE_PREFIX.length).trim() || "当前群聊";
  const statusLabel = parseGroupRelayStatusLabel(lines[1]);
  const timestampLabel = parseGroupRelayTimestampLabel(
    lines[1 + Number(Boolean(statusLabel))],
  );
  const publishedAtLabel = parseGroupRelayPublishedAtLabel(
    lines[
      1 +
        Number(Boolean(statusLabel)) +
        Number(Boolean(timestampLabel))
    ],
  );
  const launchSourceLabel = parseGroupRelayLaunchSourceLabel(
    lines[
      1 +
        Number(Boolean(statusLabel)) +
        Number(Boolean(timestampLabel)) +
        Number(Boolean(publishedAtLabel))
    ],
  );
  const launchSource = parseGroupRelaySourceValue(launchSourceLabel);
  const publishedSourceLabel = parseGroupRelayPublishedSourceLabel(
    lines[
      1 +
        Number(Boolean(statusLabel)) +
        Number(Boolean(timestampLabel)) +
        Number(Boolean(publishedAtLabel)) +
        Number(Boolean(launchSourceLabel))
    ],
  );
  const publishedSource = parseGroupRelaySourceValue(publishedSourceLabel);
  const summaryLines = lines
    .slice(
      1 +
        Number(Boolean(statusLabel)) +
        Number(Boolean(timestampLabel)) +
        Number(Boolean(publishedAtLabel)) +
        Number(Boolean(launchSourceLabel)) +
        Number(Boolean(publishedSourceLabel)),
    )
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  return {
    sourceGroupName,
    statusLabel,
    timestampLabel,
    publishedAtLabel,
    launchSourceLabel,
    launchSource,
    publishedSourceLabel,
    publishedSource,
    summaryLines,
  };
}

function parseGroupRelayStatusLabel(line: string | undefined) {
  if (!line || !line.startsWith("状态 ")) {
    return null;
  }

  return line.replace(/^状态\s+/, "").trim() || null;
}

function parseGroupRelayTimestampLabel(line: string | undefined) {
  if (!line || !line.startsWith("时间 ")) {
    return null;
  }

  return line.replace(/^时间\s+/, "").trim() || null;
}

function parseGroupRelayPublishedAtLabel(line: string | undefined) {
  if (!line || !line.startsWith("回填于 ")) {
    return null;
  }

  return line.replace(/^回填于\s+/, "").trim() || null;
}

function parseGroupRelayLaunchSourceLabel(line: string | undefined) {
  if (!line || !line.startsWith("发起来源 ")) {
    return null;
  }

  return line.replace(/^发起来源\s+/, "").trim() || null;
}

function parseGroupRelayPublishedSourceLabel(line: string | undefined) {
  if (!line || !line.startsWith("回填来源 ")) {
    return null;
  }

  return line.replace(/^回填来源\s+/, "").trim() || null;
}

function parseGroupRelaySourceValue(
  sourceLabel: string | null,
): GroupRelaySummarySource | null {
  if (sourceLabel === "桌面端") {
    return "desktop";
  }

  if (sourceLabel === "手机端") {
    return "mobile";
  }

  return null;
}

function formatGroupRelayStatusLabel(status: GroupRelaySummaryStatus) {
  if (status === "published") {
    return "已回填";
  }

  if (status === "completed") {
    return "已完成";
  }

  return "待继续";
}

function formatGroupRelaySourceLabel(source: GroupRelaySummarySource) {
  return source === "mobile" ? "手机端" : "桌面端";
}

function buildGroupRelaySummaryLines(
  status: GroupRelaySummaryStatus,
  source: GroupRelaySummarySource,
) {
  const sourceLabel = formatGroupRelaySourceLabel(source);

  if (status === "published") {
    return [
      `1. 已从${sourceLabel}群聊打开群接龙工作台。`,
      "2. 当前统计结果已经回填到原群聊，可继续在群里跟进补充名单。",
      "3. 如需继续调整，重新打开群接龙后再次回填即可覆盖最新结果。",
    ];
  }

  if (status === "completed") {
    return [
      `1. 已从${sourceLabel}群聊打开群接龙工作台。`,
      "2. 当前名单和未确认成员已经整理完成，随时可以回填到原群聊。",
      "3. 请确认最终结果后再一键回填，避免群里出现过期统计。",
    ];
  }

  return [
    `1. 已从${sourceLabel}群聊打开群接龙工作台。`,
    "2. 当前正在整理接龙名单和未确认成员。",
    "3. 请按顺序继续接龙，或直接在群里补充结果。",
  ];
}
