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
  activeRelayCountLabel?: string | null,
  pendingMemberCountLabel?: string | null,
  publishCountLabel?: string | null,
) {
  return [
    `${GROUP_RELAY_MESSAGE_PREFIX} ${sourceGroupName}`,
    `状态 ${formatGroupRelayStatusLabel(status)}`,
    `时间 ${recordedAt}`,
    publishedAt ? `回填于 ${publishedAt}` : null,
    `发起来源 ${formatGroupRelaySourceLabel(launchSource)}`,
    publishedAt ? `回填来源 ${formatGroupRelaySourceLabel(publishedSource)}` : null,
    activeRelayCountLabel ? `进行中 ${activeRelayCountLabel}` : null,
    pendingMemberCountLabel ? `待确认 ${pendingMemberCountLabel}` : null,
    publishCountLabel ? `回填次数 ${publishCountLabel}` : null,
    `结果摘要 ${formatGroupRelayResultSummary(status, pendingMemberCountLabel)}`,
    ...buildGroupRelaySummaryLines(
      status,
      launchSource,
      publishCountLabel,
      pendingMemberCountLabel,
    ),
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
  let cursor = 1;

  const statusLabel = parseGroupRelayStatusLabel(lines[cursor]);
  if (statusLabel) {
    cursor += 1;
  }

  const timestampLabel = parseGroupRelayTimestampLabel(lines[cursor]);
  if (timestampLabel) {
    cursor += 1;
  }

  const publishedAtLabel = parseGroupRelayPublishedAtLabel(lines[cursor]);
  if (publishedAtLabel) {
    cursor += 1;
  }

  const launchSourceLabel = parseGroupRelayLaunchSourceLabel(lines[cursor]);
  const launchSource = parseGroupRelaySourceValue(launchSourceLabel);
  if (launchSourceLabel) {
    cursor += 1;
  }

  const publishedSourceLabel = parseGroupRelayPublishedSourceLabel(
    lines[cursor],
  );
  const publishedSource = parseGroupRelaySourceValue(publishedSourceLabel);
  if (publishedSourceLabel) {
    cursor += 1;
  }

  const activeRelayCountLabel = parseGroupRelayActiveRelayCountLabel(
    lines[cursor],
  );
  if (activeRelayCountLabel) {
    cursor += 1;
  }

  const pendingMemberCountLabel = parseGroupRelayPendingMemberCountLabel(
    lines[cursor],
  );
  if (pendingMemberCountLabel) {
    cursor += 1;
  }

  const publishCountLabel = parseGroupRelayPublishCountLabel(lines[cursor]);
  if (publishCountLabel) {
    cursor += 1;
  }

  const resultSummaryLabel = parseGroupRelayResultSummaryLabel(lines[cursor]);
  if (resultSummaryLabel) {
    cursor += 1;
  }

  const summaryLines = lines
    .slice(cursor)
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
    activeRelayCountLabel,
    pendingMemberCountLabel,
    publishCountLabel,
    resultSummaryLabel,
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

function parseGroupRelayActiveRelayCountLabel(line: string | undefined) {
  if (!line || !line.startsWith("进行中 ")) {
    return null;
  }

  return line.replace(/^进行中\s+/, "").trim() || null;
}

function parseGroupRelayPendingMemberCountLabel(line: string | undefined) {
  if (!line || !line.startsWith("待确认 ")) {
    return null;
  }

  return line.replace(/^待确认\s+/, "").trim() || null;
}

function parseGroupRelayPublishCountLabel(line: string | undefined) {
  if (!line || !line.startsWith("回填次数 ")) {
    return null;
  }

  return line.replace(/^回填次数\s+/, "").trim() || null;
}

function parseGroupRelayPublishCount(label: string | null | undefined) {
  if (!label) {
    return null;
  }

  const matched = label.match(/\d+/);
  if (!matched) {
    return null;
  }

  const count = Number(matched[0]);
  return Number.isFinite(count) ? count : null;
}

function parseGroupRelayResultSummaryLabel(line: string | undefined) {
  if (!line || !line.startsWith("结果摘要 ")) {
    return null;
  }

  return line.replace(/^结果摘要\s+/, "").trim() || null;
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

function formatGroupRelayResultSummary(
  status: GroupRelaySummaryStatus,
  pendingMemberCountLabel?: string | null,
) {
  if (status === "published") {
    if (parseGroupRelayPublishCount(pendingMemberCountLabel) === 0) {
      return "结果已回填，当前已全部确认";
    }

    return "结果已回填，可继续覆盖";
  }

  if (status === "completed") {
    return "名单已整理，待回填";
  }

  return "名单整理中，待继续";
}

function buildGroupRelaySummaryLines(
  status: GroupRelaySummaryStatus,
  source: GroupRelaySummarySource,
  publishCountLabel?: string | null,
  pendingMemberCountLabel?: string | null,
) {
  const sourceLabel = formatGroupRelaySourceLabel(source);
  const publishCount = parseGroupRelayPublishCount(publishCountLabel);
  const pendingCount = parseGroupRelayPublishCount(pendingMemberCountLabel);

  if (status === "published") {
    if (pendingCount === 0) {
      return [
        `1. 已从${sourceLabel}群聊完成本轮群接龙结果回填。`,
        "2. 当前名单已经全部确认，群里看到的是这一轮的最终完成结果。",
        "3. 如后续有人补报或变更，再次打开群接龙并回填即可覆盖新的最终状态。",
      ];
    }

    if (publishCount !== null && publishCount > 1) {
      return [
        `1. 已从${sourceLabel}群聊再次打开群接龙工作台。`,
        "2. 当前统计结果已经再次回填到原群聊，正文说明和人数状态已按最新一轮覆盖。",
        "3. 如需继续调整，后续回填会继续覆盖这轮结果，不再保留过期版本。",
      ];
    }

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
