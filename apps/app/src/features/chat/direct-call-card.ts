import { parseDirectCallInviteMessage } from "./group-call-message";

type DirectCallInvite = NonNullable<
  ReturnType<typeof parseDirectCallInviteMessage>
>;

export function resolveDirectCallStatusLabel(invite: DirectCallInvite) {
  if (invite.connectionStatus === "ended") {
    return "已结束";
  }

  if (invite.connectionStatus === "connected") {
    return invite.kind === "video" ? "画面已接通" : "已接通";
  }

  return invite.kind === "video" ? "等待接入画面" : "等待接听";
}

export function resolveDirectCallFooterCopy(
  invite: DirectCallInvite,
  canReopenCall: boolean,
) {
  if (invite.connectionStatus === "ended") {
    return canReopenCall
      ? {
          description:
            invite.kind === "video"
              ? "点击可重新发起当前单聊视频通话。"
              : "点击可重新发起当前单聊语音通话。",
          actionLabel: "重新发起",
          actionTone: "info" as const,
          ariaLabel: `重新发起 ${invite.title} 的单聊通话`,
        }
      : {
          description:
            invite.kind === "video"
              ? "这轮单聊视频通话已经结束，当前保留为状态记录卡片。"
              : "这轮单聊语音通话已经结束，当前保留为状态记录卡片。",
          actionLabel: "查看记录",
          actionTone: "muted" as const,
          ariaLabel: `查看 ${invite.title} 的单聊通话记录`,
        };
  }

  return canReopenCall
    ? {
        description:
          invite.kind === "video"
            ? "点击可回到当前单聊视频通话工作台。"
            : "点击可回到当前单聊语音通话工作台。",
        actionLabel: invite.kind === "voice" ? "回到语音" : "回到视频",
        actionTone: "info" as const,
        ariaLabel: `回到 ${invite.title} 的单聊通话工作台`,
      }
    : {
        description:
          invite.kind === "video"
            ? "当前消息已转成单聊视频通话卡片，方便快速识别状态。"
            : "当前消息已转成单聊语音通话卡片，方便快速识别状态。",
        actionLabel: invite.kind === "voice" ? "语音中" : "视频中",
        actionTone: "info" as const,
        ariaLabel: `查看 ${invite.title} 的单聊通话状态`,
      };
}
