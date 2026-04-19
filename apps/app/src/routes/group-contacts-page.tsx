import { Suspense, lazy, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MessageSquarePlus, Search } from "lucide-react";
import { getGroups, type Group } from "@yinjie/contracts";
import { AppPage, Button, cn } from "@yinjie/ui";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { formatConversationTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopContactsRouteRedirectShell = lazy(async () => {
  const mod =
    await import("../features/contacts/contacts-route-redirect-shell");
  return { default: mod.ContactsRouteRedirectShell };
});

export function GroupContactsPage() {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title="正在切换到桌面群聊"
            description="正在跳转到桌面通讯录工作区中的群聊视图。"
            loadingLabel="切换桌面群聊视图..."
          />
        }
      >
        <DesktopContactsRouteRedirectShell pane="groups" />
      </Suspense>
    );
  }

  return <MobileGroupContactsPage />;
}

function MobileGroupContactsPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");

  const groupsQuery = useQuery({
    queryKey: ["app-contact-groups", baseUrl],
    queryFn: () => getGroups(baseUrl),
  });

  const filteredGroups = useFilteredGroups(groupsQuery.data ?? [], searchText);
  const hasSearchText = searchText.trim().length > 0;

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="群聊"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/tabs/contacts" });
              })
            }
            aria-label="返回通讯录"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={() => {
              void navigate({
                to: "/group/new",
                hash: buildCreateGroupRouteHash({ source: "group-contacts" }),
              });
            }}
            aria-label="发起群聊"
          >
            <MessageSquarePlus size={17} />
          </Button>
        }
      >
        <div className="pt-1.5">
          <label className="flex h-7.5 items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[12px] text-[color:var(--text-dim)]">
            <Search size={14} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索群聊"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {groupsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileGroupContactsStatusCard
              badge="读取中"
              title="正在读取群聊"
              description="稍等一下，正在同步当前世界里的群聊列表。"
              tone="loading"
            />
          </div>
        ) : null}
        {groupsQuery.isError && groupsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileGroupContactsStatusCard
              badge="读取失败"
              title="群聊列表暂时不可用"
              description={groupsQuery.error.message}
              tone="danger"
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={() => void groupsQuery.refetch()}
                >
                  重新加载
                </Button>
              }
            />
          </div>
        ) : null}

        {!groupsQuery.isLoading &&
        !groupsQuery.isError &&
        !filteredGroups.length ? (
          <div className="px-4 pt-4">
            <MobileGroupContactsStatusCard
              badge={hasSearchText ? "暂无结果" : "群聊"}
              title={hasSearchText ? "没有找到匹配的群聊" : "还没有群聊"}
              description={
                hasSearchText
                  ? "换个群名称或公告关键词试试。"
                  : "先发起一个新的群聊，建好后就会出现在这里。"
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={() => {
                    void navigate({
                      to: "/group/new",
                      hash: buildCreateGroupRouteHash({
                        source: "group-contacts",
                      }),
                    });
                  }}
                >
                  发起群聊
                </Button>
              }
            />
          </div>
        ) : null}

        {filteredGroups.length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {filteredGroups.map((group, index) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId",
                    params: { groupId: group.id },
                  });
                }}
                className={cn(
                  "flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]",
                  index > 0
                    ? "border-t border-[color:var(--border-faint)]"
                    : undefined,
                )}
              >
                <GroupAvatarChip name={group.name} size="wechat" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 truncate text-[14px] text-[color:var(--text-primary)]">
                      {group.name}
                    </div>
                    <div className="shrink-0 text-[9px] text-[color:var(--text-dim)]">
                      {formatConversationTimestamp(
                        group.savedToContactsAt ?? group.lastActivityAt,
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileGroupContactsStatusCard({
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

function useFilteredGroups(groups: Group[], searchText: string) {
  return useMemo(() => {
    const normalizedSearchText = searchText.trim().toLowerCase();
    if (!normalizedSearchText) {
      return groups;
    }

    return groups.filter((group) => {
      const announcement = group.announcement?.trim().toLowerCase() ?? "";
      return (
        group.name.toLowerCase().includes(normalizedSearchText) ||
        announcement.includes(normalizedSearchText)
      );
    });
  }, [groups, searchText]);
}
