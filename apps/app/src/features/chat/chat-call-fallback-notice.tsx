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
          "overflow-hidden rounded-[18px] border border-[rgba(7,193,96,0.16)] bg-white",
          className,
        )}
      >
        <div className="flex items-start gap-3 px-4 py-4">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(7,193,96,0.12)] text-[#07a35a]">
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#111827]">{title}</div>
            <div className="mt-1 text-[13px] leading-6 text-[#6b7280]">
              {description}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={primaryVariant}
                onClick={onPrimaryAction}
                className="rounded-full"
                disabled={primaryDisabled}
              >
                {primaryLabel}
              </Button>
              <Button
                variant="secondary"
                onClick={onSecondaryAction}
                className="rounded-full"
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
      className={cn("border-black/6 bg-white", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium leading-6 text-[color:var(--text-primary)]">
            {title}
          </div>
          <div className="text-xs leading-6 text-[color:var(--text-secondary)]">
            {description}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant={primaryVariant}
            size="sm"
            onClick={onPrimaryAction}
            className="rounded-full"
            disabled={primaryDisabled}
          >
            {primaryLabel}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onSecondaryAction}
            className="rounded-full"
            disabled={secondaryDisabled}
          >
            {secondaryLabel}
          </Button>
        </div>
      </div>
    </InlineNotice>
  );
}
