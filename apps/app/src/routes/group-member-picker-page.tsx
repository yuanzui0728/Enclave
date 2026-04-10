import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  addGroupMember,
  getFriends,
  getGroup,
  getGroupMembers,
  removeGroupMember,
} from "@yinjie/contracts";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { AppPage, Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  buildContactSections,
  createFriendDirectoryItems,
} from "../features/contacts/contact-utils";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type GroupMemberPickerMode = "add" | "remove";

type CandidateItem = {
  id: string;
  name: string;
  subtitle: string;
  avatar?: string;
  indexLabel?: string;
};

export function GroupMemberAddPage() {
  const { groupId } = useParams({ from: "/group/$groupId/members/add" });
  return <GroupMemberPickerPage groupId={groupId} mode="add" />;
}

export function GroupMemberRemovePage() {
  const { groupId } = useParams({ from: "/group/$groupId/members/remove" });
  return <GroupMemberPickerPage groupId={groupId} mode="remove" />;
}

function GroupMemberPickerPage({
  groupId,
  mode,
}: {
  groupId: string;
  mode: GroupMemberPickerMode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });
  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: mode === "add",
  });

  const memberIds = useMemo(
    () => new Set((membersQuery.data ?? []).map((item) => item.memberId)),
    [membersQuery.data],
  );

  const allCandidateItems = useMemo(() => {
    if (mode === "add") {
      return createFriendDirectoryItems(
        (friendsQuery.data ?? []).filter(
          (item) => !memberIds.has(item.character.id),
        ),
      ).map((item) => ({
        id: item.character.id,
        name: item.friendship.remarkName?.trim() || item.character.name,
        subtitle: item.character.relationship || "世界联系人",
        avatar: item.character.avatar ?? undefined,
        indexLabel: item.indexLabel,
      }));
    }

    return [...(membersQuery.data ?? [])]
      .filter((item) => item.memberType === "character")
      .map((item) => ({
        id: item.memberId,
        name: item.memberName ?? item.memberId,
        subtitle: item.role === "admin" ? "管理员" : "群成员",
        avatar: item.memberAvatar ?? undefined,
        indexLabel: "群成员",
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [friendsQuery.data, memberIds, membersQuery.data, mode]);

  const filteredCandidateItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return allCandidateItems;
    }

    return allCandidateItems.filter((item) =>
      [item.name, item.subtitle].some((value) =>
        value.toLowerCase().includes(normalizedKeyword),
      ),
    );
  }, [allCandidateItems, keyword]);

  const candidateSections = useMemo(() => {
    return buildContactSections(
      filteredCandidateItems.map((item) => ({
        ...item,
        indexLabel: item.indexLabel ?? "#",
      })),
    );
  }, [filteredCandidateItems]);

  const candidateMap = useMemo<Map<string, CandidateItem>>(
    () => new Map(allCandidateItems.map((item) => [item.id, item])),
    [allCandidateItems],
  );
  const selectedItems = useMemo(
    () =>
      selectedIds.flatMap((id) => {
        const item = candidateMap.get(id);
        return item ? [item] : [];
      }),
    [candidateMap, selectedIds],
  );
  const toggleSelection = (targetId: string) => {
    setSelectedIds((current) => toggleSelectionItem(current, targetId));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIds.length) {
        return;
      }

      if (mode === "add") {
        await Promise.all(
          selectedIds.map((memberId) =>
            addGroupMember(
              groupId,
              {
                memberId,
                memberType: "character",
              },
              baseUrl,
            ),
          ),
        );
        return;
      }

      await Promise.all(
        selectedIds.map((memberId) =>
          removeGroupMember(groupId, memberId, baseUrl),
        ),
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({
        to: "/group/$groupId/details",
        params: { groupId },
      });
    },
  });

  const pageTitle = mode === "add" ? "添加成员" : "移除成员";
  const emptyStateTitle =
    mode === "add" ? "没有可添加的联系人" : "当前没有可移除的群成员";
  const emptyStateDescription =
    mode === "add"
      ? "通讯录里的联系人已经都在群里了。"
      : "这个群目前没有可移除的角色成员。";
  const loadingLabel =
    mode === "add" ? "正在读取联系人..." : "正在读取群成员...";

  return (
    <AppPage className="space-y-0 bg-[#ededed] px-0 py-0">
      <TabPageTopBar
        title={pageTitle}
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-black/6 bg-[#f7f7f7] px-4 py-3 text-[#111827] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[#111827]"
            onClick={() => {
              void navigate({
                to: "/group/$groupId/details",
                params: { groupId },
              });
            }}
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={!selectedIds.length || submitMutation.isPending}
            className={cn(
              "h-9 rounded-full px-3 text-[15px] font-medium transition",
              selectedIds.length && !submitMutation.isPending
                ? mode === "add"
                  ? "bg-[#07c160] text-white active:opacity-90"
                  : "bg-[#ff4d4f] text-white active:opacity-90"
                : "text-[#b9b9b9]",
            )}
          >
            {submitMutation.isPending
              ? mode === "add"
                ? "添加中"
                : "移除中"
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
                {mode === "add" ? "已选联系人" : "已选成员"}
              </div>
              <div className="text-[12px] text-[#8c8c8c]">
                {selectedIds.length ? `${selectedIds.length} 人` : "未选择"}
              </div>
            </div>

            {selectedItems.length ? (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {selectedItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleSelection(item.id)}
                    className="flex w-14 shrink-0 flex-col items-center gap-1 text-center"
                  >
                    <div className="relative">
                      <AvatarChip
                        name={item.name}
                        src={item.avatar}
                        size="wechat"
                      />
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white">
                        <X size={10} />
                      </span>
                    </div>
                    <span className="w-full truncate text-[11px] text-[#5f5f5f]">
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-[12px] leading-5 text-[#8c8c8c]">
                {mode === "add"
                  ? "选择联系人后，就可以把他们加入当前群聊。"
                  : "选择成员后，就可以把他们从当前群聊移除。"}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 rounded-[10px] bg-white px-3 py-2.5 text-sm text-[#8c8c8c]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={mode === "add" ? "搜索联系人" : "搜索群成员"}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#111827] outline-none placeholder:text-[#a3a3a3]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        {groupQuery.isLoading ||
        membersQuery.isLoading ||
        (mode === "add" && friendsQuery.isLoading) ? (
          <div className="px-3 pt-3">
            <LoadingBlock label={loadingLabel} />
          </div>
        ) : null}
        {groupQuery.isError && groupQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={groupQuery.error.message} />
          </div>
        ) : null}
        {membersQuery.isError && membersQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={membersQuery.error.message} />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={friendsQuery.error.message} />
          </div>
        ) : null}
        {submitMutation.isError && submitMutation.error instanceof Error ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={submitMutation.error.message} />
          </div>
        ) : null}

        {!groupQuery.isLoading &&
        !membersQuery.isLoading &&
        !(mode === "add" && friendsQuery.isLoading) &&
        !filteredCandidateItems.length &&
        !submitMutation.isPending ? (
          <div className="px-3 pt-6">
            <EmptyState
              title={emptyStateTitle}
              description={emptyStateDescription}
            />
          </div>
        ) : null}

        {candidateSections.length ? (
          <div className="pt-2">
            {candidateSections.map((section) => (
              <section key={section.key} className="mt-2">
                <div className="px-4 py-1.5 text-[12px] text-[#8c8c8c]">
                  {section.title}
                </div>
                <div className="border-y border-black/6 bg-white">
                  {section.items.map((item, index) => (
                    <CandidateRow
                      key={item.id}
                      checked={selectedIds.includes(item.id)}
                      disabled={submitMutation.isPending}
                      name={item.name}
                      subtitle={item.subtitle}
                      src={item.avatar}
                      withDivider={index > 0}
                      onClick={() => toggleSelection(item.id)}
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

function CandidateRow({
  checked,
  disabled,
  name,
  subtitle,
  src,
  withDivider = false,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  name: string;
  subtitle: string;
  src?: string | null;
  withDivider?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60",
        checked ? "bg-[#f3fff8]" : "bg-white",
        withDivider ? "border-t border-black/6" : "",
      )}
    >
      <AvatarChip name={name} src={src} size="wechat" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] text-[color:var(--text-primary)]">
          {name}
        </div>
        <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
          {subtitle}
        </div>
      </div>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
          checked
            ? "border-[#07c160] bg-[#07c160] text-white"
            : "border-black/10 bg-[#f5f5f5] text-transparent",
        )}
      >
        <Check size={12} strokeWidth={2.8} />
      </span>
    </button>
  );
}

function toggleSelectionItem(current: string[], targetId: string) {
  return current.includes(targetId)
    ? current.filter((item) => item !== targetId)
    : [...current, targetId];
}
