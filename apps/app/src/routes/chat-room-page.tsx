import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { getConversations } from "@yinjie/contracts";
import { AppPage } from "@yinjie/ui";
import {
  buildChatCallReturnSearch,
  buildChatComposeShortcutSearch,
  parseChatCallReturnKind,
  parseChatComposeShortcutAction,
  type ChatCallReturnKind,
  type ChatComposeShortcutAction,
} from "../features/chat/chat-compose-shortcut-route";
import { ConversationThreadPanel } from "../features/chat/conversation-thread-panel";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { resolveGameInviteRouteContext } from "../features/games/game-invite-route";
import { navigateBackOrFallback } from "../lib/history-back";
import { resolveGroupInviteRouteContext } from "../lib/group-invite-delivery";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function ChatRoomPage() {
  const { conversationId } = useParams({ from: "/chat/$conversationId" });
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const search = useRouterState({ select: (state) => state.location.search });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const highlightedMessageId = parseHighlightedMessageId(hash);
  const routeContext = resolveRouteContext(conversationId);
  const [routeMobileShortcutAction, setRouteMobileShortcutAction] =
    useState<ChatComposeShortcutAction | null>(null);
  const [routeCallReturnKind, setRouteCallReturnKind] =
    useState<ChatCallReturnKind | null>(null);
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });
  const activeConversation =
    conversationsQuery.data?.find((item) => item.id === conversationId) ?? null;

  useEffect(() => {
    if (!activeConversation || !isPersistedGroupConversation(activeConversation)) {
      return;
    }

    void navigate({
      to: "/group/$groupId",
      params: { groupId: activeConversation.id },
      search: search || undefined,
      hash,
      replace: true,
    });
  }, [activeConversation, hash, navigate, search]);

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
      to: "/chat/$conversationId",
      params: { conversationId },
      search: nextSearch || undefined,
      hash,
      replace: true,
    });
  }, [conversationId, hash, navigate, search]);

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
      to: "/chat/$conversationId",
      params: { conversationId },
      search: nextSearch || undefined,
      hash,
      replace: true,
    });
  }, [conversationId, hash, navigate, search]);

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

  const callReturnNotice =
    routeCallReturnKind === null
      ? null
      : {
          actionLabel: "发语音继续",
          description: `本轮${routeCallReturnKind === "voice" ? "语音" : "视频"}通话已结束。你可以直接继续输入，也可以切回语音发送。`,
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
          secondaryActionLabel: "继续打字",
          onSecondaryAction: () => {
            setRouteCallReturnKind(null);
          },
          onDismiss: () => {
            setRouteCallReturnKind(null);
          },
        };

  if (isDesktopLayout) {
    return (
      <DesktopChatWorkspace
        selectedConversationId={conversationId}
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
    );
  }

  return (
    <AppPage className="flex h-full min-h-0 flex-col space-y-0 bg-[#ededed] px-0 py-0">
      <div className="h-full min-h-0 flex-1">
        <ConversationThreadPanel
          key={conversationId}
          conversationId={conversationId}
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

function resolveRouteContext(conversationId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    resolveGameInviteRouteContext(window.location.search) ??
    resolveGroupInviteRouteContext(`/chat/${conversationId}`)
  );
}

function parseHighlightedMessageId(hash: string) {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = "chat-message-";
  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : undefined;
}
