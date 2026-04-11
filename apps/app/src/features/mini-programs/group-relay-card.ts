import {
  formatMessageTimestamp,
  parseTimestamp,
} from "../../lib/format";
import { parseGroupRelaySummaryMessage } from "./group-relay-message";

type GroupRelaySummary = NonNullable<
  ReturnType<typeof parseGroupRelaySummaryMessage>
>;

export function resolveGroupRelayCompletionTime(summary: GroupRelaySummary) {
  if (summary.statusLabel === "已回填") {
    return summary.publishedAtLabel ?? summary.timestampLabel ?? null;
  }

  if (summary.statusLabel === "已完成") {
    return summary.timestampLabel ?? null;
  }

  return null;
}

export function resolveGroupRelayPublishRangeLabel(summary: GroupRelaySummary) {
  if (!summary.publishedAtLabel || !summary.timestampLabel) {
    return null;
  }

  const startedAtTs = parseTimestamp(summary.timestampLabel);
  const endedAtTs = parseTimestamp(summary.publishedAtLabel);
  if (startedAtTs === null || endedAtTs === null) {
    return `${summary.timestampLabel} - ${summary.publishedAtLabel}`;
  }

  const startedAt = new Date(startedAtTs);
  const endedAt = new Date(endedAtTs);
  const sameDay =
    startedAt.getFullYear() === endedAt.getFullYear() &&
    startedAt.getMonth() === endedAt.getMonth() &&
    startedAt.getDate() === endedAt.getDate();

  if (sameDay) {
    return `${formatMessageTimestamp(summary.timestampLabel)} - ${new Intl.DateTimeFormat(
      "zh-CN",
      {
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(endedAt)}`;
  }

  return `${formatMessageTimestamp(summary.timestampLabel)} - ${formatMessageTimestamp(summary.publishedAtLabel)}`;
}

export function resolveGroupRelayPublishStageBadge(summary: GroupRelaySummary) {
  const publishCount = parseGroupRelayCount(summary.publishCountLabel);
  if (publishCount === null) {
    return null;
  }

  if (publishCount <= 1) {
    return {
      label: "首次回填",
      tone: "info" as const,
    };
  }

  return {
    label: "多次回填",
    tone: "success" as const,
  };
}

export function resolveGroupRelayCompletionBadge(summary: GroupRelaySummary) {
  const pendingCount = parseGroupRelayCount(summary.pendingMemberCountLabel);
  if (pendingCount === null) {
    return null;
  }

  if (pendingCount === 0) {
    return {
      label: "已全部确认",
      tone: "success" as const,
    };
  }

  return {
    label: "仍有待确认",
    tone: "warning" as const,
  };
}

export function resolveGroupRelayCtaCopy(summary: GroupRelaySummary) {
  const pendingCount = parseGroupRelayCount(summary.pendingMemberCountLabel);
  if (pendingCount === 0) {
    return {
      description: "点击查看最终结果，必要时再覆盖新的完成状态",
      actionLabel: "查看结果",
      tone: "success" as const,
    };
  }

  return {
    description: "点击继续查看和回填接龙",
    actionLabel: "继续接龙",
    tone: "warning" as const,
  };
}

function parseGroupRelayCount(label: string | null | undefined) {
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
