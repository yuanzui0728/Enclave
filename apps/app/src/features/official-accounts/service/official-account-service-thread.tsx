import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getOfficialAccount,
  getOfficialAccountArticle,
  getOfficialAccountServiceMessages,
  markOfficialAccountArticleRead,
  markOfficialAccountServiceMessagesRead,
  updateOfficialAccountPreferences,
} from "@yinjie/contracts";
import {
  ArrowLeft,
  BellOff,
  BellRing,
  BookOpenText,
  MoreHorizontal,
} from "lucide-react";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { OfficialArticleViewer } from "../../../components/official-article-viewer";
import { OfficialServiceMessageBubble } from "../../../components/official-service-message-bubble";
import { EmptyState } from "../../../components/empty-state";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function OfficialAccountServiceThread({
  accountId,
  variant = "mobile",
  onBack,
  selectedArticleId,
  onOpenAccount,
  onOpenArticle,
}: {
  accountId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  selectedArticleId?: string;
  onOpenAccount?: (accountId: string, articleId?: string) => void;
  onOpenArticle?: (articleId: string, accountId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastAutoReadMessageRef = useRef<string | null>(null);
  const lastMarkedArticleIdRef = useRef<string | null>(null);
  const isDesktop = variant === "desktop";
  const [activeDesktopArticleId, setActiveDesktopArticleId] = useState<
    string | null
  >(null);

  const accountQuery = useQuery({
    queryKey: ["app-official-account", baseUrl, accountId],
    queryFn: () => getOfficialAccount(accountId, baseUrl),
  });
  const messagesQuery = useQuery({
    queryKey: ["app-official-service-messages", baseUrl, accountId],
    queryFn: () => getOfficialAccountServiceMessages(accountId, baseUrl),
  });

  const articleCardIds = useMemo(
    () =>
      (messagesQuery.data ?? [])
        .map((message) =>
          message.attachment?.kind === "article_card"
            ? message.attachment.articleId
            : null,
        )
        .flatMap((articleId) => (articleId ? [articleId] : [])),
    [messagesQuery.data],
  );
  const defaultDesktopArticleId =
    articleCardIds[articleCardIds.length - 1] ?? null;

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    if (
      selectedArticleId !== undefined &&
      selectedArticleId !== activeDesktopArticleId
    ) {
      setActiveDesktopArticleId(selectedArticleId);
    }
  }, [activeDesktopArticleId, isDesktop, selectedArticleId]);

  useEffect(() => {
    if (!isDesktop || selectedArticleId) {
      return;
    }

    if (!defaultDesktopArticleId) {
      setActiveDesktopArticleId(null);
      return;
    }

    if (
      activeDesktopArticleId &&
      articleCardIds.includes(activeDesktopArticleId)
    ) {
      return;
    }

    setActiveDesktopArticleId(defaultDesktopArticleId);
  }, [
    activeDesktopArticleId,
    articleCardIds,
    defaultDesktopArticleId,
    isDesktop,
    selectedArticleId,
  ]);

  const articleQuery = useQuery({
    queryKey: ["app-official-account-article", baseUrl, activeDesktopArticleId],
    queryFn: () => getOfficialAccountArticle(activeDesktopArticleId!, baseUrl),
    enabled: isDesktop && Boolean(activeDesktopArticleId),
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
  const muteMutation = useMutation({
    mutationFn: (nextMuted: boolean) =>
      updateOfficialAccountPreferences(
        accountId,
        { isMuted: nextMuted },
        baseUrl,
      ),
    onSuccess: async (updatedAccount) => {
      queryClient.setQueryData(
        ["app-official-account", baseUrl, updatedAccount.id],
        updatedAccount,
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-official-message-entries", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-official-accounts", baseUrl],
        }),
      ]);
    },
  });
  const markArticleReadMutation = useMutation({
    mutationFn: (articleId: string) =>
      markOfficialAccountArticleRead(articleId, baseUrl),
    onSuccess: async (updatedArticle) => {
      queryClient.setQueryData(
        ["app-official-account-article", baseUrl, updatedArticle.id],
        updatedArticle,
      );
      queryClient.setQueryData(
        ["app-official-account-reader", baseUrl, updatedArticle.id],
        updatedArticle,
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-official-account", baseUrl, updatedArticle.account.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-official-accounts", baseUrl],
        }),
      ]);
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

  useEffect(() => {
    if (
      !articleQuery.data?.id ||
      lastMarkedArticleIdRef.current === articleQuery.data.id
    ) {
      return;
    }

    lastMarkedArticleIdRef.current = articleQuery.data.id;
    markArticleReadMutation.mutate(articleQuery.data.id);
  }, [articleQuery.data?.id, markArticleReadMutation]);

  const pageErrorMessage =
    (accountQuery.isError && accountQuery.error instanceof Error
      ? accountQuery.error.message
      : null) ??
    (messagesQuery.isError && messagesQuery.error instanceof Error
      ? messagesQuery.error.message
      : null);
  const actionErrorMessage =
    (markReadMutation.isError && markReadMutation.error instanceof Error
      ? markReadMutation.error.message
      : null) ??
    (muteMutation.isError && muteMutation.error instanceof Error
      ? muteMutation.error.message
      : null) ??
    (markArticleReadMutation.isError &&
    markArticleReadMutation.error instanceof Error
      ? markArticleReadMutation.error.message
      : null);

  function handleOpenAccount(nextAccountId: string, articleId?: string) {
    if (onOpenAccount) {
      onOpenAccount(nextAccountId, articleId);
      return;
    }

    void navigate({
      to: "/official-accounts/$accountId",
      params: { accountId: nextAccountId },
    });
  }

  function handleOpenDesktopArticle(articleId: string) {
    setActiveDesktopArticleId(articleId);
    onOpenArticle?.(articleId, accountId);
  }

  if (isDesktop) {
    return (
      <div className="flex h-full min-h-0 bg-[color:var(--bg-app)]">
        <section className="flex w-[440px] min-w-0 shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-white">
          <header className="border-b border-[color:var(--border-faint)] bg-white/88 px-5 py-4 backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                  {accountQuery.data?.name ?? "服务号消息"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
                  <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2 py-0.5 text-[color:var(--brand-primary)]">
                    服务号
                  </span>
                  {accountQuery.data?.isVerified ? (
                    <span className="rounded-full border border-[#d7e5fb] bg-[#f3f7ff] px-2 py-0.5 text-[#315b9a]">
                      已认证
                    </span>
                  ) : null}
                  {accountQuery.data?.isMuted ? (
                    <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2 py-0.5 text-[color:var(--text-secondary)]">
                      已免打扰
                    </span>
                  ) : null}
                  {accountQuery.data?.handle ? (
                    <span>@{accountQuery.data.handle}</span>
                  ) : null}
                </div>
                <div className="mt-1.5 text-[12px] leading-5 text-[color:var(--text-secondary)]">
                  {accountQuery.data?.description ?? "服务通知和文章入口会集中在这里。"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-xl"
                  onClick={() =>
                    handleOpenAccount(accountId, activeDesktopArticleId ?? undefined)
                  }
                >
                  <BookOpenText size={14} />
                  公众号主页
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-xl"
                  disabled={!accountQuery.data?.isFollowing || muteMutation.isPending}
                  onClick={() => {
                    if (!accountQuery.data?.isFollowing) {
                      return;
                    }

                    muteMutation.mutate(!accountQuery.data.isMuted);
                  }}
                >
                  {accountQuery.data?.isMuted ? (
                    <BellRing size={14} />
                  ) : (
                    <BellOff size={14} />
                  )}
                  {muteMutation.isPending
                    ? "处理中..."
                    : accountQuery.data?.isMuted
                      ? "关闭免打扰"
                      : "消息免打扰"}
                </Button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
            {accountQuery.isLoading || messagesQuery.isLoading ? (
              <LoadingBlock label="正在读取服务号消息..." />
            ) : null}
            {pageErrorMessage ? <ErrorBlock message={pageErrorMessage} /> : null}
            {actionErrorMessage ? <ErrorBlock message={actionErrorMessage} /> : null}

            {messagesQuery.data?.length ? (
              <div className="space-y-4">
                {messagesQuery.data.map((message) => (
                  <OfficialServiceMessageBubble
                    key={message.id}
                    message={message}
                    variant="desktop"
                    activeArticleId={activeDesktopArticleId}
                    onOpenArticle={handleOpenDesktopArticle}
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
        </section>

        <section className="min-w-0 flex-1 overflow-auto bg-[rgba(255,255,255,0.62)] p-6">
          {articleQuery.isLoading ? <LoadingBlock label="正在读取文章..." /> : null}
          {articleQuery.isError && articleQuery.error instanceof Error ? (
            <ErrorBlock message={articleQuery.error.message} />
          ) : null}

          {articleQuery.data ? (
            <OfficialArticleViewer
              article={articleQuery.data}
              onOpenAccount={(nextAccountId) =>
                handleOpenAccount(nextAccountId, articleQuery.data.id)
              }
              onOpenArticle={handleOpenDesktopArticle}
            />
          ) : (
            <DesktopServiceThreadOverview
              accountName={accountQuery.data?.name}
              description={accountQuery.data?.description}
              handle={accountQuery.data?.handle}
              isMuted={accountQuery.data?.isMuted ?? false}
              articleCount={articleCardIds.length}
              canToggleMute={Boolean(accountQuery.data?.isFollowing)}
              onOpenAccount={() =>
                handleOpenAccount(accountId, activeDesktopArticleId ?? undefined)
              }
              onToggleMute={() => {
                if (!accountQuery.data?.isFollowing) {
                  return;
                }

                muteMutation.mutate(!accountQuery.data.isMuted);
              }}
              togglePending={muteMutation.isPending}
            />
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--bg-canvas)]">
      <header className="border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
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
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
              {accountQuery.data?.name ?? "服务号消息"}
            </div>
            <div className="mt-0.5 text-[10px] leading-[1.125rem] text-[color:var(--text-muted)]">
              服务通知和文章入口会集中在这里。
            </div>
          </div>
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
        </div>
      </header>

      <div className="flex-1 overflow-auto px-4 py-3">
        {accountQuery.isLoading || messagesQuery.isLoading ? (
          <MobileOfficialStatusCard
            badge="读取中"
            title="正在读取服务号消息"
            description="稍等一下，正在同步服务通知和文章入口。"
            tone="loading"
          />
        ) : null}
        {pageErrorMessage ? (
          <MobileOfficialStatusCard
            badge="读取失败"
            title="服务号消息暂时不可用"
            description={pageErrorMessage}
            tone="danger"
          />
        ) : null}
        {actionErrorMessage ? (
          <MobileOfficialStatusCard
            badge="同步失败"
            title="消息状态暂未同步"
            description={actionErrorMessage}
            tone="danger"
          />
        ) : null}

        {messagesQuery.data?.length ? (
          <div className="space-y-2.5">
            {messagesQuery.data.map((message) => (
              <OfficialServiceMessageBubble
                key={message.id}
                message={message}
                variant="mobile"
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
          <MobileOfficialStatusCard
            badge="服务号"
            title="还没有服务消息"
            description="关注服务号后，通知和文章卡片会出现在这里。"
          />
        ) : null}
      </div>
    </div>
  );
}

function DesktopServiceThreadOverview({
  accountName,
  description,
  handle,
  isMuted,
  articleCount,
  canToggleMute,
  onOpenAccount,
  onToggleMute,
  togglePending,
}: {
  accountName?: string;
  description?: string;
  handle?: string;
  isMuted: boolean;
  articleCount: number;
  canToggleMute: boolean;
  onOpenAccount: () => void;
  onToggleMute: () => void;
  togglePending: boolean;
}) {
  return (
    <div className="mx-auto flex h-full max-w-[720px] items-center">
      <section className="w-full rounded-[28px] border border-[color:var(--border-faint)] bg-white px-8 py-8 shadow-[var(--shadow-section)]">
        <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
          服务号工作区
        </div>
        <div className="mt-3 text-[30px] font-semibold leading-[1.25] text-[color:var(--text-primary)]">
          {accountName ?? "服务号消息"}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-muted)]">
          <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[color:var(--brand-primary)]">
            服务号
          </span>
          {handle ? (
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1">
              @{handle}
            </span>
          ) : null}
          <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1">
            {articleCount} 篇文章入口
          </span>
          {isMuted ? (
            <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1">
              当前已免打扰
            </span>
          ) : null}
        </div>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">
          {description ?? "服务消息会在左侧消息流里持续更新。点击带文章卡片的消息，右侧会直接打开阅读器，不再离开当前工作区。"}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            className="rounded-xl"
            onClick={onOpenAccount}
          >
            <BookOpenText size={15} />
            打开公众号主页
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="rounded-xl"
            disabled={!canToggleMute || togglePending}
            onClick={onToggleMute}
          >
            {isMuted ? <BellRing size={15} /> : <BellOff size={15} />}
            {togglePending
              ? "处理中..."
              : isMuted
                ? "关闭免打扰"
                : "开启免打扰"}
          </Button>
        </div>
      </section>
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
