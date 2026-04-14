import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MessageSquarePlus, Search } from "lucide-react";
import { getGroups, type Group } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildDesktopContactsRouteHash } from "../features/desktop/contacts/desktop-contacts-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { formatConversationTimestamp } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupContactsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/contacts",
      hash: buildDesktopContactsRouteHash({ pane: "groups" }),
      replace: true,
    });
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return null;
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
              title={
                hasSearchText
                  ? "没有找到匹配的群聊"
                  : "还没有群聊"
              }
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

function DesktopGroupContactsPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["app-contact-groups", baseUrl],
    queryFn: () => getGroups(baseUrl),
  });

  const filteredGroups = useFilteredGroups(groupsQuery.data ?? [], searchText);
  const selectedGroup = useMemo(
    () => filteredGroups.find((group) => group.id === selectedGroupId) ?? null,
    [filteredGroups, selectedGroupId],
  );
  const hasSearchText = searchText.trim().length > 0;

  useEffect(() => {
    if (
      selectedGroupId &&
      filteredGroups.some((group) => group.id === selectedGroupId)
    ) {
      return;
    }

    setSelectedGroupId(filteredGroups[0]?.id ?? null);
  }, [filteredGroups, selectedGroupId]);

  return (
    <AppPage className="h-full min-h-0 space-y-0 bg-[color:var(--bg-app)] px-0 py-0">
      <div className="flex h-full min-h-0">
        <section className="flex w-[340px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                  群聊工作区
                </div>
                <div className="mt-1 text-base font-medium text-[color:var(--text-primary)]">
                  群聊
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {(groupsQuery.data ?? []).length} 个群聊
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigate({
                    to: "/group/new",
                    hash: buildCreateGroupRouteHash({
                      source: "group-contacts",
                    }),
                  });
                }}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                发起群聊
              </Button>
            </div>

            <label className="mt-3 flex items-center gap-2 rounded-[10px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-none">
              <Search size={15} className="shrink-0" />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索群聊"
                className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] pb-4">
            {groupsQuery.isLoading ? (
              <div className="px-3 pt-3">
                <LoadingBlock label="正在读取群聊..." />
              </div>
            ) : null}
            {groupsQuery.isError && groupsQuery.error instanceof Error ? (
              <div className="px-3 pt-3">
                <ErrorBlock message={groupsQuery.error.message} />
              </div>
            ) : null}

            {!groupsQuery.isLoading &&
            !groupsQuery.isError &&
            !filteredGroups.length ? (
              <div className="px-3 pt-6">
                <EmptyState
                  title={
                    hasSearchText
                      ? "没有找到匹配的群聊"
                      : "还没有群聊"
                  }
                  description={
                    hasSearchText
                      ? "换个关键词试试。"
                      : "先创建新的群聊，建好后就会出现在这里。"
                  }
                  action={
                    <Button
                      variant="secondary"
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
              <section className="px-3 py-3">
                <div className="overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
                  {filteredGroups.map((group, index) => {
                    const isSelected = group.id === selectedGroup?.id;

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setSelectedGroupId(group.id)}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          isSelected
                            ? "bg-[rgba(7,193,96,0.07)] shadow-[inset_3px_0_0_0_var(--brand-primary)]"
                            : "bg-white hover:bg-[color:var(--surface-console)]",
                          index > 0
                            ? "border-t border-[color:var(--border-faint)]"
                            : undefined,
                        )}
                      >
                        <GroupAvatarChip name={group.name} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--text-primary)]">
                              {group.name}
                            </div>
                            <div className="shrink-0 text-[11px] text-[color:var(--text-dim)]">
                              {formatConversationTimestamp(
                                group.savedToContactsAt ?? group.lastActivityAt,
                              )}
                            </div>
                          </div>
                          <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                            {getGroupDescription(group)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </section>

        <section className="min-w-0 flex-1 bg-[color:var(--bg-app)]">
          <div className="flex h-full min-h-0 items-center justify-center p-8">
            {selectedGroup ? (
              <div className="w-full max-w-[520px] rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
                <div className="flex items-center gap-4">
                  <GroupAvatarChip name={selectedGroup.name} size="wechat" />
                  <div className="min-w-0">
                    <div className="truncate text-xl font-semibold text-[color:var(--text-primary)]">
                      {selectedGroup.name}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                      最近活跃
                      {formatConversationTimestamp(
                        selectedGroup.savedToContactsAt ??
                          selectedGroup.lastActivityAt,
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-5 py-4 text-sm leading-6 text-[color:var(--text-muted)]">
                  {getGroupDescription(selectedGroup)}
                </div>

                <div className="mt-6 flex gap-3">
                  <Button
                    type="button"
                    className="flex-1 rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
                    onClick={() => {
                      void navigate({
                        to: "/group/$groupId",
                        params: { groupId: selectedGroup.id },
                      });
                    }}
                  >
                    进入群聊
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1 rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                    onClick={() => {
                      void navigate({
                        to: "/group/$groupId/details",
                        params: { groupId: selectedGroup.id },
                      });
                    }}
                  >
                    群聊信息
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-w-sm">
                <EmptyState
                  title="选择一个群聊"
                  description="左侧展示的是当前世界里的群聊，选中后可以直接进入会话或查看群信息。"
                />
              </div>
            )}
          </div>
        </section>
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

function getGroupDescription(group: Group) {
  const announcement = group.announcement?.trim();
  if (announcement) {
    return announcement;
  }

  const statusLabel = group.savedToContacts ? "已保存到通讯录" : "未保存到通讯录";
  return group.isMuted ? `${statusLabel} · 已开启消息免打扰` : statusLabel;
}
