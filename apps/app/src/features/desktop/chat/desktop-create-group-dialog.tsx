import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, Search, X } from "lucide-react";
import {
  createGroup,
  getFriends,
  type FriendListItem,
} from "@yinjie/contracts";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import {
  createFriendDirectoryItems,
  type FriendDirectoryItem,
} from "../../contacts/contact-utils";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";

type DesktopCreateGroupDialogProps = {
  open: boolean;
  seedMemberIds?: string[];
  onClose: () => void;
};

export function DesktopCreateGroupDialog({
  open,
  seedMemberIds = [],
  onClose,
}: DesktopCreateGroupDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const seededSelectionRef = useRef("");

  const friendsQuery = useQuery({
    queryKey: ["desktop-create-group-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open,
  });

  const friendItems = useMemo(() => friendsQuery.data ?? [], [friendsQuery.data]);
  const sortedFriendItems = useMemo(
    () => createFriendDirectoryItems(friendItems),
    [friendItems],
  );
  const friendMap = useMemo(
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
        .map((id) => friendMap.get(id))
        .filter((item): item is FriendDirectoryItem => Boolean(item)),
    [friendMap, selectedIds],
  );
  const filteredFriends = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return sortedFriendItems.filter((item) => {
      if (item.friendship.status === "removed") {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        item.character.name,
        item.friendship.remarkName ?? "",
        item.character.relationship ?? "",
      ].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [searchTerm, sortedFriendItems]);
  const defaultGroupName = useMemo(
    () => buildDefaultGroupName(selectedFriends),
    [selectedFriends],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createGroup(
        {
          name: defaultGroupName,
          memberIds: selectedIds,
        },
        baseUrl,
      ),
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      onClose();
      void navigate({ to: "/group/$groupId", params: { groupId: group.id } });
    },
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
    setSelectedIds([]);
    seededSelectionRef.current = "";
    createMutation.reset();
  }, [createMutation, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const seedKey = seedMemberIds.join(",");
    if (seededSelectionRef.current === seedKey) {
      return;
    }

    if (!seedMemberIds.length) {
      seededSelectionRef.current = seedKey;
      return;
    }

    if (!sortedFriendItems.length) {
      if (!friendsQuery.isLoading) {
        seededSelectionRef.current = seedKey;
      }
      return;
    }

    const validSeedIds = seedMemberIds.filter((id) => friendMap.has(id));
    seededSelectionRef.current = seedKey;

    if (!validSeedIds.length) {
      return;
    }

    setSelectedIds((current) => {
      const restIds = current.filter((id) => !validSeedIds.includes(id));
      return [...validSeedIds, ...restIds];
    });
  }, [
    friendMap,
    friendsQuery.isLoading,
    open,
    seedMemberIds,
    sortedFriendItems.length,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || createMutation.isPending) {
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createMutation.isPending, onClose, open]);

  const toggleSelection = (characterId: string) => {
    setSelectedIds((current) =>
      current.includes(characterId)
        ? current.filter((item) => item !== characterId)
        : [...current, characterId],
    );
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.24)] p-6">
      <button
        type="button"
        aria-label="关闭发起群聊弹层"
        onClick={() => {
          if (!createMutation.isPending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div className="relative flex h-[min(720px,82vh)] w-full max-w-[640px] flex-col overflow-hidden rounded-[20px] border border-black/8 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
          <div>
            <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
              发起群聊
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              群名称会按成员自动生成，创建后可在聊天信息里修改。
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!createMutation.isPending) {
                onClose();
              }
            }}
            disabled={createMutation.isPending}
            aria-label="关闭"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-black/6 text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-black/6 px-6 py-4">
          {seedMemberIds.length ? (
            <div className="mb-3 rounded-[12px] bg-[#f3fff8] px-3 py-2.5 text-[12px] leading-5 text-[#2f7a4c]">
              已按当前聊天默认勾选对方，你可以继续添加其他联系人。
            </div>
          ) : null}

          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索联系人"
              className="h-11 w-full rounded-[12px] border border-black/8 bg-[#f8f8f8] pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-black/12 focus:bg-white"
            />
          </label>

          <div className="mt-3 min-h-9">
            {selectedFriends.length ? (
              <div className="flex flex-wrap gap-2">
                {selectedFriends.map((item) => {
                  const displayName = getFriendDisplayName(item);
                  return (
                    <button
                      key={item.character.id}
                      type="button"
                      onClick={() => toggleSelection(item.character.id)}
                      className="flex items-center gap-2 rounded-full bg-[#f1f1f1] px-3 py-1.5 text-left text-[12px] text-[color:var(--text-primary)] transition hover:bg-[#e9e9e9]"
                    >
                      <AvatarChip
                        name={displayName}
                        src={item.character.avatar}
                        size="sm"
                      />
                      <span className="max-w-24 truncate">{displayName}</span>
                      <X size={12} className="text-[color:var(--text-muted)]" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[12px] text-[color:var(--text-muted)]">
                先选择联系人，再开始一个新的群聊。
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          {friendsQuery.isLoading ? (
            <LoadingBlock className="px-3 py-4 text-left" label="正在读取联系人..." />
          ) : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? (
            <div className="px-3 py-2">
              <ErrorBlock message={friendsQuery.error.message} />
            </div>
          ) : null}
          {createMutation.isError && createMutation.error instanceof Error ? (
            <div className="px-3 py-2">
              <ErrorBlock message={createMutation.error.message} />
            </div>
          ) : null}

          {!friendsQuery.isLoading &&
          !friendsQuery.isError &&
          !friendItems.length ? (
            <div className="px-3 py-8">
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
            <div className="px-3 py-8">
              <EmptyState
                title="没有匹配的联系人"
                description="换个名字、备注名或关系关键词试试。"
              />
            </div>
          ) : null}

          <div className="space-y-1">
            {filteredFriends.map((item) => {
              const displayName = getFriendDisplayName(item);
              const checked = selectedIds.includes(item.character.id);
              return (
                <button
                  key={item.character.id}
                  type="button"
                  disabled={createMutation.isPending}
                  onClick={() => toggleSelection(item.character.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[12px] px-4 py-3 text-left transition disabled:opacity-60",
                    checked
                      ? "bg-[rgba(7,193,96,0.08)]"
                      : "hover:bg-[#f7f7f7]",
                  )}
                >
                  <AvatarChip
                    name={displayName}
                    src={item.character.avatar}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                      {displayName}
                    </div>
                    <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
                      {item.character.relationship || "世界联系人"}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      checked
                        ? "border-[#07c160] bg-[#07c160] text-white"
                        : "border-black/10 bg-[#f5f5f5] text-transparent",
                    )}
                  >
                    <Check size={12} strokeWidth={2.8} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-black/6 px-6 py-4">
          <div className="text-[12px] text-[color:var(--text-muted)]">
            已选择 {selectedIds.length} 位成员
            {selectedIds.length ? `，将创建“${defaultGroupName}”。` : "。"}
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="rounded-2xl"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => createMutation.mutate()}
              disabled={!selectedIds.length || createMutation.isPending}
              className="rounded-2xl px-6"
            >
              {createMutation.isPending ? "正在创建..." : "创建群聊"}
            </Button>
          </div>
        </div>
      </div>
    </div>
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
