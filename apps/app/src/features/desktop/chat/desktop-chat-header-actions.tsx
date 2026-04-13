import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Phone, Search, Video } from "lucide-react";
import { cn } from "@yinjie/ui";

export type DesktopChatSidePanelMode = "history" | "details" | null;
export type DesktopChatCallKind = "voice" | "video";

type DesktopChatHeaderActionsProps = {
  activePanelMode: DesktopChatSidePanelMode;
  onToggleHistory?: () => void;
  onToggleDetails?: () => void;
  onSelectCall: (kind: DesktopChatCallKind) => void;
};

export function DesktopChatHeaderActions({
  activePanelMode,
  onToggleHistory,
  onToggleDetails,
  onSelectCall,
}: DesktopChatHeaderActionsProps) {
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const callMenuRef = useRef<HTMLDivElement | null>(null);
  const historyActive = activePanelMode === "history";
  const detailsActive = activePanelMode === "details";

  useEffect(() => {
    if (!callMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!callMenuRef.current?.contains(event.target as Node)) {
        setCallMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [callMenuOpen]);

  return (
    <div className="flex items-center gap-1 rounded-[12px] bg-[rgba(247,247,247,0.92)] p-1">
      <DesktopChatHeaderButton
        active={historyActive}
        tone="brand"
        label="查找聊天记录"
        onClick={() => onToggleHistory?.()}
      >
        <Search size={16} />
      </DesktopChatHeaderButton>

      <div ref={callMenuRef} className="relative">
        <DesktopChatHeaderButton
          active={callMenuOpen}
          tone="neutral"
          label="通话"
          onClick={() => setCallMenuOpen((current) => !current)}
        >
          <Phone size={16} />
        </DesktopChatHeaderButton>

        {callMenuOpen ? (
          <div className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-40 overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white/96 p-1.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl">
            <CallMenuButton
              label="语音通话"
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]">
                  <Phone size={15} />
                </span>
              }
              onClick={() => {
                setCallMenuOpen(false);
                onSelectCall("voice");
              }}
            />
            <CallMenuButton
              label="视频通话"
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]">
                  <Video size={15} />
                </span>
              }
              onClick={() => {
                setCallMenuOpen(false);
                onSelectCall("video");
              }}
            />
          </div>
        ) : null}
      </div>

      <DesktopChatHeaderButton
        active={detailsActive}
        tone="neutral"
        label="更多"
        onClick={() => onToggleDetails?.()}
      >
        <MoreHorizontal size={16} />
      </DesktopChatHeaderButton>
    </div>
  );
}

function DesktopChatHeaderButton({
  active,
  tone = "neutral",
  children,
  label,
  onClick,
}: {
  active?: boolean;
  tone?: "neutral" | "brand";
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-[10px] border border-transparent bg-transparent text-[color:var(--text-secondary)] transition-[background-color,border-color,color,box-shadow] duration-150",
        active && tone === "brand"
          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.12)] text-[color:var(--brand-primary)] shadow-[inset_0_0_0_1px_rgba(7,193,96,0.04)]"
          : null,
        active && tone === "neutral"
          ? "border-[rgba(0,0,0,0.04)] bg-white text-[color:var(--text-primary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
          : null,
        !active
          ? "hover:bg-[rgba(0,0,0,0.045)] hover:text-[color:var(--text-primary)]"
          : null,
      )}
    >
      {children}
    </button>
  );
}

function CallMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
    >
      <span className="shrink-0 text-[color:var(--text-secondary)]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
