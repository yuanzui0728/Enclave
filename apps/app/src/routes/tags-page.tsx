import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search, Star, Tag } from "lucide-react";
import { getFriends } from "@yinjie/contracts";
import { AppPage, Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildContactTagGroups } from "../features/contacts/contact-tag-groups";
import { getFriendDisplayName } from "../features/contacts/contact-utils";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function TagsPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/contacts",
      replace: true,
    });
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return null;
  }

  return <MobileTagsPage />;
}

function MobileTagsPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const tagGroups = useMemo(
    () => buildContactTagGroups(friendsQuery.data ?? [], searchText),
    [friendsQuery.data, searchText],
  );
  const hasSearchText = searchText.trim().length > 0;

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="标签"
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
              void navigate({ to: "/contacts/starred" });
            }}
            aria-label="查看星标朋友"
          >
            <Star size={17} />
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
              placeholder="搜索标签或联系人"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {friendsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileTagStatusCard
              badge="读取中"
              title="正在读取标签"
              description="稍等一下，正在同步联系人标签和分组。"
              tone="loading"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileTagStatusCard
              badge="读取失败"
              title="标签页暂时不可用"
              description={friendsQuery.error.message}
              tone="danger"
            />
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !friendsQuery.isError &&
        !tagGroups.length ? (
          <div className="px-4 pt-4">
            <MobileTagStatusCard
              badge={hasSearchText ? "暂无结果" : "标签"}
              title={hasSearchText ? "没有找到匹配的标签" : "还没有联系人标签"}
              description={
                hasSearchText
                  ? "换个标签名或联系人名称试试。"
                  : "先在联系人资料里补上标签，通讯录标签页就会自动聚合。"
              }
            />
          </div>
        ) : null}

        {tagGroups.length ? (
          <div className="space-y-3 pt-2">
            {tagGroups.map((group) => (
              <section
                key={group.tag}
                className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]"
              >
                <div className="flex items-center justify-between px-4 py-2">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--text-primary)]">
                    <Tag size={14} className="text-[#15803d]" />
                    <span>{group.tag}</span>
                  </div>
                  <div className="text-[10px] text-[color:var(--text-muted)]">
                    {group.items.length} 位联系人
                  </div>
                </div>

                {group.items.map((item, index) => (
                  <button
                    key={`${group.tag}-${item.character.id}`}
                    type="button"
                    onClick={() => {
                      void navigate({
                        to: "/character/$characterId",
                        params: { characterId: item.character.id },
                      });
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]",
                      index > 0
                        ? "border-t border-[color:var(--border-faint)]"
                        : undefined,
                    )}
                  >
                    <AvatarChip
                      name={item.character.name}
                      src={item.character.avatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                        {getFriendDisplayName(item)}
                      </div>
                      {getFriendDisplayName(item) !== item.character.name ? (
                        <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
                          {item.character.name}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileTagStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
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
