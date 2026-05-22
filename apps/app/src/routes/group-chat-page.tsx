import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage } from "@yinjie/ui";
import { RouteRedirectState } from "../components/route-redirect-state";
import {
  buildChatCallReturnSearch,
  buildChatComposeShortcutSearch,
  parseChatCallReturnKind,
  parseChatComposeShortcutAction,
  type ChatCallReturnKind,
  type ChatComposeShortcutAction,
} from "../features/chat/chat-compose-shortcut-route";
import { parseMobileGroupRouteState } from "../features/chat/mobile-group-route-state";
import GroupChatThreadPanel from "../features/chat/group-chat-thread-panel-view";
import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";
import {
  normalizeDesktopGameInviteReturnPath,
  resolveGameInviteRouteContext,
} from "../features/games/game-invite-route";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

const DesktopChatWorkspace = lazy(async () => {
  const mod = await import("../features/chat/chat-workspace-shell");
  return { default: mod.DesktopChatWorkspace };
});

export function GroupChatPage() {
  const t = useRuntimeTranslator();
  const { groupId } = useParams({ from: "/group/$groupId" });
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const search = useRouterState({ select: (state) => state.location.search });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseMobileGroupRouteState(hash);
  const highlightedMessageId = routeState.highlightedMessageId;
  const [routeContext, setRouteContext] = useState(() =>
    resolveRouteContext(groupId),
  );
  const [routeMobileShortcutAction, setRouteMobileShortcutAction] =
    useState<ChatComposeShortcutAction | null>(null);
  const [routeCallReturnKind, setRouteCallReturnKind] =
    useState<ChatCallReturnKind | null>(null);
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
    setRouteContext(resolveRouteContext(groupId));
  }, [groupId, search]);

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({
        to: buildDesktopChatThreadPath({
          conversationId: groupId,
          messageId: highlightedMessageId ?? undefined,
        }),
        replace: true,
      });
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
      to: "/group/$groupId",
      params: { groupId },
      search: nextSearch || undefined,
      hash,
      replace: true,
    });
  }, [
    groupId,
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
      to: "/group/$groupId",
      params: { groupId },
      search: nextSearch || undefined,
      hash,
      replace: true,
    });
  }, [groupId, hash, isDesktopLayout, navigate, search]);

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

  // 走查移动端群聊 R1：和姊妹路径 chat-room-page.tsx「新会话 R2」(commit 2d0997d7d)
  // 同款修法——callReturnNotice / safeRouteContext notice 的 actionLabel 按钮
  // 都直接 inline `void navigate({...})`，没挂 disabled / 没同步 ref 守。
  // - callReturnNotice.onAction = setRouteCallReturnKind(null) + navigate({/group/$id,
  //   search:?action=voice-message}) → 同帧双击「发语音继续」推 2 条相同 history
  //   项（path 一致 + search 一致），用户从 voice-call 屏返回再点 callReturn 想
  //   切回语音输入时，要按 2 次返回才能回到正常群聊页。
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
                  msg`本轮群语音通话已结束。你可以继续在群里输入，也可以切回语音发送。`,
                )
              : t(
                  msg`本轮群视频通话已结束。你可以继续在群里输入，也可以切回语音发送。`,
                ),
          onAction: guardNoticeAction(() => {
            setRouteCallReturnKind(null);
            void navigate({
              to: "/group/$groupId",
              params: { groupId },
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

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面群聊`)}
            description={t(msg`正在打开桌面聊天，马上恢复当前群聊。`)}
            loadingLabel={t(msg`正在打开桌面群聊...`)}
          />
        }
      >
        <DesktopChatWorkspace
          selectedConversationId={groupId}
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
        <GroupChatThreadPanel
          key={groupId}
          groupId={groupId}
          highlightedMessageId={highlightedMessageId}
          routeMobileShortcutAction={routeMobileShortcutAction}
          onRouteMobileShortcutHandled={handleRouteMobileShortcutHandled}
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

function resolveRouteContext(_groupId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return resolveGameInviteRouteContext(window.location.search);
}
