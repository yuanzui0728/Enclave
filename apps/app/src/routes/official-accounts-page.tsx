import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Newspaper, Search } from "lucide-react";
import { listOfficialAccounts } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
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
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pt-2.5 pb-2 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/contacts" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
            onClick={() => {
              void navigate({ to: "/chat/subscription-inbox" });
            }}
            aria-label="打开订阅号消息"
          >
            <Newspaper size={18} />
          </Button>
        }
      >
        <label className="relative block pt-2">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-[calc(50%+0.25rem)] size-[15px] -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索公众号"
            className="h-9 w-full rounded-[10px] bg-[color:var(--surface-console)] pl-9 pr-4 text-[13px] text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[color:var(--text-dim)] focus:bg-white"
          />
        </label>
      </TabPageTopBar>

      <div className="pb-8">
        {accountsQuery.isLoading ? (
          <div className="px-4 pt-3">
            <LoadingBlock label="正在读取公众号..." />
          </div>
        ) : null}
        {accountsQuery.isError && accountsQuery.error instanceof Error ? (
          <div className="px-4 pt-3">
            <ErrorBlock message={accountsQuery.error.message} />
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
          <div className="px-4 pt-5">
            <EmptyState
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
    <section className="mt-1.5">
      <div className="flex items-center justify-between px-4 py-1 text-[11px] text-[color:var(--text-muted)]">
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
