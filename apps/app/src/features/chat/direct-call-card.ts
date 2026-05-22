import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { parseDirectCallInviteMessage } from "./group-call-message";
import type { ResultCardFooterCopy } from "./result-card-footer";

const t = translateRuntimeMessage;

type DirectCallInvite = NonNullable<
  ReturnType<typeof parseDirectCallInviteMessage>
>;

export function resolveDirectCallStatusLabel(invite: DirectCallInvite) {
  if (invite.connectionStatus === "ended") {
    return t(msg`通话已结束`);
  }

  if (invite.connectionStatus === "connected") {
    return t(msg`已接通`);
  }

  return t(msg`等待接听`);
}

export function resolveDirectCallFooterCopy(
  invite: DirectCallInvite,
  canReopenCall: boolean,
): ResultCardFooterCopy {
  if (invite.connectionStatus === "ended") {
    return canReopenCall
      ? {
          description: t(msg`点击重新发起`),
          actionLabel: t(msg`重新发起`),
          tone: "info" as const,
          ariaLabel: t(msg`重新发起 ${invite.title} 的通话`),
        }
      : {
          description: t(msg`通话已结束`),
          actionLabel: t(msg`查看记录`),
          tone: "muted" as const,
          ariaLabel: t(msg`查看 ${invite.title} 的通话记录`),
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
        ariaLabel: t(msg`回到 ${invite.title} 的通话`),
      }
    : {
        description:
          invite.kind === "video"
            ? t(msg`视频通话中`)
            : t(msg`语音通话中`),
        actionLabel:
          invite.kind === "voice" ? t(msg`语音中`) : t(msg`视频中`),
        tone: "info" as const,
        ariaLabel: t(msg`查看 ${invite.title} 的通话状态`),
      };
}
