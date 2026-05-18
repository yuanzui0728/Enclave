import { useCallback, useEffect, useRef } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { getConversationMessages, getConversations } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { ChatMessageSearchPanel } from "../features/chat/chat-message-search-panel";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "../features/chat/mobile-chat-route-state";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath } from "../lib/history-back";
import { getConversationDisplayTitle } from "../lib/conversation-preview";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function ChatMessageSearchPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/search",
  });
  const isDesktopLayout = useDesktopLayout();
  const t = translateRuntimeMessage;

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={conversationId}
        panel="history"
        title={t(msg`正在打开桌面聊天记录`)}
        description={t(msg`正在切换到桌面聊天工作区中的聊天记录搜索侧栏。`)}
        loadingLabel={t(msg`打开桌面聊天记录...`)}
      />
    );
  }

  return <MobileChatMessageSearchPage conversationId={conversationId} />;
}

function MobileChatMessageSearchPage({
  conversationId,
}: {
  conversationId: string;
}) {
  const t = translateRuntimeMessage;
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = parseMobileChatRouteState(hash);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const searchRouteHash =
    buildMobileChatRouteHash({
      highlightedMessageId: routeState.highlightedMessageId,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    }) || undefined;

  // 走查 R6（第 6 轮）：和兄弟入口（chat-list / chat-room / chat-details /
  // mobile-ai-call-screen / mobile-shell / mobile-reminder-toast-host）共享
  // ["app-conversations", baseUrl]，那 6 处对齐到 15s staleTime；本页是从
  // chat-details 「查找聊天记录」入口进来，上一页 conversations cache 还热，
  // 缺 staleTime 会按默认重发一次 GET /conversations（公网隧道 ~600ms）。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    staleTime: 15_000,
  });

  // 新一轮 R4：缺 staleTime 让本观察者每次进/退/再进搜索页都立刻 background
  // refetch 一次 GET /messages（全量、不带 limit）—— 移动端/桌面默认
  // staleTime=60s/10s 但搜索页是从 chat-details「查找聊天记录」二级入口进，
  // 用户经常前后翻找；socket / use-conversation-thread / chat-message-list /
  // chat-call-session 多处已经把新增消息 setQueriesData 同步到本 cache，
  // staleTime: 15s 期间不会让搜索结果落后。和兄弟 conversationsQuery 同款 15s。
  const messagesQuery = useQuery({
    queryKey: ["app-conversation-messages", baseUrl, conversationId],
    queryFn: () => getConversationMessages(conversationId, baseUrl),
    staleTime: 15_000,
  });

  // 走查新一轮 R5：和 chat-details / chat-background 同款修法——onBack 直接走
  // navigate({...})，同帧 <16ms 双击返回按钮 push 2 条相同 history 项；用户从
  // 搜索结果点回 chat-details 要按 2 次返回。同 mount 内首次 click 后 guard
  // 住所有后续 click，raf 后释放兜底 navigate 没切走的边界。
  const backFiredRef = useRef(false);
  const guardBackAction = useCallback(<Args extends unknown[]>(handler: (...args: Args) => void) => {
    return (...args: Args) => {
      if (backFiredRef.current) return;
      backFiredRef.current = true;
      handler(...args);
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          backFiredRef.current = false;
        });
      }
    };
  }, []);
  const conversation =
    conversationsQuery.data?.find((item) => item.id === conversationId) ?? null;
  // 走查新一轮 R2：服务端 normalizeLegacyConversationEntity 在 title 全部
  // fallback 失败时持久化字面量 "未知联系人" / "Direct conversation"。
  // chat-list-page 行内 / use-conversation-thread 单聊 header 都已经走
  // getConversationDisplayTitle 翻成当前 locale；本搜索页之前直接 conversation.title
  // 漏一遍——en/ja/ko locale 用户从 chat-details 「查找聊天记录」进来时顶部
  // 副标题还是原始中文 sentinel。和姊妹入口对齐。
  const conversationTitle = conversation
    ? getConversationDisplayTitle(conversation.title)
    : t(msg`聊天记录`);

  useEffect(() => {
    if (
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      conversation
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
    conversation,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
  ]);

  return (
    <ChatMessageSearchPanel
      subtitle={conversationTitle}
      messages={messagesQuery.data}
      isLoading={messagesQuery.isLoading}
      error={
        messagesQuery.isError && messagesQuery.error instanceof Error
          ? messagesQuery.error
          : null
      }
      loadingLabel={t(msg`正在读取聊天记录...`)}
      emptyResultTitle={t(msg`没有找到相关聊天记录`)}
      emptyResultDescription={t(
        msg`换个关键词试试，或者切到图片、文件、链接分类继续找。`,
      )}
      onRetry={() => {
        void messagesQuery.refetch();
      }}
      onBack={guardBackAction(() => {
        void navigate({
          to: "/chat/$conversationId/details",
          params: { conversationId },
          ...(searchRouteHash ? { hash: searchRouteHash } : {}),
        });
      })}
      onOpenMessage={(messageId) => {
        void navigate({
          to: "/chat/$conversationId",
          params: { conversationId },
          hash: buildMobileChatRouteHash({
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
