import type { ReactNode } from "react";
import { msg } from "@lingui/macro";
import type { ChatBackgroundAsset } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { buildChatBackgroundStyle } from "./chat-background-helpers";

const t = translateRuntimeMessage;

type ChatBackgroundPreviewProps = {
  background?: ChatBackgroundAsset | null;
  title: string;
  subtitle: string;
};

export function ChatBackgroundPreview({
  background,
  title,
  subtitle,
}: ChatBackgroundPreviewProps) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/80 bg-[color:var(--surface-card)] shadow-[var(--shadow-section)]">
      <div className="border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.82)] px-4 py-3 backdrop-blur">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
          {subtitle}
        </div>
      </div>

      <div className="relative h-[280px] overflow-hidden">
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,#fffaf3,#f7efe4)]"
          style={buildChatBackgroundStyle(background)}
        />
        <div className="absolute inset-0 bg-[rgba(255,249,242,0.34)]" />
        <div className="relative flex h-full flex-col justify-end gap-3 px-4 py-4">
          <PreviewBubble align="left" tone="soft">
            {t(msg`今天这张背景，像不像我们刚刚路过的天气？`)}
          </PreviewBubble>
          <PreviewBubble align="right" tone="brand">
            {t(msg`这版预览先按聊天页真实气泡层级来做。`)}
          </PreviewBubble>
          <PreviewBubble align="left" tone="soft">
            {t(msg`保存后，当前聊天页会立即切到这张背景。`)}
          </PreviewBubble>
        </div>
      </div>
    </div>
  );
}

function PreviewBubble({
  align,
  tone,
  children,
}: {
  align: "left" | "right";
  tone: "soft" | "brand";
  children: ReactNode;
}) {
  return (
    <div
      className={`flex ${align === "right" ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[74%] rounded-[20px] px-4 py-3 text-sm leading-6 shadow-[0_10px_20px_rgba(60,40,10,0.10)] ${
          tone === "brand"
            ? "bg-[linear-gradient(135deg,rgba(251,191,36,0.96),rgba(249,115,22,0.92))] text-[color:var(--text-on-brand)]"
            : "border border-white/75 bg-[rgba(255,255,255,0.85)] text-[color:var(--text-primary)]"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
