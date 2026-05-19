import { useCallback, useEffect, useMemo } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { getConversations } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { getConversationDisplayTitle } from "../lib/conversation-preview";
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
  // R3：和 desktop-chat-workspace R1 同款——activeConversation.title /
  // routeState.title 都可能是服务端持久化的 sentinel「未知联系人」/「Direct
  // conversation」。独立窗口 header 那一行直接 raw 渲染 → en-US/ja-JP/ko-KR
  // 用户看到中文字面量。getConversationDisplayTitle 翻成当前 locale 后再做
  // || fallback。
  const headerTitle =
    (activeConversation?.title
      ? getConversationDisplayTitle(activeConversation.title)
      : "") ||
    (routeState?.title ? getConversationDisplayTitle(routeState.title) : "") ||
    t(msg`聊天`);
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

      // 走查电脑端群聊 R115：本 page Esc 监听原写法 queueMicrotask + 检查
      // event.defaultPrevented 想"等所有同步 sibling listener 跑完再决定关不
      // 关窗"，和姊妹 desktop-chat-workspace dismissSidePanel R11 走过同一条
      // 坑——HTML 规范要求每个 event listener invocation 之间都跑一次
      // microtask checkpoint，Chromium / Firefox / Safari 实测都遵守。本 page
      // 监听 mount 时机最早，dialog Esc listener 都在 dialog 打开瞬间才挂，
      // 触发顺序按 attach 时间：page 先 fire → 排 microtask → microtask 在
      // 下一个 listener 之前就跑完 → 此刻 event.defaultPrevented = false
      //（dialog handler 还没 fire 它的 preventDefault）→ closeStandaloneWindow
      // 直接执行 → 用户开 confirm/text-edit dialog 按 Esc 想关弹窗，整个
      // 独立窗口跟着一起被关掉、聊天上下文丢失。
      //
      // 改用 workspace R114b 同款 DOM 查询：microtask 时这些 overlay 还在
      // DOM 里（dialog onClose 走 setState 异步），有 [role="dialog"] /
      // [role="menu"] 在 DOM 里就 skip 关窗，让 dialog 自己的 Esc handler
      // 接管关 dialog。所有 modal/popover/context-menu 之前 a11y 走查都补过
      // role —— confirm/text-edit/forward/create-group/note-send/picker/
      // history/feature-unavailable 全部带 role="dialog"，avatar popover /
      // sticker panel / image-viewer / location-viewer / note-viewer 也都补
      // 过；conversation/message/official context-menu 带 role="menu"。
      // textarea / 输入框 focus 仍然 short-circuit 保留——Esc 在输入态优先
      // 给 IME / clear-search 类语义，绝不该关窗。
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
        if (
          typeof document !== "undefined" &&
          document.querySelector('[role="dialog"], [role="menu"]')
        ) {
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

  // 走查新一轮 R30：原写法 `buildMessageReturnTo={(messageId) => ...}` 内联
  // 箭头函数，每次 DesktopChatWindowPage render 都换引用。本组件挂着
  // conversationsQuery 15s staleTime + onWindowFocus，独立窗口聚焦时 fetch 完
  // 回来 → conversationsQuery.data 变 → 组件 re-render → buildMessageReturnTo
  // 引用换。该函数沿 DesktopChatWorkspace → ConversationThreadPanel →
  // ChatMessageList 路径作为 prop 传递，最后挂在 imageMessages useMemo
  // （chat-message-list.tsx line 1817）的 deps 上。引用一变 → imageMessages
  // 整体 filter + map 全部图片消息重跑（长聊天 60-100+ 条历史里 ≥10 张图时
  // 这层 O(n) 是可见开销）→ standaloneViewerItems useMemo 跟着重算 →
  // ImageMessage / image viewer 子树也跟着无效 re-render 一遍。
  //
  // 用 useCallback 把 closure 固化在真正的依赖（routeState.* / activeConversation
  // 的 type & title）上，conversationsQuery 60s refetch 拿到内容相同但引用
  // 不同的 conversation 时——title/type 都不变——回调引用稳住，下游 useMemo
  // 整条链全部 hit cache。和姊妹 conversation-thread-panel R1 / R2 把
  // messageListThreadContext / contactPickerExcludeIds 抽 useMemo 同思路。
  const buildMessageReturnTo = useCallback(
    (messageId: string) => {
      if (!routeState) {
        return undefined;
      }
      return buildDesktopChatWindowPath({
        conversationId: routeState.conversationId,
        conversationType:
          activeConversation?.type ?? routeState.conversationType,
        title: activeConversation?.title || routeState.title,
        returnTo: routeState.returnTo,
        highlightedMessageId: messageId,
      });
    },
    [activeConversation?.type, activeConversation?.title, routeState],
  );

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
          buildMessageReturnTo={buildMessageReturnTo}
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
