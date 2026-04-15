import { useEffect, useRef, useState } from "react";
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
  Smartphone,
} from "lucide-react";
import { Button, cn } from "@yinjie/ui";
import { OfficialArticleViewer } from "../../../components/official-article-viewer";
import { OfficialServiceMessageBubble } from "../../../components/official-service-message-bubble";
import { buildDesktopMobileOfficialHandoffHash } from "../../desktop/official-accounts/desktop-mobile-official-handoff-route-state";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function OfficialAccountServiceThread({
  accountId,
  variant = "mobile",
  onBack,
  selectedArticleId,
  onOpenAccount,
  onOpenArticle,
  onCloseArticle,
}: {
  accountId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  selectedArticleId?: string;
  onOpenAccount?: (accountId: string, articleId?: string) => void;
  onOpenArticle?: (articleId: string, accountId: string) => void;
  onCloseArticle?: (accountId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const lastAutoReadMessageRef = useRef<string | null>(null);
  const lastMarkedArticleIdRef = useRef<string | null>(null);
  const desktopThreadScrollTopRef = useRef(0);
  const desktopThreadScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isDesktop = variant === "desktop";
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false);

  const accountQuery = useQuery({
    queryKey: ["app-official-account", baseUrl, accountId],
    queryFn: () => getOfficialAccount(accountId, baseUrl),
  });
  const messagesQuery = useQuery({
    queryKey: ["app-official-service-messages", baseUrl, accountId],
    queryFn: () => getOfficialAccountServiceMessages(accountId, baseUrl),
  });

  const articleQuery = useQuery({
    queryKey: ["app-official-account-article", baseUrl, selectedArticleId],
    queryFn: () => getOfficialAccountArticle(selectedArticleId!, baseUrl),
    enabled: isDesktop && Boolean(selectedArticleId),
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
    if (!isDesktop || selectedArticleId) {
      return;
    }

    const scrollContainer = desktopThreadScrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    scrollContainer.scrollTop = desktopThreadScrollTopRef.current;
  }, [isDesktop, selectedArticleId]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    setIsDesktopMenuOpen(false);
  }, [accountId, isDesktop, selectedArticleId]);

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
  const desktopHeaderMeta = [
    accountQuery.data?.isVerified ? "已认证" : null,
    accountQuery.data?.isMuted ? "已免打扰" : null,
    accountQuery.data?.handle ? `@${accountQuery.data.handle}` : null,
  ].filter(Boolean);
  const mobileHeaderMeta = [
    "服务号",
    accountQuery.data?.isVerified ? "已认证" : null,
    accountQuery.data?.isMuted ? "已免打扰" : null,
  ].filter(Boolean);

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
    setIsDesktopMenuOpen(false);
    if (isDesktop) {
      desktopThreadScrollTopRef.current =
        desktopThreadScrollContainerRef.current?.scrollTop ?? 0;
    }
    onOpenArticle?.(articleId, accountId);
  }

  function handleCloseDesktopArticle() {
    setIsDesktopMenuOpen(false);
    onCloseArticle?.(accountId);
  }

  function handleOpenMobileHandoff() {
    setIsDesktopMenuOpen(false);
    void navigate({
      to: "/desktop/mobile",
      hash: buildDesktopMobileOfficialHandoffHash({
        surface: "service",
        accountId,
        articleId: selectedArticleId ?? undefined,
        accountName: accountQuery.data?.name,
        articleTitle: articleQuery.data?.title,
        accountType: "service",
      }),
    });
  }

  if (isDesktop) {
    return (
      <div className="relative flex h-full min-h-0 flex-col bg-[color:var(--bg-app)]">
        {isDesktopMenuOpen ? (
          <button
            type="button"
            aria-label="关闭服务号菜单"
            onClick={() => setIsDesktopMenuOpen(false)}
            className="absolute inset-0 z-10 bg-transparent"
          />
        ) : null}
        <header className="border-b border-[color:var(--border-faint)] bg-white px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {selectedArticleId ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                  onClick={handleCloseDesktopArticle}
                  aria-label="返回消息"
                >
                  <ArrowLeft size={15} />
                </Button>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
                  {accountQuery.data?.name ?? "服务号消息"}
                </div>
                {desktopHeaderMeta.length ? (
                  <div className="mt-0.5 truncate text-[10px] text-[color:var(--text-muted)]">
                    {desktopHeaderMeta.join(" · ")}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="relative z-20 flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
                onClick={() => setIsDesktopMenuOpen((current) => !current)}
                aria-label="打开服务号菜单"
              >
                <MoreHorizontal size={16} />
              </Button>
              {isDesktopMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+0.35rem)] w-[12rem] overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white p-1.5 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDesktopMenuOpen(false);
                      handleOpenAccount(accountId, selectedArticleId ?? undefined);
                    }}
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
                  >
                    <BookOpenText size={15} className="text-[color:var(--text-secondary)]" />
                    <span>公众号主页</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenMobileHandoff}
                    className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
                  >
                    <Smartphone size={15} className="text-[color:var(--text-secondary)]" />
                    <span>到手机继续</span>
                  </button>
                  <button
                    type="button"
                    disabled={!accountQuery.data?.isFollowing || muteMutation.isPending}
                    onClick={() => {
                      setIsDesktopMenuOpen(false);
                      if (!accountQuery.data?.isFollowing) {
                        return;
                      }

                      muteMutation.mutate(!accountQuery.data.isMuted);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left text-[13px] transition",
                      !accountQuery.data?.isFollowing || muteMutation.isPending
                        ? "cursor-not-allowed opacity-45"
                        : "text-[color:var(--text-primary)] hover:bg-[color:var(--surface-console)]",
                    )}
                  >
                    {accountQuery.data?.isMuted ? (
                      <BellRing size={15} className="text-[color:var(--text-secondary)]" />
                    ) : (
                      <BellOff size={15} className="text-[color:var(--text-secondary)]" />
                    )}
                    <span>
                      {muteMutation.isPending
                        ? "处理中..."
                        : accountQuery.data?.isMuted
                          ? "关闭免打扰"
                          : "消息免打扰"}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div
          ref={selectedArticleId ? undefined : desktopThreadScrollContainerRef}
          className={cn(
            "min-h-0 flex-1 overflow-auto",
            selectedArticleId ? "bg-white" : "bg-[#ededed]",
          )}
        >
          {selectedArticleId ? (
            <div className="min-h-full bg-white">
              {articleQuery.isLoading ? (
                <ServiceDesktopStatusPane
                  title="正在读取文章"
                  description="稍等一下，正在同步正文内容。"
                  tone="loading"
                />
              ) : null}
              {articleQuery.isError && articleQuery.error instanceof Error ? (
                <ServiceDesktopStatusPane
                  title="文章暂时不可用"
                  description={articleQuery.error.message}
                  tone="danger"
                />
              ) : null}
              {actionErrorMessage ? (
                <ServiceDesktopInlineStatus message={actionErrorMessage} tone="danger" />
              ) : null}
              {articleQuery.data ? (
                <OfficialArticleViewer
                  article={articleQuery.data}
                  desktopSurface="reader"
                  onOpenAccount={(nextAccountId) =>
                    handleOpenAccount(nextAccountId, articleQuery.data.id)
                  }
                  onOpenArticle={handleOpenDesktopArticle}
                />
              ) : !articleQuery.isLoading && !articleQuery.isError ? (
                <ServiceDesktopStatusPane
                  title="这篇文章暂时不可用"
                  description="可以先返回服务号消息，稍后再试。"
                />
              ) : null}
            </div>
          ) : (
            <div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-4 py-8 sm:px-6 sm:py-10">
              {accountQuery.isLoading || messagesQuery.isLoading ? (
                <ServiceThreadStatusPane
                  title="正在读取服务号消息"
                  description="稍等一下，正在同步通知和文章卡片。"
                  tone="loading"
                />
              ) : null}
              {pageErrorMessage ? (
                <ServiceThreadStatusPane
                  title="服务号消息暂时不可用"
                  description={pageErrorMessage}
                  tone="danger"
                />
              ) : null}
              {actionErrorMessage ? (
                <ServiceThreadInlineStatus message={actionErrorMessage} tone="danger" />
              ) : null}

              {messagesQuery.data?.length ? (
                <div className="space-y-5">
                  {messagesQuery.data.map((message) => (
                    <OfficialServiceMessageBubble
                      key={message.id}
                      message={message}
                      variant="desktop"
                      activeArticleId={selectedArticleId ?? null}
                      onOpenArticle={handleOpenDesktopArticle}
                    />
                  ))}
                </div>
              ) : !messagesQuery.isLoading ? (
                <ServiceThreadStatusPane
                  title="还没有服务消息"
                  description="关注服务号后，通知和文章卡片会出现在这里。"
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <header className="border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.96)] px-4 pb-2 pt-2 backdrop-blur-xl">
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
            {mobileHeaderMeta.length ? (
              <div className="mt-0.5 truncate text-[10px] leading-[1rem] text-[color:var(--text-muted)]">
                {mobileHeaderMeta.join(" · ")}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-secondary)] active:bg-black/[0.05]"
            onClick={() => {
              void navigate({
                to: "/official-accounts/$accountId",
                params: { accountId },
              });
            }}
            aria-label="查看公众号资料"
          >
            <MoreHorizontal size={16} />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-[color:var(--bg-canvas)] py-4">
        {accountQuery.isLoading || messagesQuery.isLoading ? (
          <div className="mx-auto max-w-[24rem] px-3.5">
            <MobileOfficialStatusCard
              badge="读取中"
              title="正在读取服务号消息"
              description="稍等一下，正在同步服务通知和文章入口。"
              tone="loading"
            />
          </div>
        ) : null}
        {pageErrorMessage ? (
          <div className="mx-auto max-w-[24rem] px-3.5">
            <MobileOfficialStatusCard
              badge="读取失败"
              title="服务号消息暂时不可用"
              description={pageErrorMessage}
              tone="danger"
            />
          </div>
        ) : null}
        {actionErrorMessage ? (
          <div className="mx-auto max-w-[24rem] px-3.5">
            <MobileOfficialStatusCard
              badge="同步失败"
              title="消息状态暂未同步"
              description={actionErrorMessage}
              tone="danger"
            />
          </div>
        ) : null}

        {messagesQuery.data?.length ? (
          <div className="space-y-4 px-3.5">
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
          <div className="mx-auto max-w-[24rem] px-3.5">
            <MobileOfficialStatusCard
              badge="服务号"
              title="还没有服务消息"
              description="关注服务号后，通知和文章卡片会出现在这里。"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ServiceDesktopStatusPane({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-[720px] items-center px-8 py-14">
      <div
        className={cn(
          "w-full rounded-[22px] border px-8 py-10 text-center shadow-none",
          tone === "danger"
            ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
            : "border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)]",
        )}
      >
        {tone === "loading" ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
          </div>
        ) : null}
        <div
          className={cn(
            "font-medium text-[16px] text-[color:var(--text-primary)]",
            tone === "loading" ? "mt-4" : undefined,
          )}
        >
          {title}
        </div>
        <p className="mx-auto mt-2 max-w-[26rem] text-[13px] leading-7 text-[color:var(--text-secondary)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function ServiceDesktopInlineStatus({
  message,
  tone = "default",
}: {
  message: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="mx-auto max-w-[720px] px-8 pt-8">
      <div
        className={cn(
          "rounded-[16px] border px-4 py-3 text-[13px] leading-6 shadow-none",
          tone === "danger"
            ? "border-[rgba(220,38,38,0.18)] bg-[rgba(255,245,245,0.96)] text-[color:var(--state-danger-text)]"
            : "border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)] text-[color:var(--text-secondary)]",
        )}
      >
        {message}
      </div>
    </div>
  );
}

function ServiceThreadStatusPane({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <div
        className={cn(
          "rounded-[22px] border px-6 py-8 text-center shadow-none",
          tone === "danger"
            ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
            : "border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)]",
        )}
      >
        {tone === "loading" ? (
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
          </div>
        ) : null}
        <div
          className={cn(
            "font-medium text-[15px] text-[color:var(--text-primary)]",
            tone === "loading" ? "mt-4" : undefined,
          )}
        >
          {title}
        </div>
        <p className="mx-auto mt-2 max-w-[24rem] text-[13px] leading-7 text-[color:var(--text-secondary)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function ServiceThreadInlineStatus({
  message,
  tone = "default",
}: {
  message: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="mx-auto w-full max-w-[34rem]">
      <div
        className={cn(
          "rounded-[16px] border px-4 py-3 text-[13px] leading-6 shadow-none",
          tone === "danger"
            ? "border-[rgba(220,38,38,0.18)] bg-[rgba(255,245,245,0.96)] text-[color:var(--state-danger-text)]"
            : "border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.72)] text-[color:var(--text-secondary)]",
        )}
      >
        {message}
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
