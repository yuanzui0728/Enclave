import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  addGroupMember,
  getFriends,
  getGroup,
  getGroupMembers,
  removeGroupMember,
} from "@yinjie/contracts";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  buildContactSections,
  createFriendDirectoryItems,
  getFriendDisplayName,
  matchesFriendSearch,
} from "../features/contacts/contact-utils";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "../features/chat/mobile-group-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { isDesktopOnlyPath } from "../lib/history-back";
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
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        panel="details"
        detailsAction={mode === "add" ? "member-add" : "member-remove"}
        title={mode === "add" ? "正在打开桌面添加成员" : "正在打开桌面移除成员"}
        description={
          mode === "add"
            ? "正在切换到桌面聊天工作区中的添加成员弹层。"
            : "正在切换到桌面聊天工作区中的移除成员弹层。"
        }
        loadingLabel={
          mode === "add" ? "打开桌面添加成员..." : "打开桌面移除成员..."
        }
      />
    );
  }

  return <MobileGroupMemberPickerPage groupId={groupId} mode={mode} />;
}

function MobileGroupMemberPickerPage({
  groupId,
  mode,
}: {
  groupId: string;
  mode: GroupMemberPickerMode;
}) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const routeState = parseMobileGroupRouteState(hash);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileGroupRouteHash({
        highlightedMessageId: routeState.highlightedMessageId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [routeState.highlightedMessageId, safeReturnHash, safeReturnPath],
  );

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
    enabled: Boolean(groupId),
  });

  useEffect(() => {
    if (
      groupQuery.isLoading ||
      !isMissingGroupError(groupQuery.error, groupId)
    ) {
      return;
    }

    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    groupId,
    groupQuery.error,
    groupQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
  ]);

  const memberIds = useMemo(
    () => new Set((membersQuery.data ?? []).map((item) => item.memberId)),
    [membersQuery.data],
  );
  const friendMap = useMemo(
    () =>
      new Map(
        (friendsQuery.data ?? []).map((item) => [item.character.id, item]),
      ),
    [friendsQuery.data],
  );

  const allCandidateItems = useMemo(() => {
    if (mode === "add") {
      return createFriendDirectoryItems(
        (friendsQuery.data ?? []).filter(
          (item) => !memberIds.has(item.character.id),
        ),
      ).map((item) => ({
        id: item.character.id,
        name: getFriendDisplayName(item),
        subtitle:
          getFriendDisplayName(item) !== item.character.name
            ? `昵称：${item.character.name}`
            : item.character.relationship || "世界联系人",
        avatar: item.character.avatar ?? undefined,
        indexLabel: item.indexLabel,
      }));
    }

    return [...(membersQuery.data ?? [])]
      .filter((item) => item.memberType === "character")
      .map((item) => {
        const rawName = item.memberName?.trim() || item.memberId;
        const friend = friendMap.get(item.memberId);
        const displayName = friend ? getFriendDisplayName(friend) : rawName;
        const roleLabel = item.role === "admin" ? "管理员" : "群成员";

        return {
          id: item.memberId,
          name: displayName,
          subtitle:
            displayName !== rawName
              ? `昵称：${rawName} · ${roleLabel}`
              : roleLabel,
          avatar: item.memberAvatar ?? undefined,
          indexLabel: "群成员",
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [friendMap, friendsQuery.data, memberIds, membersQuery.data, mode]);

  const filteredCandidateItems = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return allCandidateItems;
    }

    if (mode === "add") {
      return createFriendDirectoryItems(
        (friendsQuery.data ?? []).filter(
          (item) =>
            !memberIds.has(item.character.id) &&
            matchesFriendSearch(item, normalizedKeyword),
        ),
      ).map((item) => ({
        id: item.character.id,
        name: getFriendDisplayName(item),
        subtitle:
          getFriendDisplayName(item) !== item.character.name
            ? `昵称：${item.character.name}`
            : item.character.relationship || "世界联系人",
        avatar: item.character.avatar ?? undefined,
        indexLabel: item.indexLabel,
      }));
    }

    return allCandidateItems.filter((item) =>
      [item.name, item.subtitle].some((value) =>
        value.toLowerCase().includes(normalizedKeyword),
      ),
    );
  }, [allCandidateItems, friendsQuery.data, keyword, memberIds, mode]);

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
        ...(currentRouteHash ? { hash: currentRouteHash } : {}),
        replace: true,
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

  function openGroupDetails() {
    void navigate({
      to: "/group/$groupId/details",
      params: { groupId },
      ...(currentRouteHash ? { hash: currentRouteHash } : {}),
    });
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={pageTitle}
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 py-3 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
            onClick={openGroupDetails}
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
                : "text-[color:var(--text-dim)]",
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
          <div className="-mx-4 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                {mode === "add" ? "已选联系人" : "已选成员"}
              </div>
              <div className="text-[12px] text-[color:var(--text-muted)]">
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
                    <span className="w-full truncate text-[11px] text-[color:var(--text-secondary)]">
                      {item.name}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-[12px] leading-5 text-[color:var(--text-muted)]">
                {mode === "add"
                  ? "选择联系人后，就可以把他们加入当前群聊。"
                  : "选择成员后，就可以把他们从当前群聊移除。"}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 py-2.5 text-sm text-[color:var(--text-dim)]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={mode === "add" ? "搜索联系人" : "搜索群成员"}
              className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        {groupQuery.isLoading ||
        membersQuery.isLoading ||
        (mode === "add" && friendsQuery.isLoading) ? (
          <div className="px-4 pt-4">
            <MobileGroupMemberPickerStatusCard
              badge="读取中"
              title={loadingLabel.replace("...", "")}
              description={
                mode === "add"
                  ? "稍等一下，正在同步可加入当前群聊的联系人。"
                  : "稍等一下，正在同步当前可移除的群成员。"
              }
              tone="loading"
            />
          </div>
        ) : null}
        {groupQuery.isError && groupQuery.error instanceof Error ? (
          <div className="px-4 pt-4">
            <MobileGroupMemberPickerStatusCard
              badge="读取失败"
              title="群聊信息暂时不可用"
              description={groupQuery.error.message}
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  返回群聊信息
                </Button>
              }
              tone="danger"
            />
          </div>
        ) : null}
        {membersQuery.isError && membersQuery.error instanceof Error ? (
          <div className="px-4 pt-4">
            <MobileGroupMemberPickerStatusCard
              badge="读取失败"
              title="群成员信息暂时不可用"
              description={membersQuery.error.message}
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  返回群聊信息
                </Button>
              }
              tone="danger"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-4">
            <MobileGroupMemberPickerStatusCard
              badge="读取失败"
              title="联系人列表暂时不可用"
              description={friendsQuery.error.message}
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  返回群聊信息
                </Button>
              }
              tone="danger"
            />
          </div>
        ) : null}
        {submitMutation.isError && submitMutation.error instanceof Error ? (
          <div className="px-4 pt-4">
            <InlineNotice
              tone="danger"
              className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {submitMutation.error.message}
                </span>
                <button
                  type="button"
                  onClick={openGroupDetails}
                  className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                >
                  返回群聊信息
                </button>
              </div>
            </InlineNotice>
          </div>
        ) : null}

        {!groupQuery.isLoading &&
        !membersQuery.isLoading &&
        !(mode === "add" && friendsQuery.isLoading) &&
        !filteredCandidateItems.length &&
        !submitMutation.isPending ? (
          <div className="px-4 pt-6">
            <MobileGroupMemberPickerStatusCard
              badge={mode === "add" ? "联系人" : "群成员"}
              title={emptyStateTitle}
              description={emptyStateDescription}
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  返回群聊信息
                </Button>
              }
            />
          </div>
        ) : null}

        {candidateSections.length ? (
          <div>
            {candidateSections.map((section) => (
              <section key={section.key} className="mt-2">
                <div className="px-4 py-1.5 text-[12px] text-[color:var(--text-muted)]">
                  {section.title}
                </div>
                <div className="border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
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
  variant = "mobile",
  withDivider = false,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  name: string;
  subtitle: string;
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
        "flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-60",
        isDesktop
          ? checked
            ? "rounded-[12px] border border-[rgba(7,193,96,0.18)] bg-[rgba(240,247,243,0.96)] shadow-[inset_0_0_0_1px_rgba(7,193,96,0.06)]"
            : "rounded-[12px] border border-transparent bg-transparent transition hover:border-[color:var(--border-faint)] hover:bg-[color:var(--surface-console)]"
          : checked
            ? "bg-[rgba(7,193,96,0.06)]"
            : "bg-[color:var(--bg-canvas-elevated)]",
        !isDesktop && withDivider
          ? "border-t border-[color:var(--border-faint)]"
          : "",
        !isDesktop && !disabled
          ? "hover:bg-[color:var(--surface-card-hover)]"
          : "",
      )}
    >
      <AvatarChip name={name} src={src} size={isDesktop ? "md" : "wechat"} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] text-[color:var(--text-primary)]">
          {name}
        </div>
        {isDesktop ? (
          <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
            {subtitle}
          </div>
        ) : null}
      </div>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border text-[11px]",
          isDesktop ? "h-6 w-6" : "h-5 w-5",
          checked
            ? "border-[#07c160] bg-[#07c160] text-white"
            : isDesktop
              ? "border-[color:var(--border-faint)] bg-white text-transparent"
              : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] text-transparent",
        )}
      >
        <Check size={isDesktop ? 14 : 12} strokeWidth={2.8} />
      </span>
    </button>
  );
}

function toggleSelectionItem(current: string[], targetId: string) {
  return current.includes(targetId)
    ? current.filter((item) => item !== targetId)
    : [...current, targetId];
}

function MobileGroupMemberPickerStatusCard({
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
