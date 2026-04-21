import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
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
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import {
  hydrateGroupInviteDeliveryFromNative,
  resolveGroupInviteRouteContext,
} from "../lib/group-invite-delivery";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

const DesktopChatWorkspace = lazy(async () => {
  const mod = await import("../features/chat/chat-workspace-shell");
  return { default: mod.DesktopChatWorkspace };
});

export function GroupChatPage() {
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

  useEffect(() => {
    setRouteContext(resolveRouteContext(groupId));
  }, [groupId]);

  useEffect(() => {
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
  }, [groupId, hash, navigate, search]);

  useEffect(() => {
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
  }, [groupId, hash, navigate, search]);

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

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
    };
  }, [groupId]);

  const callReturnNotice =
    routeCallReturnKind === null
      ? null
      : {
          actionLabel: "发语音继续",
          description: `本轮群${routeCallReturnKind === "voice" ? "语音" : "视频"}通话已结束。你可以继续在群里输入，也可以切回语音发送。`,
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
          secondaryActionLabel: "继续打字",
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
            title="正在打开桌面群聊"
            description="正在载入桌面聊天工作区，马上恢复当前群聊。"
            loadingLabel="载入桌面群聊..."
          />
        }
      >
        <DesktopChatWorkspace
          selectedConversationId={groupId}
          highlightedMessageId={highlightedMessageId}
          routeContextNotice={
            callReturnNotice ??
            (routeContext
              ? {
                  actionLabel: routeContext.actionLabel,
                  description: routeContext.description,
                  onAction: () => {
                    void navigate({ to: routeContext.returnPath });
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
            (routeContext
              ? {
                  actionLabel: routeContext.actionLabel,
                  description: routeContext.description,
                  onAction: () => {
                    void navigate({ to: routeContext.returnPath });
                  },
                }
              : undefined)
          }
          onBack={() => {
            navigateBackOrFallback(() => {
              if (navigateToRouteStateReturn()) {
                return;
              }

              void navigate({
                to: routeContext?.returnPath ?? "/tabs/chat",
              });
            });
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

  return resolveGroupInviteRouteContext(`/group/${groupId}`);
}
