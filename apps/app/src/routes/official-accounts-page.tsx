import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import { listOfficialAccounts } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
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

  return (
    <AppPage className="space-y-0 bg-[#f5f5f5] px-0 py-0">
      <TabPageTopBar
        title="公众号"
        titleAlign="center"
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
      >
        <label className="relative block pt-3">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-[calc(50%+0.375rem)] size-4 -translate-y-1/2 text-[color:var(--text-dim)]"
          />
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索公众号"
            className="h-10 w-full rounded-[12px] border border-transparent bg-[#f2f2f2] pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[color:var(--text-dim)] focus:border-black/5 focus:bg-white"
          />
        </label>
      </TabPageTopBar>

      <div className="pb-8">
        {accountsQuery.isLoading ? <LoadingBlock label="正在读取公众号..." /> : null}
        {accountsQuery.isError && accountsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={accountsQuery.error.message} />
          </div>
        ) : null}

        {followedAccounts.length ? (
          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            <div className="border-b border-[color:var(--border-faint)] px-4 py-3">
              <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                最近关注
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                已关注的 {followedAccounts.length} 个公众号会优先显示在这里。
              </div>
            </div>

            {followedAccounts.map((account) => (
              <OfficialAccountListItem
                key={account.id}
                account={account}
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/$accountId",
                    params: { accountId: account.id },
                  });
                }}
              />
            ))}
          </section>
        ) : null}

        {filteredAccounts.length ? (
          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            <div className="border-b border-[color:var(--border-faint)] px-4 py-3">
              <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                {followedAccounts.length ? "更多公众号" : "全部公众号"}
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                {followedAccounts.length
                  ? `还有 ${otherAccounts.length} 个公众号可继续浏览。`
                  : `当前共有 ${filteredAccounts.length} 个内容账号与服务账号。`}
              </div>
            </div>

            {(otherAccounts.length ? otherAccounts : followedAccounts).map((account) => (
              <OfficialAccountListItem
                key={`all-${account.id}`}
                account={account}
                onClick={() => {
                  void navigate({
                    to: "/official-accounts/$accountId",
                    params: { accountId: account.id },
                  });
                }}
              />
            ))}
          </section>
        ) : null}

        {!accountsQuery.isLoading &&
        !accountsQuery.isError &&
        !filteredAccounts.length ? (
          <div className="px-3 pt-6">
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
