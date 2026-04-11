import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@yinjie/ui";
import type { DesktopChatSidePanelMode } from "./desktop-chat-header-actions";

type DesktopChatSidePanelProps = {
  mode: Exclude<DesktopChatSidePanelMode, null>;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function DesktopChatSidePanel({
  mode,
  title,
  subtitle,
  onClose,
  children,
  className,
}: DesktopChatSidePanelProps) {
  return (
    <aside
      className={cn(
        "absolute bottom-0 right-0 top-[65px] z-20 hidden w-[340px] border-l border-black/6 bg-[#f5f5f5] xl:flex xl:flex-col",
        className,
      )}
      data-mode={mode}
    >
      <div className="border-b border-black/6 bg-[#f7f7f7] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
              {mode === "history" ? "聊天记录面板" : "聊天信息面板"}
            </div>
            <div className="mt-1 truncate text-[15px] font-medium text-[color:var(--text-primary)]">
              {title}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-black/6 bg-white text-[color:var(--text-secondary)] transition hover:bg-[#ededed] hover:text-[color:var(--text-primary)]"
            aria-label="关闭侧栏"
          >
            <X size={16} />
          </button>
        </div>
        {subtitle ? (
          <div className="mt-2 truncate text-[12px] text-[color:var(--text-muted)]">
            {subtitle}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </aside>
  );
}

export function DesktopChatSidePanelPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="rounded-full bg-[rgba(15,23,42,0.05)] px-3 py-1 text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
        侧栏面板
      </div>
      <div className="mt-4 text-[15px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
        {description}
      </div>
    </div>
  );
}
