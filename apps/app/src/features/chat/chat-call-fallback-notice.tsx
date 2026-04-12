import { Phone, Video } from "lucide-react";
import { Button, InlineNotice, cn } from "@yinjie/ui";

export type ChatCallFallbackKind = "voice" | "video";
export type ChatCallFallbackScope = "direct" | "group";

type ChatCallFallbackNoticeProps = {
  kind: ChatCallFallbackKind;
  description: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  scope?: ChatCallFallbackScope;
  variant?: "inline" | "card";
  primaryVariant?: "primary" | "secondary";
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;
  className?: string;
};

export function ChatCallFallbackNotice({
  kind,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimaryAction,
  onSecondaryAction,
  scope = "direct",
  variant = "inline",
  primaryVariant = variant === "card" ? "primary" : "secondary",
  primaryDisabled = false,
  secondaryDisabled = false,
  className,
}: ChatCallFallbackNoticeProps) {
  const Icon = kind === "voice" ? Phone : Video;
  const title = `${scope === "group" ? "群" : ""}${kind === "voice" ? "语音" : "视频"}通话暂未开放`;

  if (variant === "card") {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] shadow-none",
          className,
        )}
      >
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[rgba(7,193,96,0.09)] text-[color:var(--brand-primary)]">
            <Icon size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
              {title}
            </div>
            <div className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">
              {description}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                variant={primaryVariant}
                onClick={onPrimaryAction}
                className="rounded-full px-3.5"
                disabled={primaryDisabled}
              >
                {primaryLabel}
              </Button>
              <Button
                variant="secondary"
                onClick={onSecondaryAction}
                className="rounded-full px-3.5"
                disabled={secondaryDisabled}
              >
                {secondaryLabel}
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <InlineNotice
      tone="info"
      className={cn(
        "rounded-[14px] border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 py-3 shadow-none",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium leading-5 text-[color:var(--text-primary)]">
            {title}
          </div>
          <div className="mt-0.5 text-[11px] leading-[18px] text-[color:var(--text-secondary)]">
            {description}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button
            variant={primaryVariant}
            size="sm"
            onClick={onPrimaryAction}
            className="rounded-full px-3"
            disabled={primaryDisabled}
          >
            {primaryLabel}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSecondaryAction}
            className="rounded-full px-3"
            disabled={secondaryDisabled}
          >
            {secondaryLabel}
          </Button>
        </div>
      </div>
    </InlineNotice>
  );
}
