import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import {
  createGroup,
  getFriends,
  type FriendListItem,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  buildContactSections,
  createFriendDirectoryItems,
  type FriendDirectoryItem,
} from "../features/contacts/contact-utils";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { parseCreateGroupRouteHash } from "../lib/create-group-route-state";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function CreateGroupPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(() => parseCreateGroupRouteHash(hash), [hash]);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const previousBaseUrlRef = useRef(baseUrl);
  const seededSelectionRef = useRef("");

  const friendsQuery = useQuery({
    queryKey: ["app-group-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const friendItems = useMemo(
    () => friendsQuery.data ?? [],
    [friendsQuery.data],
  );
  const sortedFriendItems = useMemo(
    () => createFriendDirectoryItems(friendItems),
    [friendItems],
  );
  const selectedFriendMap = useMemo(
    () =>
      new Map(
        sortedFriendItems.map(
          (item) =>
            [item.character.id, item] satisfies [string, FriendDirectoryItem],
        ),
      ),
    [sortedFriendItems],
  );
  const selectedFriends = useMemo(
    () =>
      selectedIds
        .map((id) => selectedFriendMap.get(id))
        .filter((item): item is FriendDirectoryItem => Boolean(item)),
    [selectedFriendMap, selectedIds],
  );
  const defaultGroupName = useMemo(
    () => buildDefaultGroupName(selectedFriends),
    [selectedFriends],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createGroup(
        {
          name: name.trim() || defaultGroupName,
          memberIds: selectedIds,
        },
        baseUrl,
      ),
    onSuccess: (group) => {
      void navigate({
        to: "/group/$groupId",
        params: { groupId: group.id },
        replace: true,
      });
    },
  });

  useEffect(() => {
    if (previousBaseUrlRef.current === baseUrl) {
      return;
    }

    previousBaseUrlRef.current = baseUrl;
    seededSelectionRef.current = "";
    setName("");
    setSelectedIds([]);
    setSearchTerm("");
    createMutation.reset();
  }, [baseUrl, createMutation]);

  useEffect(() => {
    const seedKey = `${baseUrl}:${routeState.seedMemberIds.join(",")}`;
    if (seededSelectionRef.current === seedKey) {
      return;
    }

    if (!routeState.seedMemberIds.length) {
      seededSelectionRef.current = seedKey;
      return;
    }

    if (!sortedFriendItems.length) {
      if (!friendsQuery.isLoading) {
        seededSelectionRef.current = seedKey;
      }
      return;
    }

    const validSeedIds = routeState.seedMemberIds.filter((id) =>
      selectedFriendMap.has(id),
    );
    seededSelectionRef.current = seedKey;

    if (!validSeedIds.length) {
      return;
    }

    setSelectedIds((current) => {
      const restIds = current.filter((id) => !validSeedIds.includes(id));
      return [...validSeedIds, ...restIds];
    });
  }, [
    baseUrl,
    friendsQuery.isLoading,
    routeState.seedMemberIds,
    selectedFriendMap,
    sortedFriendItems.length,
  ]);

  const filteredFriends = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return sortedFriendItems;
    }

    return sortedFriendItems.filter((item) => {
      return [
        item.character.name,
        item.friendship.remarkName ?? "",
        item.character.relationship ?? "",
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [searchTerm, sortedFriendItems]);

  const filteredSections = useMemo(
    () => buildContactSections(filteredFriends),
    [filteredFriends],
  );

  const handleBack = () => {
    if (routeState.source === "chat-details" && routeState.conversationId) {
      void navigate({
        to: "/chat/$conversationId/details",
        params: { conversationId: routeState.conversationId },
      });
      return;
    }

    if (routeState.source === "desktop-chat" && routeState.conversationId) {
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: routeState.conversationId },
      });
      return;
    }

    if (routeState.source === "group-contacts") {
      void navigate({ to: "/contacts/groups" });
      return;
    }

    void navigate({ to: "/tabs/chat" });
  };

  const toggleSelection = (characterId: string) => {
    setSelectedIds((current) =>
      current.includes(characterId)
        ? current.filter((item) => item !== characterId)
        : [...current, characterId],
    );
  };

  if (isDesktopLayout) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f3f3f3]">
        <header className="flex items-center justify-between gap-4 border-b border-black/6 bg-[#f7f7f7] px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleBack}
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-[10px] border border-black/6 bg-white text-[color:var(--text-primary)]"
            >
              <ArrowLeft size={18} />
            </Button>
            <div>
              <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                发起群聊
              </div>
              <div className="mt-1 text-[18px] font-medium text-[color:var(--text-primary)]">
                发起群聊
              </div>
              <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                选择联系人并创建一个新的桌面群聊工作区。
              </div>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!selectedIds.length || createMutation.isPending}
            variant="primary"
            size="lg"
            className="rounded-[10px] bg-[#07c160] px-6 text-white hover:bg-[#06ad56]"
          >
            {createMutation.isPending ? "正在创建..." : "创建群聊"}
          </Button>
        </header>

        <div className="min-h-0 flex-1 p-6">
          <div className="mx-auto flex h-full min-h-0 max-w-[1200px] overflow-hidden rounded-[18px] border border-black/6 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <section className="flex w-[400px] shrink-0 flex-col border-r border-black/6 bg-[#f7f7f7]">
              <div className="border-b border-black/6 px-5 py-4">
                <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                  选择成员
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  至少选择一位已经建立关系的人。
                </div>

                <label className="relative mt-4 block">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
                  />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="搜索联系人"
                    className="h-10 w-full rounded-[10px] border border-black/8 bg-white pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-black/12"
                  />
                </label>

                <div className="mt-3 text-[12px] text-[color:var(--text-muted)]">
                  已选择 {selectedIds.length} 位成员
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
                {friendsQuery.isLoading ? (
                  <LoadingBlock
                    className="px-2 py-4 text-left"
                    label="正在读取联系人..."
                  />
                ) : null}
                {friendsQuery.isError && friendsQuery.error instanceof Error ? (
                  <div className="px-2 py-2">
                    <ErrorBlock message={friendsQuery.error.message} />
                  </div>
                ) : null}

                {!friendsQuery.isLoading &&
                !friendsQuery.isError &&
                !friendItems.length ? (
                  <div className="px-2 py-8">
                    <EmptyState
                      title="还没有可拉进群的人"
                      description="先去通讯录里建立一些关系，再回来创建群聊。"
                    />
                  </div>
                ) : null}

                {!friendsQuery.isLoading &&
                !friendsQuery.isError &&
                friendItems.length > 0 &&
                !filteredFriends.length ? (
                  <div className="px-5 py-10 text-center text-sm text-[color:var(--text-muted)]">
                    没有匹配的联系人。
                  </div>
                ) : null}

                <div className="space-y-1">
                  {filteredFriends.map((item) => (
                    <FriendSelectionRow
                      key={item.character.id}
                      checked={selectedIds.includes(item.character.id)}
                      disabled={createMutation.isPending}
                      name={getFriendDisplayName(item)}
                      relationship={item.character.relationship}
                      src={item.character.avatar}
                      variant="desktop"
                      onClick={() => toggleSelection(item.character.id)}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="flex min-w-0 flex-1 flex-col bg-[#fafafa]">
              <div className="border-b border-black/6 bg-[#f7f7f7] px-6 py-4">
                <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                  群资料
                </div>
                <div className="mt-4 max-w-[420px]">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    群名称
                  </div>
                  <TextField
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={defaultGroupName}
                    className="mt-3 rounded-[10px] border-black/8 bg-white"
                  />
                  <div className="mt-3 text-[12px] text-[color:var(--text-muted)]">
                    不填写时会使用“{defaultGroupName}”。
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
                {selectedFriends.length ? (
                  <>
                    <div className="mb-4 text-[15px] font-medium text-[color:var(--text-primary)]">
                      已选成员
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedFriends.map((item) => (
                        <div
                          key={item.character.id}
                          className="flex items-center gap-3 rounded-[12px] border border-black/6 bg-white px-4 py-4"
                        >
                          <AvatarChip
                            name={getFriendDisplayName(item)}
                            src={item.character.avatar}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                              {getFriendDisplayName(item)}
                            </div>
                            <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                              {item.character.relationship}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleSelection(item.character.id)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-black/6 text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)]"
                            aria-label={`移除 ${getFriendDisplayName(item)}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center px-8">
                    <div className="max-w-[320px] text-center">
                      <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
                        右侧显示已选成员
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                        从左侧勾选联系人后，就能在这里确认群成员并完成创建。
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-black/6 bg-[#f7f7f7] px-6 py-4">
                <div className="text-[12px] text-[color:var(--text-muted)]">
                  已选择 {selectedIds.length} 位成员，创建后会直接进入新群聊。
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleBack}
                    className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={() => createMutation.mutate()}
                    disabled={!selectedIds.length || createMutation.isPending}
                    variant="primary"
                    className="rounded-[10px] bg-[#07c160] px-6 text-white hover:bg-[#06ad56]"
                  >
                    {createMutation.isPending ? "正在创建群聊..." : "确认创建"}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>

        {createMutation.isError && createMutation.error instanceof Error ? (
          <div className="px-6 pb-6">
            <ErrorBlock message={createMutation.error.message} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AppPage className="space-y-0 bg-[#ededed] px-0 py-0">
      <TabPageTopBar
        title="选择联系人"
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-black/6 bg-[#f7f7f7] px-4 py-3 text-[#111827] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[#111827]"
            onClick={handleBack}
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!selectedIds.length || createMutation.isPending}
            className={cn(
              "h-9 rounded-full px-3 text-[15px] font-medium transition",
              selectedIds.length && !createMutation.isPending
                ? "bg-[#07c160] text-white active:opacity-90"
                : "text-[#b9b9b9]",
            )}
          >
            {createMutation.isPending
              ? "创建中"
              : selectedIds.length
                ? `确定(${selectedIds.length})`
                : "确定"}
          </button>
        }
      >
        <div className="space-y-3 pt-3">
          <div className="rounded-[12px] bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-[#111827]">
                已选联系人
              </div>
              <div className="text-[12px] text-[#8c8c8c]">
                {selectedIds.length ? `${selectedIds.length} 人` : "未选择"}
              </div>
            </div>

            {selectedFriends.length ? (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {selectedFriends.map((item) => {
                  const displayName = getFriendDisplayName(item);
                  return (
                    <button
                      key={item.character.id}
                      type="button"
                      onClick={() => toggleSelection(item.character.id)}
                      className="flex w-14 shrink-0 flex-col items-center gap-1 text-center"
                    >
                      <div className="relative">
                        <AvatarChip
                          name={displayName}
                          src={item.character.avatar}
                          size="wechat"
                        />
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white">
                          <X size={10} />
                        </span>
                      </div>
                      <span className="w-full truncate text-[11px] text-[#5f5f5f]">
                        {displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-[12px] leading-5 text-[#8c8c8c]">
                先选择联系人，再开始一个新的群聊。
              </div>
            )}
          </div>

          {(routeState.source === "chat-details" ||
            routeState.source === "desktop-chat") &&
          routeState.seedMemberIds.length ? (
            <div className="rounded-[12px] bg-[#f3fff8] px-4 py-3 text-[12px] leading-5 text-[#2f7a4c]">
              已按当前单聊默认勾选对方，你可以继续添加其他联系人。
            </div>
          ) : null}

          <label className="flex items-center gap-2 rounded-[10px] bg-white px-3 py-2.5 text-sm text-[#8c8c8c]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索"
              className="min-w-0 flex-1 bg-transparent text-sm text-[#111827] outline-none placeholder:text-[#a3a3a3]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        {friendsQuery.isLoading ? (
          <div className="px-3 pt-3">
            <LoadingBlock label="正在读取联系人..." />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={friendsQuery.error.message} />
          </div>
        ) : null}
        {createMutation.isError && createMutation.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={createMutation.error.message} />
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !friendsQuery.isError &&
        !friendItems.length ? (
          <div className="px-3 pt-6">
            <EmptyState
              title="还没有可拉进群的人"
              description="先去通讯录里建立一些关系，再回来创建群聊。"
            />
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !friendsQuery.isError &&
        friendItems.length > 0 &&
        !filteredFriends.length ? (
          <div className="px-3 pt-6">
            <EmptyState
              title="没有找到联系人"
              description="换个名字、备注名或关系关键词试试。"
            />
          </div>
        ) : null}

        {filteredSections.length ? (
          <div className="pt-2">
            {filteredSections.map((section) => (
              <section key={section.key} className="mt-2">
                <div className="px-4 py-1.5 text-[12px] text-[#8c8c8c]">
                  {section.title}
                </div>
                <div className="border-y border-black/6 bg-white">
                  {section.items.map((item, index) => (
                    <FriendSelectionRow
                      key={item.character.id}
                      checked={selectedIds.includes(item.character.id)}
                      disabled={createMutation.isPending}
                      name={getFriendDisplayName(item)}
                      relationship={item.character.relationship}
                      src={item.character.avatar}
                      withDivider={index > 0}
                      onClick={() => toggleSelection(item.character.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function FriendSelectionRow({
  checked,
  disabled,
  name,
  relationship,
  src,
  variant = "mobile",
  withDivider = false,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  name: string;
  relationship?: string;
  src?: string | null;
  variant?: "mobile" | "desktop";
  withDivider?: boolean;
  onClick: () => void;
}) {
  const isDesktop = variant === "desktop";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 text-left disabled:opacity-60",
        isDesktop
          ? checked
            ? "rounded-[10px] border border-[rgba(7,193,96,0.22)] bg-[rgba(7,193,96,0.08)] px-4 py-3"
            : "rounded-[10px] border border-transparent bg-transparent px-4 py-3 transition hover:bg-white"
          : checked
            ? "bg-[#f3fff8] px-4 py-3"
            : "bg-white px-4 py-3",
        !isDesktop && withDivider ? "border-t border-black/6" : "",
      )}
    >
      <AvatarChip name={name} src={src} size={isDesktop ? "md" : "wechat"} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] text-[color:var(--text-primary)]">
          {name}
        </div>
        <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
          {relationship || "世界联系人"}
        </div>
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border transition-colors",
          isDesktop ? "h-6 w-6" : "h-5 w-5",
          checked
            ? "border-[#07c160] bg-[#07c160] text-white"
            : isDesktop
              ? "border-black/8 bg-[#f3f3f3] text-transparent"
              : "border-black/10 bg-[#f5f5f5] text-transparent",
        )}
      >
        <Check size={isDesktop ? 14 : 12} strokeWidth={2.8} />
      </div>
    </button>
  );
}

function buildDefaultGroupName(
  items: Array<Pick<FriendListItem, "friendship" | "character">>,
) {
  const names = items
    .map((item) => getFriendDisplayName(item))
    .filter(Boolean)
    .slice(0, 3);

  if (!names.length) {
    return "临时群聊";
  }

  if (items.length > 3) {
    return `${names.join("、")}等${items.length}人`;
  }

  return names.join("、");
}

function getFriendDisplayName(
  item: Pick<FriendListItem, "friendship" | "character">,
) {
  return item.friendship.remarkName?.trim() || item.character.name;
}
