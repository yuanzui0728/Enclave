import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, InlineNotice } from "@yinjie/ui";

const t = translateRuntimeMessage;

export function DigitalHumanEntryNotice({
  tone,
  message,
  onContinue,
  onDismiss,
  onSwitchToVoice,
  continueLabel = t(msg`继续视频通话`),
  dismissLabel = t(msg`先继续聊天`),
  voiceLabel = t(msg`改用语音通话`),
  compact = false,
  // 走查第四轮 R1：调用方（character-detail-page mobile/desktop 两处）的
  // onContinue / onSwitchToVoice 直接调 openCallMutation.mutate(...)，组件
  // 此前没暴露 disabled 槽位。用户在 mutation pending 期间继续点（双击或
  // 手抖），同一个 handler 会再触发一次 mutate —— 后端就开两路 voice/video
  // 会话，前端 isPending 标签虽然变了但按钮还可点。chat-message-list 的
  // 调用方靠 pendingDirectCallInvite 一次性消费天然防重；chat-details-page
  // 调用方走 navigate 幂等；只有这两处直接 mutate 需要这个槽位。
  disabled = false,
}: {
  tone: "info" | "warning";
  message: string;
  onContinue: () => void;
  onDismiss?: () => void;
  onSwitchToVoice: () => void;
  continueLabel?: string;
  dismissLabel?: string;
  voiceLabel?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <InlineNotice
      // R57：DigitalHumanEntryNotice 是用户点视频通话按钮后才出现的
      // 「门口提示」，告诉用户当前数字人 gateway / quota 状态 + 是否
      // 改走语音。条件渲染（仅当 openCallMutation 返回 hint 或 gateway
      // 不健康时挂出），盲人 SR 必须在它弹出来时立刻听到才知道为什么
      // 通话没直接开。warning → alert assertive，info → status polite。
      role={tone === "warning" ? "alert" : "status"}
      aria-live={tone === "warning" ? "assertive" : "polite"}
      tone={tone}
      className={
        compact
          ? "rounded-[var(--radius-sm)] px-3 py-2 text-[length:var(--text-eyebrow)] leading-[17px] shadow-none"
          : undefined
      }
    >
      <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
        <div className={compact ? "text-[length:var(--text-eyebrow)] leading-[17px]" : "text-sm leading-6"}>
          {message}
        </div>
        <div className={`flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"}`}>
          {onDismiss ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className={compact ? "h-8 rounded-full px-2.5 text-[10px]" : "rounded-full"}
            >
              {dismissLabel}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={onSwitchToVoice}
            disabled={disabled}
            className={compact ? "h-8 rounded-full px-2.5 text-[10px]" : "rounded-full"}
          >
            {voiceLabel}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onContinue}
            disabled={disabled}
            className={compact ? "h-8 rounded-full px-2.5 text-[10px]" : "rounded-full"}
          >
            {continueLabel}
          </Button>
        </div>
      </div>
    </InlineNotice>
  );
}
