import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { parseTimestamp } from "../../lib/format";
import { parseGroupCallInviteMessage } from "./group-call-message";
import type { ResultCardFooterCopy } from "./result-card-footer";

const t = translateRuntimeMessage;

type GroupCallInvite = NonNullable<
  ReturnType<typeof parseGroupCallInviteMessage>
>;

export function resolveGroupCallCompletionBadge(invite: GroupCallInvite) {
  if (invite.status !== "ended" || !invite.activeCount) {
    return null;
  }

  if (invite.activeCount.current <= 0) {
    return {
      label: t(msg`无人加入`),
      tone: "danger" as const,
    };
  }

  if (invite.activeCount.current >= invite.activeCount.total) {
    return {
      label: t(msg`全员加入`),
      tone: "success" as const,
    };
  }

  return {
    label: t(msg`部分加入`),
    tone: "warning" as const,
  };
}

export function resolveGroupCallFooterCopy(
  invite: GroupCallInvite,
  canReopenCall: boolean,
): ResultCardFooterCopy {
  if (invite.status === "ended") {
    return canReopenCall
      ? {
          description: t(msg`点击重新发起`),
          actionLabel: t(msg`重新发起`),
          tone: "info" as const,
          ariaLabel: t(msg`重新发起 ${invite.groupName} 的群通话`),
        }
      : {
          description: t(msg`通话已结束`),
          actionLabel: t(msg`查看记录`),
          tone: "muted" as const,
          ariaLabel: t(msg`查看 ${invite.groupName} 的群通话记录`),
        };
  }

  return canReopenCall
    ? {
        description:
          invite.kind === "video"
            ? t(msg`点击回到视频通话`)
            : t(msg`点击回到语音通话`),
        actionLabel:
          invite.kind === "voice" ? t(msg`回到语音`) : t(msg`回到视频`),
        tone: "info" as const,
        ariaLabel: t(msg`回到 ${invite.groupName} 的群通话`),
      }
    : {
        description:
          invite.kind === "video"
            ? t(msg`视频通话中`)
            : t(msg`语音通话中`),
        actionLabel:
          invite.kind === "voice" ? t(msg`语音中`) : t(msg`视频中`),
        tone: "info" as const,
        ariaLabel: t(msg`查看 ${invite.groupName} 的群通话状态`),
      };
}

export function formatGroupCallRangeSummary(startedAt: string, endedAt: string) {
  const startedAtTs = parseTimestamp(startedAt);
  const endedAtTs = parseTimestamp(endedAt);
  if (startedAtTs === null || endedAtTs === null) {
    return t(msg`开始于 ${startedAt} · 结束于 ${endedAt}`);
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
