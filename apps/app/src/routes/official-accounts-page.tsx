import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";

const t = translateRuntimeMessage;
import { ArrowLeft, Newspaper, Search } from "lucide-react";
import { listOfficialAccounts } from "@yinjie/contracts";
import { AppPage, Button, cn } from "@yinjie/ui";
import { OfficialAccountListItem } from "../components/official-account-list-item";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { parseDesktopContactsRouteState } from "../features/contacts/contacts-route-state";
import {
  buildMobileOfficialRouteHash,
  parseMobileOfficialRouteState,
} from "../features/official-accounts/mobile-official-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopContactsRouteRedirectShell = lazy(async () => {
  const mod =
    await import("../features/contacts/contacts-route-redirect-shell");
  return { default: mod.ContactsRouteRedirectShell };
});

export function OfficialAccountsPage() {
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const desktopPaneState = useMemo(() => {
    const routeState = parseDesktopContactsRouteState(hash);
    return routeState.pane === "official-accounts" ? routeState : null;
  }, [hash]);

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在切换到桌面公众号`)}
            description={t(msg`正在跳转到桌面通讯录中的公众号视图。`)}
            loadingLabel={t(msg`切换桌面公众号视图...`)}
          />
        }
      >
        <DesktopContactsRouteRedirectShell
          pane="official-accounts"
          officialMode={desktopPaneState?.officialMode ?? "feed"}
          accountId={desktopPaneState?.accountId}
          articleId={desktopPaneState?.articleId}
        />
      </Suspense>
    );
  }

  return <MobileOfficialAccountsPage />;
}

function MobileOfficialAccountsPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  const routeState = useMemo(() => parseMobileOfficialRouteState(hash), [hash]);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileOfficialRouteHash({
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [safeReturnHash, safeReturnPath],
  );

  const accountsQuery = useQuery({
    queryKey: ["app-official-accounts", baseUrl],
    queryFn: () => listOfficialAccounts(baseUrl),
  });

  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter((account) => {
        if (!normalizedSearchText) {
          return true;
        }

        return (
          account.name.toLowerCase().includes(normalizedSearchText) ||
          account.description.toLowerCase().includes(normalizedSearchText) ||
          account.handle.toLowerCase().includes(normalizedSearchText)
        );
      }),
    [accountsQuery.data, normalizedSearchText],
  );
  const followedAccounts = useMemo(
    () => filteredAccounts.filter((account) => account.isFollowing),
    [filteredAccounts],
  );
  const otherAccounts = useMemo(
    () => filteredAccounts.filter((account) => !account.isFollowing),
    [filteredAccounts],
  );
  const browseAccounts = followedAccounts.length
    ? otherAccounts
    : filteredAccounts;
  const hasSearchText = searchText.trim().length > 0;

  function navigateToRouteStateReturn() {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  }

  function openSubscriptionInbox() {
    void navigate({
      to: "/chat/subscription-inbox",
      hash: buildMobileOfficialRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({ to: "/tabs/contacts" });
  }

  function handleRetryAccounts() {
    void accountsQuery.refetch();
  }

  function handleEmptyStateAction() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    if (hasSearchText) {
      setSearchText("");
      return;
    }

    openSubscriptionInbox();
  }

  // Fresh 走查 R5：本页一进来就是 fixed inset-0 z-[60] 「功能开发中」整屏
  // 蒙板（功能未上线），但底下 TabPageTopBar + 搜索框 + 公众号列表 DOM
  // 全部还在。iOS Safari WKWebView 上用户在蒙板之外（卡片之外）滑动会
  // "穿透"滚动底下的列表，看着蒙板不动、底下却在飘。跟 management-modal /
  // bulk-action-bar Fresh R4 同款 body.style.overflow="hidden" 兜。
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      {/* Fresh 走查 R7：底层 TabPageTopBar (back / 订阅入口) + 搜索框 + 公众号列表
          全在 DOM 里、可被 Tab / SR 聚焦——deep probe 验证：Tab 一次后落到底层 back，
          再依次 Tab 到 Newspaper、搜索框、3 个 account button，最后才轮到「功能开
          发中」蒙板里的 back。AT 用户看到 6 个 phantom 焦点跳转后才能找到唯一可用
          的返回按钮，蒙板视觉遮挡完全是骗 SR 用户。跟 live-companion-page 已上
          dev-block 时挂 inert 同款，把整个底层子树从可访问性树和 Tab 序列里摘掉；
          body-scroll-lock 已 R5 修过。className="contents" 让 wrapper 不引入新
          盒模型，保持原视觉一致。 */}
      <div className="contents" aria-hidden="true" {...({ inert: true } as Record<string, unknown>)}>
        <TabPageTopBar
        title={t(msg`公众号`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-overlay)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(
                () => {
                  if (navigateToRouteStateReturn()) {
                    return;
                  }

                  void navigate({ to: "/tabs/contacts" });
                },
                safeReturnPath ?? "/tabs/contacts",
              )
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            // 走查新一轮 R4：原版顶栏返回按钮漏了 aria-label，只有一个
            // 装饰性 ArrowLeft svg，屏阅器 Tab 到只能听到"按钮"——尤其本页
            // 是「公众号」入口，前置背后又叠了 fixed inset-0 z-[60] 的「功
            // 能开发中」蒙板，蒙板里另有一个带 aria-label 的返回，但 TabPage
            // TopBar 这个 back 仍在 DOM 里、SR 仍能聚焦到它。补"返回"对齐
            // friend-requests / starred-friends / world-characters 同口径。
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft aria-hidden="true" size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={openSubscriptionInbox}
            aria-label={t(msg`打开订阅号消息`)}
          >
            <Newspaper aria-hidden="true" size={17} />
          </Button>
        }
      >
        <label className="relative block pt-1.5">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-[calc(50%+0.18rem)] size-[14px] -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t(msg`搜索公众号`)}
            // text-[length:var(--text-title)]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
            // zoom-in。跟 mobile-add-friend-page 已修过的搜索框对齐。
            className="h-9 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] pl-9 pr-4 text-[length:var(--text-title)] text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[color:var(--text-dim)] focus:bg-[color:var(--surface-card)]"
          />
        </label>
      </TabPageTopBar>

      <div className="pb-8">
        {accountsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileOfficialAccountsStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在读取公众号`)}
              description={t(msg`稍等一下，正在同步你关注和可浏览的公众号。`)}
              tone="loading"
            />
          </div>
        ) : null}
        {accountsQuery.isError && accountsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileOfficialAccountsStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`公众号列表暂时不可用`)}
              description={describeRequestError(accountsQuery.error)}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
                    onClick={handleRetryAccounts}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回通讯录`)}
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}

        {followedAccounts.length ? (
          <MobileOfficialAccountSection
            title={t(msg`最近关注`)}
            count={followedAccounts.length}
          >
            {followedAccounts.map((account) => (
              <OfficialAccountListItem
                key={account.id}
                account={account}
                dense
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/$accountId",
                    params: { accountId: account.id },
                    hash: buildMobileOfficialRouteHash({
                      returnPath: pathname,
                      returnHash: currentRouteHash || undefined,
                    }),
                  });
                }}
              />
            ))}
          </MobileOfficialAccountSection>
        ) : null}

        {browseAccounts.length ? (
          <MobileOfficialAccountSection
            title={followedAccounts.length ? t(msg`更多公众号`) : t(msg`全部公众号`)}
            count={browseAccounts.length}
          >
            {browseAccounts.map((account) => (
              <OfficialAccountListItem
                key={`all-${account.id}`}
                account={account}
                dense
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/$accountId",
                    params: { accountId: account.id },
                    hash: buildMobileOfficialRouteHash({
                      returnPath: pathname,
                      returnHash: currentRouteHash || undefined,
                    }),
                  });
                }}
              />
            ))}
          </MobileOfficialAccountSection>
        ) : null}

        {!accountsQuery.isLoading &&
        !accountsQuery.isError &&
        !filteredAccounts.length ? (
          <div className="px-4 pt-4">
            <MobileOfficialAccountsStatusCard
              badge={t(msg`暂无结果`)}
              title={t(msg`没有找到匹配的公众号`)}
              description={t(msg`换个名字、简称或关键词试试。`)}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
                  onClick={handleEmptyStateAction}
                >
                  {safeReturnPath
                    ? t(msg`返回上一页`)
                    : hasSearchText
                      ? t(msg`清空搜索`)
                      : t(msg`打开订阅号消息`)}
                </Button>
              }
            />
          </div>
        ) : null}
      </div>
      </div>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[3px]">
        <Button
          type="button"
          onClick={() =>
            navigateBackOrFallback(
              () => {
                if (navigateToRouteStateReturn()) {
                  return;
                }

                void navigate({ to: "/tabs/contacts" });
              },
              safeReturnPath ?? "/tabs/contacts",
            )
          }
          variant="ghost"
          size="icon"
          aria-label={t(msg`返回`)}
          className="absolute left-3 top-3 h-10 w-10 rounded-full bg-[color:var(--surface-card)]/90 text-[color:var(--text-primary)] shadow-[var(--shadow-card)] active:bg-[color:var(--surface-card)]"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </Button>
        <div className="mx-6 max-w-[280px] rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]/98 px-6 py-6 text-center shadow-[var(--shadow-card)]">
          <div className="text-[length:var(--text-title)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`功能开发中`)}
          </div>
          <div className="mt-2 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-secondary)]">
            {t(msg`敬请期待`)}
          </div>
          <Button
            type="button"
            onClick={() =>
              navigateBackOrFallback(
                () => {
                  if (navigateToRouteStateReturn()) {
                    return;
                  }

                  void navigate({ to: "/tabs/contacts" });
                },
                safeReturnPath ?? "/tabs/contacts",
              )
            }
            variant="primary"
            size="md"
            className="mt-5 h-10 w-full rounded-full bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)]"
          >
            {t(msg`返回`)}
          </Button>
        </div>
      </div>
    </AppPage>
  );
}

function MobileOfficialAccountSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-1">
      <div className="flex items-center justify-between px-4 py-0.75 text-[10px] text-[color:var(--text-muted)]">
        <div className="font-medium tracking-[0.02em]">{title}</div>
        <div>{count}</div>
      </div>
      <div
        className={cn(
          "overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function MobileOfficialAccountsStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-md)] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]"
            : "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--state-success-bg)] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[length:var(--text-body)] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[length:var(--text-eyebrow)] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}
