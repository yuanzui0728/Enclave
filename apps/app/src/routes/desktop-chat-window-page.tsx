import { useEffect, useMemo } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { getConversations } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import {
  buildDesktopChatWindowRouteHash,
  buildDesktopChatWindowPath,
  parseDesktopChatWindowRouteHash,
} from "../features/desktop/chat/desktop-chat-window-route-state";
import {
  closeCurrentDesktopWindow,
  DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
  focusMainDesktopWindow,
  shouldNavigateCurrentWindow,
  type DesktopStandaloneWindowNavigatePayload,
} from "../runtime/desktop-windowing";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DesktopChatWindowPage() {
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopShell = runtimeConfig.appPlatform === "desktop";
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseDesktopChatWindowRouteHash(hash),
    [hash],
  );
  // 走查 R3：standaloneWindow 是独立 Tauri 窗口，react-query cache 与主窗口
  // 不共享，冷启动确实要拉一次。但用户从主窗口右键「在独立窗口打开聊天」
  // 后再关掉重开（debugging / multi-monitor 工作流）时，给 15s staleTime
  // 让此窗口自己的 cache 复用一下，避免每次 reopen 都 RTT。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(routeState),
    staleTime: 15_000,
  });
  const activeConversation =
    routeState && conversationsQuery.data
      ? conversationsQuery.data.find(
          (conversation) => conversation.id === routeState.conversationId,
        ) ?? null
      : null;
  const fallbackPath = routeState?.returnTo ?? "/tabs/chat";
  const headerTitle = activeConversation?.title ?? routeState?.title ?? t(msg`聊天`);
  const headerType =
    activeConversation?.type ?? routeState?.conversationType ?? "direct";

  useEffect(() => {
    if (!routeState || !activeConversation) {
      return;
    }

    const nextHash = buildDesktopChatWindowRouteHash({
      conversationId: activeConversation.id,
      conversationType: activeConversation.type,
      title: activeConversation.title,
      returnTo: routeState.returnTo,
      highlightedMessageId: routeState.highlightedMessageId,
    });
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (normalizedHash === nextHash) {
      return;
    }

    void navigate({
      to: "/desktop/chat-window",
      hash: nextHash,
      replace: true,
    });
  }, [activeConversation, hash, navigate, routeState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      // 走查新一轮 R27：原写法对 Esc 一刀切 closeStandaloneWindow，但本窗口
      // 内还嵌着 ConversationThreadPanel + 各种 dialog（DesktopChatConfirmDialog
      // / DesktopChatTextEditDialog / DesktopContactTextEditDialog / 转发弹层
      // / 头像 popover / sticker panel / + 快捷菜单等），每个都注册了自己的
      // window keydown Esc handler。stopPropagation 在 window 同元素 sibling
      // listener 上不生效（MDN：需要 stopImmediatePropagation），结果用户：
      // · 改备注 → 弹改备注 dialog → 按 Esc 想关 dialog → dialog 关掉同时
      //   整个独立窗口被一起关掉，用户失去当前聊天上下文得手动重开。
      // · 在 composer 里打到一半草稿 → 按 Esc 想清掉输入法或别的 sub UI →
      //   整个窗口被关，未发的草稿一并丢失（textarea Esc 没 preventDefault，
      //   直接命中本兜底）。
      // 与姊妹 desktop-chat-workspace 的 dismissSidePanel 兜底（line 979）同
      // 思路，推到 microtask + 检查 defaultPrevented：所有同步 sibling Esc
      // listener 跑完后，如果有人 preventDefault 了（说明 sub UI 接走 Esc），
      // 不再关窗。同时跳过 textarea / 输入框 focus 状态 —— Esc 在输入态对
      // 用户来说大概率是"取消当前输入意图"而非"关窗"。
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]',
        )
      ) {
        return;
      }
      queueMicrotask(() => {
        if (event.defaultPrevented) {
          return;
        }
        closeStandaloneWindow(fallbackPath);
      });
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
            {t(msg`独立聊天窗口`)}
          </div>
          <EmptyState
            title={t(msg`这段聊天已经失去上下文`)}
            description={t(msg`可能是新窗口参数被清掉了。回到消息页后重新打开一次即可。`)}
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => {
                focusMainChatWindow("/tabs/chat");
              }}
              className="h-9 rounded-[9px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
            >
              {t(msg`回到消息页`)}
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
            {t(msg`独立聊天窗口`)}
          </div>
          <EmptyState
            title={t(msg`这段聊天已经不存在`)}
            description={t(msg`它可能已被隐藏、删除，或者当前窗口上下文已经失效。`)}
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => {
                focusMainChatWindow(fallbackPath);
              }}
              className="h-9 rounded-[9px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
            >
              {t(msg`回到消息页`)}
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
            {headerType === "group" ? t(msg`群聊独立窗口`) : t(msg`聊天独立窗口`)}
          </div>
          <div className="mt-2 truncate text-[15px] font-medium text-[color:var(--text-primary)]">
            {headerTitle}
          </div>
          <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
            {t(msg`新窗口内延续当前聊天上下文`)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StandaloneActionButton
            label={t(msg`回到主窗口`)}
            onClick={() => focusMainChatWindow(fallbackPath)}
          >
            <ArrowLeft size={16} />
          </StandaloneActionButton>
          <StandaloneActionButton
            label={t(msg`关闭窗口`)}
            onClick={() => closeStandaloneWindow(fallbackPath)}
          >
            <X size={16} />
          </StandaloneActionButton>
        </div>
      </header>

      <div className="min-h-0 flex-1 bg-[rgba(255,255,255,0.62)]">
        <DesktopChatWorkspace
          selectedConversationId={routeState.conversationId}
          highlightedMessageId={routeState.highlightedMessageId}
          buildMessageReturnTo={(messageId) =>
            buildDesktopChatWindowPath({
              conversationId: routeState.conversationId,
              conversationType:
                activeConversation?.type ?? routeState.conversationType,
              title: activeConversation?.title ?? routeState.title,
              returnTo: routeState.returnTo,
              highlightedMessageId: messageId,
            })
          }
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
      focusMainChatWindow(fallbackPath);
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
