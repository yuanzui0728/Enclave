import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { getConversations } from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { parseDesktopChatWindowRouteHash } from "../features/desktop/chat/desktop-chat-window-route-state";
import {
  closeCurrentDesktopWindow,
  DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
  focusMainDesktopWindow,
  shouldNavigateCurrentWindow,
  type DesktopStandaloneWindowNavigatePayload,
} from "../runtime/desktop-windowing";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DesktopChatWindowPage() {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopShell = runtimeConfig.appPlatform === "desktop";
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseDesktopChatWindowRouteHash(hash),
    [hash],
  );
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(routeState),
  });
  const activeConversation =
    routeState && conversationsQuery.data
      ? conversationsQuery.data.find(
          (conversation) => conversation.id === routeState.conversationId,
        ) ?? null
      : null;
  const fallbackPath = routeState?.returnTo ?? "/tabs/chat";
  const headerTitle = activeConversation?.title ?? routeState?.title ?? "聊天";
  const headerType =
    activeConversation?.type ?? routeState?.conversationType ?? "direct";

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

  useEffect(() => {
    if (!nativeDesktopShell) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    async function bindStandaloneWindowNavigation() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();

        unlisten =
          await currentWindow.listen<DesktopStandaloneWindowNavigatePayload>(
            DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
            ({ payload }) => {
              const nextTarget = payload.targetPath.trim();
              if (shouldNavigateCurrentWindow(nextTarget)) {
                window.location.assign(nextTarget);
                return;
              }

              if (typeof window !== "undefined") {
                window.focus();
              }
            },
          );

        if (cancelled) {
          unlisten?.();
          unlisten = null;
        }
      } catch {
        // Ignore event binding failures outside the native Tauri shell.
      }
    }

    void bindStandaloneWindowNavigation();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [nativeDesktopShell]);

  if (!routeState) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[color:var(--bg-app)] p-6">
        <div className="w-full max-w-lg rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="mb-5 inline-flex rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] tracking-[0.12em] text-[color:var(--brand-primary)]">
            独立聊天窗口
          </div>
          <EmptyState
            title="这段聊天已经失去上下文"
            description="可能是新窗口参数被清掉了。回到消息页后重新打开一次即可。"
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => {
                focusMainChatWindow("/tabs/chat");
              }}
              className="h-9 rounded-[9px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
            >
              回到消息页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (
    !conversationsQuery.isLoading &&
    !conversationsQuery.isError &&
    !activeConversation
  ) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[color:var(--bg-app)] p-6">
        <div className="w-full max-w-lg rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="mb-5 inline-flex rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] tracking-[0.12em] text-[color:var(--brand-primary)]">
            独立聊天窗口
          </div>
          <EmptyState
            title="这段聊天已经不存在"
            description="它可能已被隐藏、删除，或者当前窗口上下文已经失效。"
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => {
                focusMainChatWindow(fallbackPath);
              }}
              className="h-9 rounded-[9px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
            >
              回到消息页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-app)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.78)] px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="inline-flex rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[11px] tracking-[0.08em] text-[color:var(--brand-primary)]">
            {headerType === "group" ? "群聊独立窗口" : "聊天独立窗口"}
          </div>
          <div className="mt-2 truncate text-[15px] font-medium text-[color:var(--text-primary)]">
            {headerTitle}
          </div>
          <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
            新窗口内延续当前聊天上下文
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

      <div className="min-h-0 flex-1 bg-[rgba(255,255,255,0.62)]">
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
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
    >
      {children}
    </button>
  );
}

function focusMainChatWindow(targetPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  void focusMainDesktopWindow(targetPath).then((focused) => {
    if (focused) {
      void closeCurrentDesktopWindow();
      return;
    }

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.location.assign(targetPath);
        window.opener.focus?.();
        closeCurrentWindow();
        return;
      }
    } catch {
      // Ignore opener access failures and fall back to local navigation.
    }

    window.location.assign(targetPath);
  });
}

function closeStandaloneWindow(fallbackPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  void closeCurrentDesktopWindow().then((closed) => {
    if (closed) {
      return;
    }

    closeCurrentWindow(() => {
      window.location.assign(fallbackPath);
    });
  });
}

function closeCurrentWindow(onBlocked?: () => void) {
  window.close();

  if (!onBlocked) {
    return;
  }

  window.setTimeout(() => {
    if (!window.closed) {
      onBlocked();
    }
  }, 120);
}
