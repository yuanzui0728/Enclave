import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { msg } from "@lingui/macro";
import { MoreHorizontal, Phone, Search, Video } from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";

export type DesktopChatSidePanelMode = "history" | "details" | null;
export type DesktopChatCallKind = "voice" | "video";

type DesktopChatHeaderActionsProps = {
  activePanelMode: DesktopChatSidePanelMode;
  onToggleHistory?: () => void;
  onToggleDetails?: () => void;
  onSelectCall: (kind: DesktopChatCallKind) => void;
  containerRef?: Ref<HTMLDivElement>;
};

export function DesktopChatHeaderActions({
  activePanelMode,
  onToggleHistory,
  onToggleDetails,
  onSelectCall,
  containerRef,
}: DesktopChatHeaderActionsProps) {
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const callMenuRef = useRef<HTMLDivElement | null>(null);
  const historyActive = activePanelMode === "history";
  const detailsActive = activePanelMode === "details";
  const t = useRuntimeTranslator();

  useEffect(() => {
    if (!callMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!callMenuRef.current?.contains(event.target as Node)) {
        setCallMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      // 通话菜单在 desktopHeaderActionsRef 内，开它不会触发 workspace
      // pointerdown 的 dismissSidePanel；按 Esc 时若不 stopPropagation，
      // workspace 那条 window keydown 会顺手把背后的「聊天信息」侧栏也关掉。
      event.preventDefault();
      event.stopPropagation();
      setCallMenuOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [callMenuOpen]);

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1 rounded-[12px] bg-[rgba(247,247,247,0.92)] p-1"
    >
      <DesktopChatHeaderButton
        active={historyActive}
        tone="brand"
        label={t(msg`查找聊天记录`)}
        onClick={() => onToggleHistory?.()}
        // R25：和姊妹「更多」按钮同款—— handleToggleSidePanel("history") 是真正
        // 的 toggle（panel 已开点同按钮再关），但只有视觉绿边框 + brand 底色，
        // 盲人屏幕阅读器走到「查找聊天记录 按钮」听不出此刻面板是开是关。
        // 通话菜单按钮已有 aria-expanded 处理 popup 语义；本按钮 panel 是
        // workspace 右侧 fixed 区，更接近 toggle button 的概念，用 aria-pressed。
        ariaPressed={historyActive}
      >
        <Search size={16} />
      </DesktopChatHeaderButton>

      <div ref={callMenuRef} className="relative">
        <DesktopChatHeaderButton
          active={callMenuOpen}
          tone="neutral"
          label={t(msg`通话`)}
          onClick={() => setCallMenuOpen((current) => !current)}
          ariaHaspopup="menu"
          ariaExpanded={callMenuOpen}
        >
          <Phone size={16} />
        </DesktopChatHeaderButton>

        {callMenuOpen ? (
          // 走查新一轮 R16：和 R6（会话/消息 context menu）/ R8（官号 context menu
          // 与「+」快捷菜单）同款 a11y 缺漏——这个「通话」下拉是单聊聊天头部最常
          // 用的入口（语音 / 视频），但下拉只是个裸 div，盲人屏幕阅读器打开时
          // 只听到「语音通话 按钮」「视频通话 按钮」两段悬空，没有上下文说明
          // 它们属于「通话操作菜单」。补 role="menu" + aria-label，和姊妹菜单
          // 修法一致。
          <div
            role="menu"
            aria-label={t(msg`通话操作菜单`)}
            className="absolute right-0 top-[calc(100%+0.45rem)] z-30 w-40 overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-white/96 p-1.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl"
          >
            <CallMenuButton
              label={t(msg`语音通话`)}
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
              label={t(msg`视频通话`)}
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
        label={t(msg`更多`)}
        onClick={() => onToggleDetails?.()}
        // R25：handleToggleSidePanel("details") 是真正的 toggle（已开点同按钮
        // 再关）。SR 必须靠 aria-pressed 才知道「更多」此刻是激活的（聊天信息
        // 侧栏开着）还是收起的。和姊妹「查找聊天记录」按钮同款。
        ariaPressed={detailsActive}
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
  ariaHaspopup,
  ariaExpanded,
  ariaPressed,
}: {
  active?: boolean;
  tone?: "neutral" | "brand";
  children: ReactNode;
  label: string;
  onClick: () => void;
  ariaHaspopup?: "menu";
  ariaExpanded?: boolean;
  ariaPressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-haspopup={ariaHaspopup}
      aria-expanded={ariaExpanded}
      aria-pressed={ariaPressed}
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
      // R63：和姊妹 R62 同款 —— 父容器 role="menu" 时合法子元素必须是
      // menuitem，否则 VoiceOver/JAWS menu 模式跳过这些 button。
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
    >
      <span className="shrink-0 text-[color:var(--text-secondary)]">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
