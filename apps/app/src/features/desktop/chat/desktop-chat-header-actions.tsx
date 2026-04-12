import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info, Phone, Search, Video } from "lucide-react";
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
    <div className="flex items-center gap-1.5">
      <DesktopChatHeaderButton
        active={activePanelMode === "history"}
        label="查找聊天记录"
        onClick={() => onToggleHistory?.()}
      >
        <Search size={16} />
      </DesktopChatHeaderButton>

      <div ref={callMenuRef} className="relative">
        <DesktopChatHeaderButton
          active={callMenuOpen}
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
        active={activePanelMode === "details"}
        label="聊天信息"
        onClick={() => onToggleDetails?.()}
      >
        <Info size={16} />
      </DesktopChatHeaderButton>
    </div>
  );
}

function DesktopChatHeaderButton({
  active,
  children,
  label,
  onClick,
}: {
  active?: boolean;
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
        "flex h-[36px] w-[36px] items-center justify-center rounded-[10px] border border-transparent bg-transparent text-[color:var(--text-secondary)] transition-[background-color,border-color,box-shadow,color]",
        active
          ? "border-[rgba(7,193,96,0.14)] bg-white text-[color:var(--text-primary)] shadow-[0_8px_18px_rgba(15,23,42,0.05)]"
          : "hover:border-[color:var(--border-faint)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
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
