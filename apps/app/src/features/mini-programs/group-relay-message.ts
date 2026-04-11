const GROUP_RELAY_MESSAGE_PREFIX = "[群接龙]";

export type GroupRelaySummaryStatus =
  | "pending"
  | "completed"
  | "published";

export function buildGroupRelaySummaryMessage(
  sourceGroupName: string,
  status: GroupRelaySummaryStatus = "pending",
) {
  return [
    `${GROUP_RELAY_MESSAGE_PREFIX} ${sourceGroupName}`,
    `状态 ${formatGroupRelayStatusLabel(status)}`,
    ...buildGroupRelaySummaryLines(status),
  ].join("\n");
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
  const summaryLines = lines
    .slice(1 + Number(Boolean(statusLabel)))
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  return {
    sourceGroupName,
    statusLabel,
    summaryLines,
  };
}

function parseGroupRelayStatusLabel(line: string | undefined) {
  if (!line || !line.startsWith("状态 ")) {
    return null;
  }

  return line.replace(/^状态\s+/, "").trim() || null;
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

function buildGroupRelaySummaryLines(status: GroupRelaySummaryStatus) {
  if (status === "published") {
    return [
      "1. 已从桌面端群聊打开群接龙工作台。",
      "2. 当前统计结果已经回填到原群聊，可继续在群里跟进补充名单。",
      "3. 如需继续调整，重新打开群接龙后再次回填即可覆盖最新结果。",
    ];
  }

  if (status === "completed") {
    return [
      "1. 已从桌面端群聊打开群接龙工作台。",
      "2. 当前名单和未确认成员已经整理完成，随时可以回填到原群聊。",
      "3. 请确认最终结果后再一键回填，避免群里出现过期统计。",
    ];
  }

  return [
    "1. 已从桌面端群聊打开群接龙工作台。",
    "2. 当前正在整理接龙名单和未确认成员。",
    "3. 请按顺序继续接龙，或直接在群里补充结果。",
  ];
}
