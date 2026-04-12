import {
  type ChatCallFallbackKind,
  ChatCallFallbackNotice,
} from "../chat/chat-call-fallback-notice";
import { ChatDetailsSection } from "./chat-details-section";
import { ChatSettingRow } from "./chat-setting-row";

type ChatCallFallbackSectionProps = {
  activeKind?: ChatCallFallbackKind | null;
  onSelectKind: (kind: ChatCallFallbackKind) => void;
  onDismiss?: () => void;
  onPrimaryAction?: (kind: ChatCallFallbackKind) => void;
  disabled?: boolean;
  scope?: "direct" | "group";
  variant?: "default" | "wechat";
  voiceValue?: string;
  videoValue?: string;
};

export function ChatCallFallbackSection({
  activeKind = null,
  onSelectKind,
  onDismiss,
  onPrimaryAction,
  disabled = false,
  scope = "direct",
  variant = "default",
  voiceValue = "暂未开放",
  videoValue = "暂未开放",
}: ChatCallFallbackSectionProps) {
  const isGroup = scope === "group";
  const isWechat = variant === "wechat";

  return (
    <>
      <ChatDetailsSection title="实时通话" variant={variant}>
        <div
          className={
            isWechat
              ? "divide-y divide-[color:var(--border-faint)]"
              : "divide-y divide-black/5"
          }
        >
          <ChatSettingRow
            label="语音通话"
            value={voiceValue}
            disabled={disabled}
            variant={variant}
            onClick={() => onSelectKind("voice")}
          />
          <ChatSettingRow
            label="视频通话"
            value={videoValue}
            disabled={disabled}
            variant={variant}
            onClick={() => onSelectKind("video")}
          />
        </div>
      </ChatDetailsSection>

      {activeKind && onDismiss && onPrimaryAction ? (
        <div className="px-3">
          <ChatCallFallbackNotice
            kind={activeKind}
            scope={scope}
            description={
              isGroup
                ? activeKind === "voice"
                  ? "先回到群聊继续，用语音消息同步大家的状态会更接近当前可用体验。"
                  : "先回到群聊继续，先拍一张图或发送图片消息，会更接近当前能替代视频通话的体验。"
                : activeKind === "voice"
                  ? "先回到聊天页继续，用按住说话发送语音消息会更接近当前可用的体验。"
                  : "先回到聊天页继续，先拍一张图或发送图片消息，会更接近当前能替代视频通话的体验。"
            }
            primaryLabel={
              isGroup
                ? activeKind === "voice"
                  ? "返回群聊发语音"
                  : "返回群聊拍摄"
                : activeKind === "voice"
                  ? "返回聊天发语音"
                  : "返回聊天拍摄"
            }
            secondaryLabel="知道了"
            onPrimaryAction={() => onPrimaryAction(activeKind)}
            onSecondaryAction={onDismiss}
            primaryVariant="primary"
          />
        </div>
      ) : null}
    </>
  );
}
