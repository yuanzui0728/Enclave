// UI 文案版本的 group call helpers。group-call-message.ts 里那一组同名 helper
// 走的是协议编码（message.text 里裸 zh-CN 字串，收发两端互通），不能翻译。
// 这里给 UI 层（mobile-group-call-screen / desktop-group-call-panel /
// chat-message-list 渲染 invite 状态徽章时）用，返回当前 locale 的翻译。

import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { DesktopChatCallKind } from "./chat-header-actions";
import type {
  GroupCallInviteStatus,
  DirectCallInviteStatus,
} from "./group-call-message";

const t = translateRuntimeMessage;

export function getGroupCallStatusLabel(
  kind: DesktopChatCallKind,
  status: GroupCallInviteStatus,
) {
  if (status === "ended") return t(msg`已结束`);
  return kind === "video" ? t(msg`画面进行中`) : t(msg`进行中`);
}

export function getDirectCallStatusLabel(
  kind: DesktopChatCallKind,
  status: DirectCallInviteStatus,
) {
  if (status === "ended") return t(msg`已结束`);
  if (status === "connected") {
    return kind === "video" ? t(msg`画面已接通`) : t(msg`已接通`);
  }
  return kind === "video" ? t(msg`等待接入画面` ) : t(msg`等待接听`);
}

export function buildDirectCallWorkspaceSummaryLines(input: {
  kind: DesktopChatCallKind;
  status: DirectCallInviteStatus;
  sourceLabel: string | null;
}) {
  const sourceLabel = input.sourceLabel ?? t(msg`当前设备`);

  if (input.status === "ended") {
    if (input.kind === "video") {
      return [
        t(msg`本轮单聊视频通话已结束，可继续在聊天里跟进。`),
        t(msg`如需再次发起，请重新打开当前聊天顶部的视频通话面板。`),
      ];
    }
    return [
      t(msg`本轮单聊语音通话已结束，可继续在聊天里跟进。`),
      t(msg`如需再次发起，请重新打开当前聊天顶部的语音通话面板。`),
    ];
  }

  if (input.kind === "video") {
    return [
      t(
        msg`已从 ${sourceLabel} 打开单聊视频通话工作台，可直接查看当前画面与通话状态。`,
      ),
      t(msg`如需切回聊天或转到其他设备，请回到当前聊天顶部的视频通话面板。`),
    ];
  }
  return [
    t(
      msg`已从 ${sourceLabel} 打开单聊语音通话工作台，可直接查看当前通话状态。`,
    ),
    t(msg`如需切回聊天或转到其他设备，请回到当前聊天顶部的语音通话面板。`),
  ];
}

export function buildGroupCallWorkspaceSummaryLines(input: {
  kind: DesktopChatCallKind;
  status: GroupCallInviteStatus;
  sourceLabel: string | null;
  counts: {
    activeCount: number;
    totalCount: number;
    waitingCount: number;
  } | null;
}) {
  const sourceLabel = input.sourceLabel ?? t(msg`当前设备`);

  if (input.status === "ended") {
    const countsSummary = input.counts
      ? input.counts.waitingCount > 0
        ? t(
            msg`最终在线 ${input.counts.activeCount}/${input.counts.totalCount} 人，仍有 ${input.counts.waitingCount} 人未加入。`,
          )
        : t(
            msg`最终在线 ${input.counts.activeCount}/${input.counts.totalCount} 人，本轮成员已全部完成加入。`,
          )
      : t(msg`当前没有保留完整在线人数快照。`);

    if (input.kind === "video") {
      return [
        t(msg`本轮群视频通话已结束，${countsSummary}`),
        t(msg`如需再次发起，请重新打开当前群聊顶部的群视频通话面板。`),
      ];
    }
    return [
      t(msg`本轮群语音通话已结束，${countsSummary}`),
      t(msg`如需再次发起，请重新打开当前群聊顶部的群语音通话面板。`),
    ];
  }

  if (input.kind === "video") {
    return [
      t(
        msg`已从 ${sourceLabel} 发起群视频通话，当前工作台会继续同步在线人数和加入状态。`,
      ),
      t(
        msg`如需继续邀请成员、切回聊天或转到其他设备，请回到当前群聊顶部的群视频通话面板。`,
      ),
    ];
  }
  return [
    t(
      msg`已从 ${sourceLabel} 发起群语音通话，当前工作台会继续同步在线人数和加入状态。`,
    ),
    t(
      msg`如需继续邀请成员、切回聊天或转到其他设备，请回到当前群聊顶部的群语音通话面板。`,
    ),
  ];
}
