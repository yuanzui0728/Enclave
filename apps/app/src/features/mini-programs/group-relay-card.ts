import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  formatDateTimeCached,
  formatMessageTimestamp,
  parseTimestamp,
} from "../../lib/format";

const t = translateRuntimeMessage;
import type { ResultCardFooterCopy } from "../chat/result-card-footer";
import { parseGroupRelaySummaryMessage } from "./group-relay-message";

type GroupRelaySummary = NonNullable<
  ReturnType<typeof parseGroupRelaySummaryMessage>
>;

export function resolveGroupRelayCompletionTime(summary: GroupRelaySummary) {
  if (summary.statusLabel === "已回填") { // i18n-ignore-line
    return summary.publishedAtLabel ?? summary.timestampLabel ?? null;
  }

  if (summary.statusLabel === "已完成") { // i18n-ignore-line
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
    // 走查 R68：原版硬编 `new Intl.DateTimeFormat("zh-CN", ...)`——en-US /
    // ja-JP / ko-KR locale 用户在群聊里看到「群接龙」回填范围卡片时，起始
    // 时间走 formatMessageTimestamp（按 runtime locale），结束时间却走 zh-CN
    // 输出（"12:34" 还好，"上午/下午 12 时" 类 zh-CN 长格式更明显）。改走
    // formatDateTimeCached——内部 getActiveLocale() 接 i18n runtime，cache 也
    // 命中。和姊妹 lib/format.ts 已加 cache 的 formatter 完全一致。
    return `${formatMessageTimestamp(summary.timestampLabel)} - ${formatDateTimeCached(
      endedAt,
      {
        hour: "2-digit",
        minute: "2-digit",
      },
    )}`;
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
      label: t(msg`首次回填`),
      tone: "info" as const,
    };
  }

  return {
    label: t(msg`多次回填`),
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
      label: t(msg`已全部确认`),
      tone: "success" as const,
    };
  }

  return {
    label: t(msg`仍有待确认`),
    tone: "warning" as const,
  };
}

export function resolveGroupRelayCtaCopy(
  summary: GroupRelaySummary,
): ResultCardFooterCopy {
  const pendingCount = parseGroupRelayCount(summary.pendingMemberCountLabel);
  if (pendingCount === 0) {
    return {
      description: t(msg`点击查看最终结果，必要时再覆盖新的完成状态`),
      actionLabel: t(msg`查看结果`),
      tone: "success" as const,
      ariaLabel: t(msg`查看${summary.sourceGroupName}的群接龙结果`),
    };
  }

  return {
    description: t(msg`点击继续查看和回填接龙`),
    actionLabel: t(msg`继续接龙`),
    tone: "warning" as const,
    ariaLabel: t(msg`继续接龙${summary.sourceGroupName}的群接龙结果`),
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
