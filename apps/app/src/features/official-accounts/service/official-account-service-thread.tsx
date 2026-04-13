import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getOfficialAccount,
  getOfficialAccountServiceMessages,
  markOfficialAccountServiceMessagesRead,
} from "@yinjie/contracts";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
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
  const pageErrorMessage =
    (accountQuery.isError && accountQuery.error instanceof Error
      ? accountQuery.error.message
      : null) ??
    (messagesQuery.isError && messagesQuery.error instanceof Error
      ? messagesQuery.error.message
      : null);
  const actionErrorMessage =
    markReadMutation.isError && markReadMutation.error instanceof Error
      ? markReadMutation.error.message
      : null;

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
        isDesktop ? "bg-white" : "bg-[color:var(--bg-canvas)]"
      }`}
    >
      <header
        className={`border-b border-[color:var(--border-faint)] ${
          isDesktop
            ? "bg-white/88 px-5 py-4 backdrop-blur-xl"
            : "bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 backdrop-blur-xl"
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
              className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            >
              <ArrowLeft size={17} />
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
              {accountQuery.data?.name ?? "服务号消息"}
            </div>
            <div className="mt-0.5 text-[10px] leading-[1.125rem] text-[color:var(--text-muted)]">
              服务通知和文章入口会集中在这里。
            </div>
          </div>
          {isDesktop ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
              onClick={() => {
                void navigate({
                  to: "/official-accounts/$accountId",
                  params: { accountId },
                });
              }}
              aria-label="查看公众号资料"
            >
              <MoreHorizontal size={17} />
            </Button>
          )}
        </div>
      </header>

      <div
        className={`flex-1 overflow-auto ${
          isDesktop ? "px-5 py-5" : "px-4 py-3"
        }`}
      >
        {accountQuery.isLoading || messagesQuery.isLoading ? (
          isDesktop ? (
            <LoadingBlock label="正在读取服务号消息..." />
          ) : (
            <MobileOfficialStatusCard
              badge="读取中"
              title="正在读取服务号消息"
              description="稍等一下，正在同步服务通知和文章入口。"
              tone="loading"
            />
          )
        ) : null}
        {pageErrorMessage ? (
          isDesktop ? (
            <ErrorBlock message={pageErrorMessage} />
          ) : (
            <MobileOfficialStatusCard
              badge="读取失败"
              title="服务号消息暂时不可用"
              description={pageErrorMessage}
              tone="danger"
            />
          )
        ) : null}
        {actionErrorMessage ? (
          isDesktop ? (
            <ErrorBlock message={actionErrorMessage} />
          ) : (
            <MobileOfficialStatusCard
              badge="同步失败"
              title="消息状态暂未同步"
              description={actionErrorMessage}
              tone="danger"
            />
          )
        ) : null}

        {messagesQuery.data?.length ? (
          <div className={isDesktop ? "space-y-4" : "space-y-2.5"}>
            {messagesQuery.data.map((message) => (
              <OfficialServiceMessageBubble
                key={message.id}
                message={message}
                variant={variant}
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
          isDesktop ? (
            <EmptyState
              title="还没有服务消息"
              description="关注服务号后，通知和文章卡片会出现在这里。"
            />
          ) : (
            <MobileOfficialStatusCard
              badge="服务号"
              title="还没有服务消息"
              description="关注服务号后，通知和文章卡片会出现在这里。"
            />
          )
        ) : null}
      </div>
    </div>
  );
}

function MobileOfficialStatusCard({
  badge,
  title,
  description,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
    </section>
  );
}
