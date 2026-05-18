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
      tone={tone}
      className={
        compact
          ? "rounded-[13px] px-3 py-2 text-[11px] leading-[17px] shadow-none"
          : undefined
      }
    >
      <div className={`flex flex-col ${compact ? "gap-2" : "gap-3"}`}>
        <div className={compact ? "text-[11px] leading-[17px]" : "text-sm leading-6"}>
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
