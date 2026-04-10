import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { AppPage } from "@yinjie/ui";
import {
  buildChatComposeShortcutSearch,
  parseChatComposeShortcutAction,
  type ChatComposeShortcutAction,
} from "../features/chat/chat-compose-shortcut-route";
import GroupChatThreadPanel from "../features/chat/group-chat-thread-panel-view";
import { DesktopChatWorkspace } from "../features/desktop/chat/desktop-chat-workspace";
import { resolveGroupInviteRouteContext } from "../lib/group-invite-delivery";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function GroupChatPage() {
  const { groupId } = useParams({ from: "/group/$groupId" });
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const search = useRouterState({ select: (state) => state.location.search });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const highlightedMessageId = parseHighlightedMessageId(hash);
  const routeContext = resolveRouteContext(groupId);
  const [routeMobileShortcutAction, setRouteMobileShortcutAction] =
    useState<ChatComposeShortcutAction | null>(null);

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

  const handleRouteMobileShortcutHandled = useCallback(() => {
    setRouteMobileShortcutAction(null);
  }, []);

  if (isDesktopLayout) {
    return (
      <DesktopChatWorkspace
        selectedConversationId={groupId}
        highlightedMessageId={highlightedMessageId}
        routeContextNotice={
          routeContext
            ? {
                actionLabel: routeContext.actionLabel,
                description: routeContext.description,
                onAction: () => {
                  void navigate({ to: routeContext.returnPath });
                },
              }
            : undefined
        }
      />
    );
  }

  return (
    <AppPage className="flex h-full min-h-0 flex-col space-y-0 bg-[#ededed] px-0 py-0">
      <div className="h-full min-h-0 flex-1">
        <GroupChatThreadPanel
          groupId={groupId}
          highlightedMessageId={highlightedMessageId}
          routeMobileShortcutAction={routeMobileShortcutAction}
          onRouteMobileShortcutHandled={handleRouteMobileShortcutHandled}
          routeContextNotice={
            routeContext
              ? {
                  actionLabel: routeContext.actionLabel,
                  description: routeContext.description,
                  onAction: () => {
                    void navigate({ to: routeContext.returnPath });
                  },
                }
              : undefined
          }
          onBack={() => {
            if (routeContext) {
              void navigate({ to: routeContext.returnPath });
              return;
            }

            void navigate({ to: "/tabs/chat" });
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

function parseHighlightedMessageId(hash: string) {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const prefix = "chat-message-";
  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : undefined;
}
