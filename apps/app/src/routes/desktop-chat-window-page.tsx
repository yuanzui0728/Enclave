import { useEffect, useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { parseDesktopChatWindowRouteHash } from "../features/desktop/chat/desktop-chat-window-route-state";

export function DesktopChatWindowPage() {
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseDesktopChatWindowRouteHash(hash),
    [hash],
  );
  const fallbackPath = routeState?.returnTo ?? "/tabs/chat";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      closeStandaloneWindow(fallbackPath);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fallbackPath]);

  if (!routeState) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#f5f5f5] p-6">
        <div className="w-full max-w-lg rounded-[20px] border border-black/6 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <EmptyState
            title="这段聊天已经失去上下文"
            description="可能是新窗口参数被清掉了。回到消息页后重新打开一次即可。"
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => {
                window.location.assign("/tabs/chat");
              }}
              className="h-9 rounded-[9px] bg-[#07c160] px-4 text-white hover:bg-[#06ad56]"
            >
              回到消息页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f5f5f5]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-black/6 bg-[rgba(249,249,249,0.96)] px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
            {routeState.title}
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--text-dim)]">
            {routeState.conversationType === "group" ? "群聊独立窗口" : "聊天独立窗口"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StandaloneActionButton
            label="回到主窗口"
            onClick={() => focusMainChatWindow(fallbackPath)}
          >
            <ArrowLeft size={16} />
          </StandaloneActionButton>
          <StandaloneActionButton
            label="关闭窗口"
            onClick={() => closeStandaloneWindow(fallbackPath)}
          >
            <X size={16} />
          </StandaloneActionButton>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <DesktopChatWorkspace
          selectedConversationId={routeState.conversationId}
          standaloneWindow
        />
      </div>
    </div>
  );
}

function StandaloneActionButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-black/8 bg-white text-[color:var(--text-primary)] transition hover:bg-[#f3f3f3]"
    >
      {children}
    </button>
  );
}

function focusMainChatWindow(targetPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.location.assign(targetPath);
      window.opener.focus?.();
      window.close();
      return;
    }
  } catch {
    // Ignore opener access failures and fall back to local navigation.
  }

  window.location.assign(targetPath);
}

function closeStandaloneWindow(fallbackPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (window.opener && !window.opener.closed) {
    window.close();
    return;
  }

  window.location.assign(fallbackPath);
}
