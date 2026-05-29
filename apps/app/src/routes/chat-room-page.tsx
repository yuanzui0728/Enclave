import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { getConversations } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage } from "@yinjie/ui";
import {
  buildChatCallReturnSearch,
  buildChatComposeShortcutSearch,
  buildChatComposeTextSearch,
  parseChatCallReturnKind,
  parseChatComposeShortcutAction,
  parseChatComposeText,
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
    resolveRouteContext(),
  );
  const [routeMobileShortcutAction, setRouteMobileShortcutAction] =
    useState<ChatComposeShortcutAction | null>(null);
  const [routeCallReturnKind, setRouteCallReturnKind] =
    useState<ChatCallReturnKind | null>(null);
  const [routeComposeText, setRouteComposeText] = useState<string | null>(null);
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
    setRouteContext(resolveRouteContext());
  }, [search]);

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
    setRouteComposeText(null);
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

  // 世界 tab「和我快聊」带来的预填文字：解析一次 → 存 state → navigate replace
  // 抹掉 URL 上的 composeText（防刷新/返回重复预填），再作为 prop 下发给 panel。
  useEffect(() => {
    if (isDesktopLayout) {
      return;
    }

    const nextText = parseChatComposeText(search);
    if (!nextText) {
      return;
    }

    setRouteComposeText(nextText);

    const nextSearch = buildChatComposeTextSearch({
      search,
      text: null,
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

  // 走查新会话 R2：callReturnNotice / safeRouteContext notice 的 actionLabel 按钮
  // 都直接 inline `void navigate({...})`，没挂 disabled / 没同步 ref 守。
  // - callReturnNotice.onAction = setRouteCallReturnKind(null) + navigate({/chat/$id,
  //   search:?action=voice-message}) → 同帧双击「发语音继续」推 2 条相同 history
  //   项（path 一致 + search 一致），用户从 voice-call 屏返回再点 callReturn 想
  //   切回语音输入时，要按 2 次返回才能回到正常聊天页。
  // - safeRouteContext.onAction = navigate({safeRouteContext.returnPath}) →
  //   同帧双击「返回上一页」（game invite / group invite 进来时的）同款 2 次 push。
  // 单一 noticeActionFiredRef 兜底两条 notice 入口，raf 后释放（兜底 navigate
  // 没真正切走的边界）。
  const noticeActionFiredRef = useRef(false);
  const guardNoticeAction = useCallback(
    <Args extends unknown[]>(handler: (...args: Args) => void) => {
      return (...args: Args) => {
        if (noticeActionFiredRef.current) return;
        noticeActionFiredRef.current = true;
        handler(...args);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            noticeActionFiredRef.current = false;
          });
        }
      };
    },
    [],
  );
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
          onAction: guardNoticeAction(() => {
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
          }),
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

  // 走查本会话 R4：mobile 路径的 onBack 被 4 处消费——
  // (1) MobileChatThreadHeader 顶部返回按钮（已经被 header 内 actionFiredRef 守住）
  // (2) ConversationThreadPanel.renderStatusBackAction 在 messagesQuery error /
  //     socketError 状态下显示的「返回上一页」按钮（onClick={onBack} 直接挂）
  // (3) ChatMessageList errorActionLabel/onErrorAction 通过 setActionNotice 的
  //     secondaryActionLabel 给收藏/撤回/分享等 mutation 的「重试」notice 当退路
  // (4) ChatComposer 的 MobileComposerStatusRail 在 composerError / preset/sticker
  //     send 失败时给的 onAction
  // 后 3 处都没挂 guardAction，同帧 <16ms 双击全部直接走 navigateBackOrFallback →
  // window.history.back() 跑 2 次 → 用户实际后退 2 页。第 1 次成功后页面 unmount
  // 但 ref 是模块级 useRef，next mount 自动复位（新 conversationId 进来或下次切
  // 回这个会话都会有新的 ref 实例）。一把同步锁兜底所有入口。
  const backFiredRef = useRef(false);
  const handleMobileBack = useCallback(() => {
    if (backFiredRef.current) {
      return;
    }
    backFiredRef.current = true;
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
    // 同步设回 false 不行（同帧立刻 reset 又能双击），但 window.history.back()
    // 是同步触发 popstate 导致路由变化 → 本组件因 conversationId 离开当前 route
    // tree 而 unmount → ref 自然作废。少数边界（back 没真的发生，比如 history
    // 长度为 1 又走 onFallback navigate 没真切走）下，下一次 user 想再点要等
    // 一帧——这里在 raf 后释放 ref 让兜底场景能恢复。
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        backFiredRef.current = false;
      });
    }
  }, [
    navigate,
    routeState.returnPath,
    routeState.returnHash,
    safeRouteContext?.returnPath,
  ]);

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面对话`)}
            description={t(msg`正在打开桌面聊天，马上恢复当前会话。`)}
            loadingLabel={t(msg`正在打开桌面对话...`)}
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
                  onAction: guardNoticeAction(() => {
                    void navigate({ to: safeRouteContext.returnPath });
                  }),
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
          routeComposeText={routeComposeText}
          onRouteComposeTextHandled={() => setRouteComposeText(null)}
          routeContextNotice={
            callReturnNotice ??
            (safeRouteContext
              ? {
                  actionLabel: safeRouteContext.actionLabel,
                  description: safeRouteContext.description,
                  onAction: guardNoticeAction(() => {
                    void navigate({ to: safeRouteContext.returnPath });
                  }),
                }
              : undefined)
          }
          onBack={handleMobileBack}
        />
      </div>
    </AppPage>
  );
}

function resolveRouteContext() {
  if (typeof window === "undefined") {
    return null;
  }

  return resolveGameInviteRouteContext(window.location.search);
}
