import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ellipsis, History, Phone, Video } from "lucide-react";
import { cn } from "@yinjie/ui";

export type DesktopChatSidePanelMode = "history" | "details" | null;
export type DesktopChatCallKind = "voice" | "video";

type DesktopChatHeaderActionsProps = {
  activePanelMode: DesktopChatSidePanelMode;
  onToggleHistory: () => void;
  onToggleDetails: () => void;
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
        label="聊天记录"
        onClick={onToggleHistory}
      >
        <History size={16} />
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
          <div className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-36 overflow-hidden rounded-[12px] border border-black/8 bg-white py-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
            <CallMenuButton
              label="语音通话"
              icon={<Phone size={15} />}
              onClick={() => {
                setCallMenuOpen(false);
                onSelectCall("voice");
              }}
            />
            <CallMenuButton
              label="视频通话"
              icon={<Video size={15} />}
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
        label="更多"
        onClick={onToggleDetails}
      >
        <Ellipsis size={16} />
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
        "flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border border-transparent text-[color:var(--text-secondary)] transition-colors",
        active
          ? "border-black/8 bg-white text-[color:var(--text-primary)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
          : "hover:border-black/6 hover:bg-white/80 hover:text-[color:var(--text-primary)]",
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
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[#f5f5f5]"
    >
      <span className="text-[color:var(--text-secondary)]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
