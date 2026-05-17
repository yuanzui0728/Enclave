import { Suspense, lazy, useCallback, useEffect, useState } from "react";
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
import {
  hydrateGroupInviteDeliveryFromNative,
  isGroupInviteStorageKey,
  resolveGroupInviteRouteContext,
} from "../lib/group-invite-delivery";
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

      setRouteContext(resolveRouteContext(groupId));
    };

    void syncRouteContext();

    const handleFocus = () => {
      void syncRouteContext();
    };
    // 走查新一次 R1：和姊妹页 group-qr-page.tsx 新 R1 同款问题——原版 storage
    // handler 复用 handleFocus，OTHER tab 任何 localStorage 写入（主题、草稿、
    // last viewed page 等等）都会触发 syncRouteContext → 内部 await
    // hydrateGroupInviteDeliveryFromNative + 读 3 个 storage key + setRouteContext。
    // 群聊页常驻打开，活跃用户其它 tab 一直在写无关 key，纯白消耗。用
    // isGroupInviteStorageKey gate 一下，只在群邀请投递/记录/复登的 3 个 key
    // 上才真同步；老 Safari 的 localStorage.clear() 场景 key=null 仍按全量
    // 同步对待。
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
  }, [groupId, search]);

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
          onAction: () => {
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
            title={t(msg`正在打开桌面群聊`)}
            description={t(msg`正在载入桌面聊天工作区，马上恢复当前群聊。`)}
            loadingLabel={t(msg`载入桌面群聊...`)}
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

function resolveRouteContext(groupId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    resolveGameInviteRouteContext(window.location.search) ??
    resolveGroupInviteRouteContext(`/group/${groupId}`)
  );
}
