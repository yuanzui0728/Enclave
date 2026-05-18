import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { getGroup, getGroupMessages } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { ChatMessageSearchPanel } from "../features/chat/chat-message-search-panel";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "../features/chat/mobile-group-route-state";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupMessageSearchPage() {
  const { groupId } = useParams({ from: "/group/$groupId/search" });
  const isDesktopLayout = useDesktopLayout();
  const t = translateRuntimeMessage;

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        panel="history"
        title={t(msg`正在打开桌面群聊记录`)}
        description={t(msg`正在切换到桌面聊天工作区中的群聊记录搜索侧栏。`)}
        loadingLabel={t(msg`打开桌面群聊记录...`)}
      />
    );
  }

  return <MobileGroupMessageSearchPage groupId={groupId} />;
}

function MobileGroupMessageSearchPage({ groupId }: { groupId: string }) {
  const t = translateRuntimeMessage;
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = parseMobileGroupRouteState(hash);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const searchRouteHash =
    buildMobileGroupRouteHash({
      highlightedMessageId: routeState.highlightedMessageId,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    }) || undefined;

  // 走查 R2：两条 query 都没 staleTime（默认 0），用户在 details → search
  // → details → search 反复切换时每次都冷启动 refetch /api/groups/$id +
  // /messages（活跃群消息表 100+ 条）；公网隧道 RTT ~600ms × 多次浪费明显。
  // socket onChatMessage 已显式 invalidate app-group-messages 所以 stale 不会脏。
  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
    staleTime: 15_000,
  });

  const messagesQuery = useQuery({
    queryKey: ["app-group-messages", baseUrl, groupId],
    queryFn: () => getGroupMessages(groupId, baseUrl),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (
      groupQuery.isLoading ||
      !isMissingGroupError(groupQuery.error, groupId)
    ) {
      return;
    }

    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    groupId,
    groupQuery.error,
    groupQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
  ]);

  return (
    <ChatMessageSearchPanel
      subtitle={groupQuery.data?.name || t(msg`群聊`)}
      messages={messagesQuery.data}
      enableSenderFilter
      isLoading={messagesQuery.isLoading}
      error={
        messagesQuery.isError && messagesQuery.error instanceof Error
          ? messagesQuery.error
          : null
      }
      loadingLabel={t(msg`正在读取群聊记录...`)}
      emptyResultTitle={t(msg`没有找到相关群聊记录`)}
      emptyResultDescription={t(
        msg`换个关键词试试，或者切到图片、文件、链接分类继续找。`,
      )}
      onRetry={() => {
        void messagesQuery.refetch();
      }}
      onBack={() => {
        // 走查 R1：原版直接 navigate push 新 history 项，用户 [details →
        // search → 点返回] 后浏览器后退会落回 search 死循环。和 background
        // 页同口径用 navigateBackOrFallback。
        navigateBackOrFallback(
          () => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
              ...(searchRouteHash ? { hash: searchRouteHash } : {}),
            });
          },
          `/group/${groupId}/details`,
        );
      }}
      onOpenMessage={(messageId) => {
        void navigate({
          to: "/group/$groupId",
          params: { groupId },
          hash: buildMobileGroupRouteHash({
            highlightedMessageId: messageId,
            returnPath: safeReturnPath,
            returnHash: safeReturnHash,
          }),
          replace: true,
        });
      }}
    />
  );
}
