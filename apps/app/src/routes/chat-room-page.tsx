import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { getConversations } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage } from "@yinjie/ui";
import {
  buildChatCallReturnSearch,
  buildChatComposeShortcutSearch,
  parseChatCallReturnKind,
  parseChatComposeShortcutAction,
  type ChatCallReturnKind,
  type ChatComposeShortcutAction,
} from "../features/chat/chat-compose-shortcut-route";
import { parseMobileChatRouteState } from "../features/chat/mobile-chat-route-state";
import { RouteRedirectState } from "../components/route-redirect-state";
import { ConversationThreadPanel } from "../features/chat/conversation-thread-panel";
import {
  normalizeDesktopGameInviteReturnPath,
  resolveGameInviteRouteContext,
} from "../features/games/game-invite-route";
import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import {
  hydrateGroupInviteDeliveryFromNative,
  isGroupInviteStorageKey,
  resolveGroupInviteRouteContext,
} from "../lib/group-invite-delivery";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

const DesktopChatWorkspace = lazy(async () => {
  const mod = await import("../features/chat/chat-workspace-shell");
  return { default: mod.DesktopChatWorkspace };
});

export function ChatRoomPage() {
  const t = useRuntimeTranslator();
  const { conversationId } = useParams({ from: "/chat/$conversationId" });
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const search = useRouterState({ select: (state) => state.location.search });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseMobileChatRouteState(hash);
  const highlightedMessageId = routeState.highlightedMessageId;
  const [routeContext, setRouteContext] = useState(() =>
    resolveRouteContext(conversationId),
  );
  const [routeMobileShortcutAction, setRouteMobileShortcutAction] =
    useState<ChatComposeShortcutAction | null>(null);
  const [routeCallReturnKind, setRouteCallReturnKind] =
    useState<ChatCallReturnKind | null>(null);
  // 移动端走查 R2：本组件只用 conversationsQuery 判定「这是不是群聊会话」并
  // redirect 到 /group/$groupId（mobile）或 /tabs/chat#... (desktop)。chat-list-page
  // 进入前刚拉过 app-conversations（15s staleTime）；这条 observer 没 staleTime
  // 就吃全局默认（mobile-web 60s / 其他 10s），desktop 路径下每进/切单聊都触发
  // 一次冗余 GET /conversations。和 use-conversation-thread R5 / chat-details
  // 第七轮 R2 一致对齐 15s。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    staleTime: 15_000,
  });
  const activeConversation =
    conversationsQuery.data?.find((item) => item.id === conversationId) ?? null;
  const safeRouteContext = routeContext
    ? {
        ...routeContext,
        returnPath: normalizeDesktopGameInviteReturnPath(
          routeContext.returnPath,
          isDesktopLayout,
        ),
      }
    : null;

  useEffect(() => {
    setRouteContext(resolveRouteContext(conversationId));
  }, [conversationId, search]);

  // 新一轮 R1：chat-room-page 在路由参数 conversationId 变化时是「保留挂载、
  // 只换 params」的——React 不重 mount 本组件（重 mount 的是子 ConversationThreadPanel
  // 的 key={conversationId}）。所以 routeMobileShortcutAction / routeCallReturnKind
  // 这两条「URL 一次性信号」state 会跨会话泄漏：
  //   1) 在 conv A 通话结束 → URL 带 ?call-return=voice → setRouteCallReturnKind("voice")
  //   2) 紧接着 6s 自动关闭计时器之前用户从 chat-details 名片分享 / Reminder /
  //      Game invite 等路径跳到 /chat/B（path 同型，组件不卸）
  //   3) routeCallReturnKind 还是 "voice"，B 顶部莫名其妙挂着「本轮语音通话已
  //      结束。你可以直接继续输入...」notice
  // routeMobileShortcutAction 同理：composer 快捷动作（如外部 deep link 强制
  // 切语音输入）也会在 ConversationThreadPanel 处理之前的微秒级窗口里漏到下一个
  // 会话。conversationId 变化时强制把两条 state 清零，避免错配。
  useEffect(() => {
    setRouteMobileShortcutAction(null);
    setRouteCallReturnKind(null);
  }, [conversationId]);

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({
        to: buildDesktopChatThreadPath({
          conversationId,
          messageId: highlightedMessageId ?? undefined,
        }),
        replace: true,
      });
      return;
    }

    if (
      !activeConversation ||
      !isPersistedGroupConversation(activeConversation)
    ) {
      return;
    }

    void navigate({
      to: "/group/$groupId",
      params: { groupId: activeConversation.id },
      search: search || undefined,
      hash,
      replace: true,
    });
  }, [
    activeConversation,
    conversationId,
    hash,
    highlightedMessageId,
    isDesktopLayout,
    navigate,
    search,
  ]);

  useEffect(() => {
    if (isDesktopLayout) {
      return;
    }

    const nextAction = parseChatComposeShortcutAction(search);
    if (!nextAction) {
      return;
    }

    setRouteMobileShortcutAction(nextAction);

    const nextSearch = buildChatComposeShortcutSearch({
      search,
      action: null,
    });
    void navigate({
      to: "/chat/$conversationId",
      params: { conversationId },
      search: nextSearch || undefined,
      hash,
      replace: true,
    });
  }, [conversationId, hash, isDesktopLayout, navigate, search]);

  useEffect(() => {
    if (isDesktopLayout) {
      return;
    }

    const nextKind = parseChatCallReturnKind(search);
    if (!nextKind) {
      return;
    }

    setRouteCallReturnKind(nextKind);

    const nextSearch = buildChatCallReturnSearch({
      search,
      kind: null,
    });
    void navigate({
      to: "/chat/$conversationId",
      params: { conversationId },
      search: nextSearch || undefined,
      hash,
      replace: true,
    });
  }, [conversationId, hash, isDesktopLayout, navigate, search]);

  useEffect(() => {
    if (routeCallReturnKind === null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRouteCallReturnKind(null);
    }, 6000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [routeCallReturnKind]);

  const handleRouteMobileShortcutHandled = useCallback(() => {
    setRouteMobileShortcutAction(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const syncRouteContext = async () => {
      await hydrateGroupInviteDeliveryFromNative();
      if (cancelled) {
        return;
      }

      setRouteContext(resolveRouteContext(conversationId));
    };

    void syncRouteContext();

    const handleFocus = () => {
      void syncRouteContext();
    };
    // 走查新一轮 R1：和姊妹页 group-chat-page.tsx / group-qr-page.tsx 同款问题
    // ——原版 storage handler 直接复用 handleFocus，OTHER tab 任何 localStorage
    // 写入（主题、草稿、last viewed page 等等）都会触发 syncRouteContext →
    // await hydrateGroupInviteDeliveryFromNative + 读 3 个 storage key +
    // setRouteContext。单聊页常驻打开、用户其它 tab 一直在写无关 key，纯白
    // 消耗。本路由只依赖群邀请投递/记录/复登 3 个 key（resolveRouteContext
    // 走 url search + group-invite storage，不读其他 key），用
    // isGroupInviteStorageKey gate 一下；老 Safari 的 localStorage.clear() 场景
    // key=null 仍按全量同步对待。
    const handleStorage = (event: StorageEvent) => {
      if (!isGroupInviteStorageKey(event.key)) {
        return;
      }
      void syncRouteContext();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, [conversationId, search]);

  const callReturnNotice =
    routeCallReturnKind === null
      ? null
      : {
          actionLabel: t(msg`发语音继续`),
          description:
            routeCallReturnKind === "voice"
              ? t(
                  msg`本轮语音通话已结束。你可以直接继续输入，也可以切回语音发送。`,
                )
              : t(
                  msg`本轮视频通话已结束。你可以直接继续输入，也可以切回语音发送。`,
                ),
          onAction: () => {
            setRouteCallReturnKind(null);
            void navigate({
              to: "/chat/$conversationId",
              params: { conversationId },
              search:
                buildChatComposeShortcutSearch({
                  action: "voice-message",
                }) || undefined,
              hash,
            });
          },
          secondaryActionLabel: t(msg`继续打字`),
          onSecondaryAction: () => {
            setRouteCallReturnKind(null);
          },
          onDismiss: () => {
            setRouteCallReturnKind(null);
          },
        };

  function navigateToRouteStateReturn() {
    if (
      !routeState.returnPath ||
      isDesktopOnlyPath(routeState.returnPath)
    ) {
      return false;
    }

    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
    });
    return true;
  }

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面对话`)}
            description={t(msg`正在载入桌面聊天工作区，马上恢复当前会话。`)}
            loadingLabel={t(msg`载入桌面对话...`)}
          />
        }
      >
        <DesktopChatWorkspace
          selectedConversationId={conversationId}
          highlightedMessageId={highlightedMessageId}
          routeContextNotice={
            callReturnNotice ??
            (safeRouteContext
              ? {
                  actionLabel: safeRouteContext.actionLabel,
                  description: safeRouteContext.description,
                  onAction: () => {
                    void navigate({ to: safeRouteContext.returnPath });
                  },
                }
              : undefined)
          }
        />
      </Suspense>
    );
  }

  return (
    <AppPage className="flex h-full min-h-0 flex-col space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <div className="h-full min-h-0 flex-1">
        <ConversationThreadPanel
          key={conversationId}
          conversationId={conversationId}
          highlightedMessageId={highlightedMessageId}
          routeMobileShortcutAction={routeMobileShortcutAction}
          onRouteMobileShortcutHandled={handleRouteMobileShortcutHandled}
          routeContextNotice={
            callReturnNotice ??
            (safeRouteContext
              ? {
                  actionLabel: safeRouteContext.actionLabel,
                  description: safeRouteContext.description,
                  onAction: () => {
                    void navigate({ to: safeRouteContext.returnPath });
                  },
                }
              : undefined)
          }
          onBack={() => {
            const expectedPreviousPath =
              (routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
                ? routeState.returnPath
                : undefined) ??
              safeRouteContext?.returnPath ??
              "/tabs/chat";
            navigateBackOrFallback(
              () => {
                if (navigateToRouteStateReturn()) {
                  return;
                }

                void navigate({
                  to: safeRouteContext?.returnPath ?? "/tabs/chat",
                });
              },
              expectedPreviousPath,
            );
          }}
        />
      </div>
    </AppPage>
  );
}

function resolveRouteContext(conversationId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    resolveGameInviteRouteContext(window.location.search) ??
    resolveGroupInviteRouteContext(`/chat/${conversationId}`)
  );
}
