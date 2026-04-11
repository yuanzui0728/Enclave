import { parseTimestamp } from "../../lib/format";
import { parseGroupCallInviteMessage } from "./group-call-message";

type GroupCallInvite = NonNullable<
  ReturnType<typeof parseGroupCallInviteMessage>
>;

export function resolveGroupCallCompletionBadge(invite: GroupCallInvite) {
  if (invite.status !== "ended" || !invite.activeCount) {
    return null;
  }

  if (invite.activeCount.current <= 0) {
    return {
      label: "无人加入",
      tone: "danger" as const,
    };
  }

  if (invite.activeCount.current >= invite.activeCount.total) {
    return {
      label: "全员加入",
      tone: "success" as const,
    };
  }

  return {
    label: "部分加入",
    tone: "warning" as const,
  };
}

export function resolveGroupCallFooterCopy(
  invite: GroupCallInvite,
  canReopenCall: boolean,
) {
  if (invite.status === "ended") {
    return canReopenCall
      ? {
          description:
            invite.kind === "video"
              ? "点击可基于这张卡片重新发起当前群视频通话。"
              : "点击可基于这张卡片重新发起当前群语音通话。",
          actionLabel: "重新发起",
          actionTone: "info" as const,
          ariaLabel: `重新发起 ${invite.groupName} 的群通话`,
        }
      : {
          description:
            invite.kind === "video"
              ? "这轮群视频通话已经结束，当前保留为状态记录卡片。"
              : "这轮群语音通话已经结束，当前保留为状态记录卡片。",
          actionLabel: "查看记录",
          actionTone: "muted" as const,
          ariaLabel: `查看 ${invite.groupName} 的群通话记录`,
        };
  }

  return canReopenCall
    ? {
        description:
          invite.kind === "video"
            ? "点击可回到当前群视频通话工作台。"
            : "点击可回到当前群语音通话工作台。",
        actionLabel: invite.kind === "voice" ? "回到语音" : "回到视频",
        actionTone: "info" as const,
        ariaLabel: `回到 ${invite.groupName} 的群通话工作台`,
      }
    : {
        description:
          invite.kind === "video"
            ? "当前消息已转成群视频通话卡片，便于群成员识别画面状态。"
            : "当前消息已转成群语音通话卡片，便于群成员识别状态。",
        actionLabel: invite.kind === "voice" ? "语音中" : "视频中",
        actionTone: "info" as const,
        ariaLabel: `查看 ${invite.groupName} 的群通话状态`,
      };
}

export function formatGroupCallRangeSummary(startedAt: string, endedAt: string) {
  const startedAtTs = parseTimestamp(startedAt);
  const endedAtTs = parseTimestamp(endedAt);
  if (startedAtTs === null || endedAtTs === null) {
    return `开始于 ${startedAt} · 结束于 ${endedAt}`;
  }

  const startedAtDate = new Date(startedAtTs);
  const endedAtDate = new Date(endedAtTs);
  const sameDay =
    startedAtDate.getFullYear() === endedAtDate.getFullYear() &&
    startedAtDate.getMonth() === endedAtDate.getMonth() &&
    startedAtDate.getDate() === endedAtDate.getDate();

  if (sameDay) {
    return `${formatCallClockLabel(startedAtDate)} - ${formatCallClockLabel(endedAtDate)}`;
  }

  return `${formatCallDayClockLabel(startedAtDate)} - ${formatCallDayClockLabel(endedAtDate)}`;
}

function formatCallClockLabel(date: Date) {
  return `${padCallTimeSegment(date.getHours())}:${padCallTimeSegment(date.getMinutes())}`;
}

function formatCallDayClockLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()} ${formatCallClockLabel(date)}`;
}

function padCallTimeSegment(value: number) {
  return value.toString().padStart(2, "0");
}
