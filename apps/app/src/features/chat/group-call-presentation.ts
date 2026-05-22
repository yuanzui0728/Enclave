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
  if (status === "ended") return t(msg`通话已结束`);
  return t(msg`通话中`);
}

export function getDirectCallStatusLabel(
  kind: DesktopChatCallKind,
  status: DirectCallInviteStatus,
) {
  if (status === "ended") return t(msg`通话已结束`);
  if (status === "connected") {
    return t(msg`已接通`);
  }
  return t(msg`等待接听`);
}

export function buildDirectCallWorkspaceSummaryLines(input: {
  kind: DesktopChatCallKind;
  status: DirectCallInviteStatus;
  sourceLabel: string | null;
}) {
  if (input.status === "ended") {
    return [t(msg`通话已结束`)];
  }
  return input.kind === "video"
    ? [t(msg`视频通话中`)]
    : [t(msg`语音通话中`)];
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
  if (input.status === "ended") {
    if (input.counts) {
      return [
        t(
          msg`通话已结束 · ${input.counts.activeCount}/${input.counts.totalCount} 人加入`,
        ),
      ];
    }
    return [t(msg`通话已结束`)];
  }

  if (input.counts) {
    return [
      input.kind === "video"
        ? t(
            msg`视频通话中 · ${input.counts.activeCount}/${input.counts.totalCount} 人加入`,
          )
        : t(
            msg`语音通话中 · ${input.counts.activeCount}/${input.counts.totalCount} 人加入`,
          ),
    ];
  }
  return input.kind === "video"
    ? [t(msg`视频通话中`)]
    : [t(msg`语音通话中`)];
}
