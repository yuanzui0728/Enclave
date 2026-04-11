import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getOfficialAccount,
  getOfficialAccountServiceMessages,
  markOfficialAccountServiceMessagesRead,
} from "@yinjie/contracts";
import { ArrowLeft } from "lucide-react";
import { Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { OfficialServiceMessageBubble } from "../../../components/official-service-message-bubble";
import { EmptyState } from "../../../components/empty-state";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function OfficialAccountServiceThread({
  accountId,
  variant = "mobile",
  onBack,
}: {
  accountId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastAutoReadMessageRef = useRef<string | null>(null);
  const isDesktop = variant === "desktop";

  const accountQuery = useQuery({
    queryKey: ["app-official-account", baseUrl, accountId],
    queryFn: () => getOfficialAccount(accountId, baseUrl),
  });
  const messagesQuery = useQuery({
    queryKey: ["app-official-service-messages", baseUrl, accountId],
    queryFn: () => getOfficialAccountServiceMessages(accountId, baseUrl),
  });

  const markReadMutation = useMutation({
    mutationFn: () => markOfficialAccountServiceMessagesRead(accountId, baseUrl),
    onSuccess: (messages) => {
      queryClient.setQueryData(
        ["app-official-service-messages", baseUrl, accountId],
        messages,
      );
      void queryClient.invalidateQueries({
        queryKey: ["app-official-message-entries", baseUrl],
      });
    },
  });

  useEffect(() => {
    const latestUnread = [...(messagesQuery.data ?? [])]
      .reverse()
      .find((message) => !message.readAt);
    if (!latestUnread || lastAutoReadMessageRef.current === latestUnread.id) {
      return;
    }

    lastAutoReadMessageRef.current = latestUnread.id;
    markReadMutation.mutate();
  }, [markReadMutation, messagesQuery.data]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop ? "bg-white" : "bg-[#f5f5f5]"
      }`}
    >
      <header
        className={`border-b border-[color:var(--border-faint)] ${
          isDesktop
            ? "bg-white/88 px-5 py-4 backdrop-blur-xl"
            : "bg-[rgba(247,247,247,0.94)] px-4 py-3 backdrop-blur-xl"
        }`}
      >
        <div className="flex items-center gap-3">
          {isDesktop ? null : (
            <Button
              onClick={() => {
                if (onBack) {
                  onBack();
                  return;
                }

                void navigate({ to: "/tabs/chat" });
              }}
              variant="ghost"
              size="icon"
              className="text-[color:var(--text-secondary)]"
            >
              <ArrowLeft size={18} />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
              {accountQuery.data?.name ?? "服务号消息"}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
              服务通知、文章卡片和入口提醒会集中在这里。
            </div>
          </div>
        </div>
      </header>

      <div className={`flex-1 overflow-auto ${isDesktop ? "px-5 py-5" : "px-4 py-5"}`}>
        {accountQuery.isLoading || messagesQuery.isLoading ? (
          <LoadingBlock label="正在读取服务号消息..." />
        ) : null}
        {accountQuery.isError && accountQuery.error instanceof Error ? (
          <ErrorBlock message={accountQuery.error.message} />
        ) : null}
        {messagesQuery.isError && messagesQuery.error instanceof Error ? (
          <ErrorBlock message={messagesQuery.error.message} />
        ) : null}
        {markReadMutation.isError && markReadMutation.error instanceof Error ? (
          <ErrorBlock message={markReadMutation.error.message} />
        ) : null}

        {messagesQuery.data?.length ? (
          <div className="space-y-4">
            {messagesQuery.data.map((message) => (
              <OfficialServiceMessageBubble
                key={message.id}
                message={message}
                onOpenArticle={(articleId) => {
                  void navigate({
                    to: "/official-accounts/articles/$articleId",
                    params: { articleId },
                  });
                }}
              />
            ))}
          </div>
        ) : !messagesQuery.isLoading ? (
          <EmptyState
            title="还没有服务消息"
            description="关注服务号后，通知和文章卡片会出现在这里。"
          />
        ) : null}
      </div>
    </div>
  );
}
