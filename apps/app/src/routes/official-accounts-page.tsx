import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Newspaper, Search } from "lucide-react";
import { listOfficialAccounts } from "@yinjie/contracts";
import { AppPage, Button, cn } from "@yinjie/ui";
import { OfficialAccountListItem } from "../components/official-account-list-item";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopOfficialAccountsWorkspace } from "../features/desktop/official-accounts/desktop-official-accounts-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function OfficialAccountsPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return <DesktopOfficialAccountsWorkspace />;
  }

  return <MobileOfficialAccountsPage />;
}

function MobileOfficialAccountsPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");

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
  const browseAccounts = followedAccounts.length ? otherAccounts : filteredAccounts;

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="公众号"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/contacts" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={() => {
              void navigate({ to: "/chat/subscription-inbox" });
            }}
            aria-label="打开订阅号消息"
          >
            <Newspaper size={17} />
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
            placeholder="搜索公众号"
            className="h-7.5 w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] pl-9 pr-4 text-[12px] text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[color:var(--text-dim)] focus:bg-white"
          />
        </label>
      </TabPageTopBar>

      <div className="pb-8">
        {accountsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileOfficialAccountsStatusCard
              badge="读取中"
              title="正在读取公众号"
              description="稍等一下，正在同步你关注和可浏览的公众号。"
              tone="loading"
            />
          </div>
        ) : null}
        {accountsQuery.isError && accountsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileOfficialAccountsStatusCard
              badge="读取失败"
              title="公众号列表暂时不可用"
              description={accountsQuery.error.message}
              tone="danger"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={() => void accountsQuery.refetch()}
                >
                  重新加载
                </Button>
              }
            />
          </div>
        ) : null}

        {followedAccounts.length ? (
          <MobileOfficialAccountSection
            title="最近关注"
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
                  });
                }}
              />
            ))}
          </MobileOfficialAccountSection>
        ) : null}

        {browseAccounts.length ? (
          <MobileOfficialAccountSection
            title={followedAccounts.length ? "更多公众号" : "全部公众号"}
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
              badge="暂无结果"
              title="没有找到匹配的公众号"
              description="换个名字、简称或关键词试试。"
            />
          </div>
        ) : null}
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
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}
