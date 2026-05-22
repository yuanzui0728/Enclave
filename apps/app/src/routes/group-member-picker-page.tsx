import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import {
  addGroupMember,
  getFriends,
  getGroup,
  getGroupMembers,
  removeGroupMember,
  SELF_CHARACTER_ID,
} from "@yinjie/contracts";
import { getActiveLocale, useRuntimeTranslator } from "@yinjie/i18n";
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
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "../features/chat/mobile-group-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
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
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        panel="details"
        detailsAction={mode === "add" ? "member-add" : "member-remove"}
        title={
          mode === "add"
            ? t(msg`正在打开桌面添加成员`)
            : t(msg`正在打开桌面移除成员`)
        }
        description={
          mode === "add"
            ? t(msg`正在切换到桌面聊天中的添加成员弹层。`)
            : t(msg`正在切换到桌面聊天中的移除成员弹层。`)
        }
        loadingLabel={
          mode === "add"
            ? t(msg`打开桌面添加成员...`)
            : t(msg`打开桌面移除成员...`)
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
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [keyword, setKeyword] = useState("");
  // 走查 R1：filteredCandidateItems 直接吃 keyword，add 模式好友 100+
  // 时每个 keystroke 都同步重新 createFriendDirectoryItems + filter +
  // matchesFriendSearch 一遍——其中 createFriendDirectoryItems 内部还要
  // 重新算 indexLabel/sort，是这段流程里最贵的一步。和 create-group-page /
  // group-contacts-page 同口径补 useDeferredValue。
  const deferredKeyword = useDeferredValue(keyword);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
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

  // 走查 R1：三个 query 都没 staleTime（默认 0），用户在 /group/A/members/add
  // → /chat-list → 再 /group/A/members/add 这种秒级回访会重新 GET 三次
  // /api/groups/$id + /members + /friends，公网隧道 RTT ~600ms × 3 浪费明显。
  // create-group-page friendsQuery 已用 staleTime: 15_000 与其它兄弟页对齐；
  // 这里同样统一，contacts/add-friend mutation 也已经在显式 invalidate 这些 key
  // 所以 stale 不会脏。
  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
    staleTime: 15_000,
  });
  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
    staleTime: 15_000,
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: Boolean(groupId),
    staleTime: 15_000,
  });

  // 走查 R1：tanstack-router 在 /group/A/members/add → /group/B/members/add 这种
  // 只换 param 的跳转下不重挂载组件，selectedIds / keyword / removeConfirmOpen
  // 仍保留上一群 A 的状态。selectedFriends 虽然按 candidateMap 过滤所以视觉上
  // 看不到 A 的旧选项，但 selectedIds 仍带着 stale id，点"确定"会把 A 的成员
  // POST 到 B；keyword 没清空导致搜索框留着 A 的关键字、候选直接被过滤成空——
  // 用户以为没人能选。和 background/edit/announcement 几个姊妹页面对齐，
  // groupId/baseUrl/mode 任一变化都重置一次。
  useEffect(() => {
    setSelectedIds([]);
    setKeyword("");
    setRemoveConfirmOpen(false);
  }, [baseUrl, groupId, mode]);

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
      // 再次走查 Round 1：getFriends 服务端把 char-default-self（"我自己"
      // 自我镜像）作为默认好友 intimacy=100 塞回好友列表；create-group-page
      // 早就在 R2 注释过同样的事，过滤掉了 SELF。这里"添加群成员"漏掉，
      // 用户能把"我自己" 作为 character member 加进去——服务端会落一条
      // memberType=character 的成员记录，加上原来 memberType=user 的群主
      // 就变成"你自己和你自己同时在群里"两条；后续 typing/atMe 走 character
      // 路径也会出现"我自己 正在回复..."这种诡异提示。
      return createFriendDirectoryItems(
        (friendsQuery.data ?? []).filter(
          (item) =>
            item.character.id !== SELF_CHARACTER_ID &&
            !memberIds.has(item.character.id),
        ),
      ).map((item) => ({
        id: item.character.id,
        name: getFriendDisplayName(item),
        subtitle:
          getFriendDisplayName(item) !== item.character.name
            ? t(msg`昵称：${item.character.name}`)
            : item.character.relationship || t(msg`世界联系人`),
        avatar: item.character.avatar ?? undefined,
        indexLabel: item.indexLabel,
      }));
    }

    return [...(membersQuery.data ?? [])]
      .filter((item) => item.memberType === "character")
      .map((item) => {
        const rawName = item.memberName?.trim() || item.memberId;
        const friend = friendMap.get(item.memberId);
        // 走查 2026-05-18 移动端群聊 R3：原 displayName = getFriendDisplayName(friend)
        // 等于 friend.friendship.remarkName || friend.character.name —— 后者拿的是
        // character 的**当前**名字。若 character 在另一台设备 / 后台被改名（或落库
        // 数据被工具/测试改成「走查词条_xxx」），同一个角色在群详情页（按
        // memberName 显示 "阿巡"）和移除成员页（按 character.name 显示 "走查词条_
        // 177886..."）名字完全对不上，用户根本不知道勾的是谁。
        // 群成员展示沿用 WeChat 群语义：remarkName > 群里的 memberName（joinedAt
        // 时落的，等价"群昵称"）> character.name > id —— 三处选择面板（details
        // grid / remove picker / mention picker）逻辑统一。
        const remarkName = friend?.friendship.remarkName?.trim();
        const displayName =
          remarkName ||
          item.memberName?.trim() ||
          friend?.character.name ||
          item.memberId;
        const roleLabel =
          item.role === "admin" ? t(msg`管理员`) : t(msg`群成员`);

        return {
          id: item.memberId,
          name: displayName,
          subtitle:
            displayName !== rawName
              ? t(msg`昵称：${rawName} · ${roleLabel}`)
              : roleLabel,
          avatar: item.memberAvatar ?? undefined,
          indexLabel: t(msg`群成员`),
        };
      })
      .sort((left, right) =>
        left.name.localeCompare(right.name, getActiveLocale()),
      );
  }, [friendMap, friendsQuery.data, memberIds, membersQuery.data, mode, t]);

  const filteredCandidateItems = useMemo(() => {
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return allCandidateItems;
    }

    if (mode === "add") {
      // 同上：搜索分支也得把 SELF 过掉，否则用户输入"我"还是能在搜索结果里
      // 看到"我自己"被勾选添加进群。
      return createFriendDirectoryItems(
        (friendsQuery.data ?? []).filter(
          (item) =>
            item.character.id !== SELF_CHARACTER_ID &&
            !memberIds.has(item.character.id) &&
            matchesFriendSearch(item, normalizedKeyword),
        ),
      ).map((item) => ({
        id: item.character.id,
        name: getFriendDisplayName(item),
        subtitle:
          getFriendDisplayName(item) !== item.character.name
            ? t(msg`昵称：${item.character.name}`)
            : item.character.relationship || t(msg`世界联系人`),
        avatar: item.character.avatar ?? undefined,
        indexLabel: item.indexLabel,
      }));
    }

    return allCandidateItems.filter((item) =>
      [item.name, item.subtitle].some((value) =>
        value.toLowerCase().includes(normalizedKeyword),
      ),
    );
  }, [allCandidateItems, deferredKeyword, friendsQuery.data, memberIds, mode, t]);

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
  // 走查新一轮 R1：和 create-group-page R1 同款问题——membersQuery / friendsQuery
  // 60s staleTime 期间用户在另一台设备上把候选项打散了（add 模式：另一端把同一
  // 个 character 也拉进群；remove 模式：另一端先把这个 character 移走），
  // socket conversation_updated → 这里 invalidate → membersQuery 刷新 →
  // allCandidateItems 把这个 id 摘掉。但 selectedIds 还攒着这个 stale id —
  // 横滚「已选成员」里看不到（selectedItems 已经按 candidateMap 过滤），
  // 顶部「确定(N)」按钮上的 N 多算一个；点确定时这一批 memberId 里仍带它，
  // add 模式服务端遇重复 return existing 没问题，remove 模式直接 404 把整批
  // 翻成"部分失败"。candidateMap 一旦重建就 reconcile：丢掉 map 里不再存在
  // 的 id。candidateMap 还是 0 size 时（query 还在 loading）不动 selectedIds，
  // 免得初始挂载就把刚选好的项清空。
  useEffect(() => {
    if (!candidateMap.size) {
      return;
    }
    setSelectedIds((current) => {
      if (current.every((id) => candidateMap.has(id))) {
        return current;
      }
      return current.filter((id) => candidateMap.has(id));
    });
  }, [candidateMap]);
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

  // 同步防双击锁——下面「确定」按钮原本只靠 disabled=submitMutation.isPending
  // 兜底，但 disabled 要等 React commit 才生效。add 模式连点 2 次会同时通过
  // 两次 isPending=false → 同一批 memberId 被 POST /groups/$id/members 两遍，
  // 服务端唯一约束会让第二批全部 409，但还是浪费 RTT 且 UI 上看着像"成功了"
  // 但实际后端冒出一堆 409 日志。submittingRef 同步赋值，第一次 click 翻
  // true 后同帧后续 click 都被早返。remove 模式靠 setRemoveConfirmOpen 弹层
  // 二次确认，天然只点一次，不受影响。
  const submittingRef = useRef(false);
  // 走查 Round 2：原版用 Promise.all，任意一条 add/remove 失败就把整批抛错——
  // 但已经先成功的那几条仍然落库了，membersQuery 不 invalidate / selectedIds
  // 不收口，用户点"重试" 会拿同一批 memberId 再打一遍：
  //   - remove 模式下，已经成功移除的那些会触发 CHAT_GROUP_MEMBER_NOT_FOUND，
  //     本来"部分成功"的批次反而被翻成"整批失败"，UI 没法区分；
  //   - add 模式下 addMember 服务端遇到重复直接 return existing（不抛），所
  //     以 retry 在 add 模式是幂等的，但 selectedIds 还留着已经加进群的 ID，
  //     重试 toast 总条数显示也不对。
  // 改成 Promise.allSettled：把已成功的 ID 从 selectedIds 摘掉、refetch 群
  // 成员，让用户基于真实当前成员状态决定剩余失败项要不要重试。
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selectedIds.length) {
        return;
      }

      const results = await Promise.allSettled(
        selectedIds.map((memberId) =>
          mode === "add"
            ? addGroupMember(
                groupId,
                {
                  memberId,
                  memberType: "character",
                },
                baseUrl,
              ).then(() => memberId)
            : removeGroupMember(groupId, memberId, baseUrl).then(
                () => memberId,
              ),
        ),
      );

      const fulfilledIds: string[] = [];
      const errors: Error[] = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          fulfilledIds.push(result.value);
        } else {
          const reason = result.reason;
          errors.push(
            reason instanceof Error ? reason : new Error(String(reason)),
          );
        }
      }

      if (errors.length) {
        if (fulfilledIds.length) {
          setSelectedIds((current) =>
            current.filter((id) => !fulfilledIds.includes(id)),
          );
          // 走查 R4：部分成功路径下 await Promise.all 3 条 invalidate 后才
          // throw error → 用户看到失败提示前要多等 ~1.8s 公网隧道 RTT。
          // 立即 throw 让 toast 立刻弹出，invalidate 后台同步即可。
          void queryClient.invalidateQueries({
            queryKey: ["app-group", baseUrl, groupId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["app-group-members", baseUrl, groupId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["app-conversations", baseUrl],
          });
        }
        const firstMessage = errors[0]?.message?.trim();
        throw new Error(
          firstMessage ||
            (mode === "add"
              ? t(msg`部分成员添加失败，请稍后再试。`)
              : t(msg`部分成员移除失败，请稍后再试。`)),
        );
      }
    },
    onSuccess: () => {
      setRemoveConfirmOpen(false);
      // 走查 R3：和姊妹页 pin/preferences/leave 同口径——本页 add/remove 成员
      // 都会改变 listGroups 返回的 memberCount，contacts-page / group-contacts-page
      // 的 ["app-contact-groups"] cache（30s staleTime）不会自动跟上，用户从本
      // 页 navigate 回 details → 退到 /contacts/groups 时人数仍是旧值。把这条
      // 也 invalidate，确保所有 cohort 看到最新成员数。
      // 走查 R4：原本 await Promise.all 4 条 invalidate 才 navigate，公网隧道
      // ~600ms × 4 ≈ 2.4s 用户看着 spinner 才跳回详情页。fire-and-forget 让
      // 导航立刻发生，目标页 react-query 监听同 key 会自动重拉。
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      void navigate({
        to: "/group/$groupId/details",
        params: { groupId },
        ...(currentRouteHash ? { hash: currentRouteHash } : {}),
        replace: true,
      });
    },
    onError: () => {
      setRemoveConfirmOpen(false);
    },
  });

  function handleSubmit() {
    if (!selectedIds.length || submitMutation.isPending) {
      return;
    }
    if (mode === "remove") {
      setRemoveConfirmOpen(true);
      return;
    }
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    submitMutation.mutate(undefined, {
      onSettled: () => {
        submittingRef.current = false;
      },
    });
  }

  const pageTitle = mode === "add" ? t(msg`添加成员`) : t(msg`移除成员`);
  const emptyStateTitle =
    mode === "add"
      ? t(msg`没有可添加的联系人`)
      : t(msg`当前没有可移除的群成员`);
  const emptyStateDescription =
    mode === "add"
      ? t(msg`通讯录里的联系人已经都在群里了。`)
      : t(msg`这个群目前没有可移除的角色成员。`);
  const loadingLabel =
    mode === "add" ? t(msg`正在读取联系人...`) : t(msg`正在读取群成员...`);

  function openGroupDetails() {
    void navigate({
      to: "/group/$groupId/details",
      params: { groupId },
      ...(currentRouteHash ? { hash: currentRouteHash } : {}),
    });
  }

  function handleRetrySubmit() {
    if (!selectedIds.length) {
      return;
    }
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    submitMutation.mutate(undefined, {
      onSettled: () => {
        submittingRef.current = false;
      },
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
            onClick={() => {
              // R1 走查：原本直接 navigate({to: details}) push 一条新 history
              // 项，用户 [details → members/add → 点返回] 后浏览器后退会落回
              // members/add 死循环。和姊妹页 announcement/edit/background/search
              // 同口径用 navigateBackOrFallback：能 history.back() 就 back，安全
              // 兜不住时再走 fresh navigate 到 details。
              navigateBackOrFallback(
                openGroupDetails,
                `/group/${groupId}/details`,
              );
            }}
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <button
            type="button"
            onClick={handleSubmit}
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
                ? t(msg`添加中`)
                : t(msg`移除中`)
              : selectedIds.length
                ? t(msg`确定(${selectedIds.length})`)
                : t(msg`确定`)}
          </button>
        }
      >
        <div className="space-y-3 pt-3">
          <div className="-mx-4 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                {mode === "add" ? t(msg`已选联系人`) : t(msg`已选成员`)}
              </div>
              <div className="text-[12px] text-[color:var(--text-muted)]">
                {selectedIds.length
                  ? t(msg`${selectedIds.length} 人`)
                  : t(msg`未选择`)}
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
                  ? t(msg`选择联系人后，就可以把他们加入当前群聊。`)
                  : t(msg`选择成员后，就可以把他们从当前群聊移除。`)}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 py-2.5 text-sm text-[color:var(--text-dim)]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={
                mode === "add" ? t(msg`搜索联系人`) : t(msg`搜索群成员`)
              }
              // 走查 R3：和姊妹页 chat-message-search-panel R1 / create-group-page
              // R2 同款 a11y 修法——父 label 没有文本子节点，placeholder 行为
              // 在 SR 上分裂。挂 aria-label 把当前 mode 的意图明确表达。
              aria-label={
                mode === "add" ? t(msg`搜索联系人`) : t(msg`搜索群成员`)
              }
              // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              // 走查 R1：和姊妹页 create-group-page R1 同款修法。备注名/角色名
              // 常是 ASCII（"wangxiaoming"、"zhang yang"）或英文姓名缩写，
              // iOS 默认句首大写 + autocorrect 把"wang"改成"Wang"或"Want"，
              // matchesFriendSearch 内部 toLowerCase 所以 case 不致命，但
              // autocorrect 把字直接改掉是真坑。enterKeyHint=search 让软键盘
              // 的 Return 键长得像"搜索"，与"搜索结果列表"语义对齐。
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
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
              badge={t(msg`读取中`)}
              title={loadingLabel.replace("...", "")}
              description={
                mode === "add"
                  ? t(msg`稍等一下，正在同步可加入当前群聊的联系人。`)
                  : t(msg`稍等一下，正在同步当前可移除的群成员。`)
              }
              tone="loading"
            />
          </div>
        ) : null}
        {groupQuery.isError && groupQuery.error instanceof Error ? (
          <div className="px-4 pt-4">
            <MobileGroupMemberPickerStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`群聊信息暂时不可用`)}
              description={describeRequestError(groupQuery.error)}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={() => {
                      void groupQuery.refetch();
                    }}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={openGroupDetails}
                  >
                    {t(msg`返回群聊信息`)}
                  </Button>
                </div>
              }
              tone="danger"
            />
          </div>
        ) : null}
        {membersQuery.isError && membersQuery.error instanceof Error ? (
          <div className="px-4 pt-4">
            <MobileGroupMemberPickerStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`群成员信息暂时不可用`)}
              description={describeRequestError(membersQuery.error)}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={() => {
                      void membersQuery.refetch();
                    }}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={openGroupDetails}
                  >
                    {t(msg`返回群聊信息`)}
                  </Button>
                </div>
              }
              tone="danger"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-4">
            <MobileGroupMemberPickerStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`联系人列表暂时不可用`)}
              description={describeRequestError(friendsQuery.error)}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={() => {
                      void friendsQuery.refetch();
                    }}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={openGroupDetails}
                  >
                    {t(msg`返回群聊信息`)}
                  </Button>
                </div>
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
                  {describeRequestError(submitMutation.error)}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleRetrySubmit}
                    className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                  >
                    {mode === "add" ? t(msg`重试添加`) : t(msg`重试移除`)}
                  </button>
                  <button
                    type="button"
                    onClick={openGroupDetails}
                    className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                  >
                    {t(msg`返回群聊信息`)}
                  </button>
                </div>
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
              badge={mode === "add" ? t(msg`联系人`) : t(msg`群成员`)}
              title={emptyStateTitle}
              description={emptyStateDescription}
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  {t(msg`返回群聊信息`)}
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
      {mode === "remove" ? (
        <MobileDetailsActionSheet
          open={removeConfirmOpen}
          title={t(msg`移除 ${selectedIds.length} 位群成员`)}
          description={t(
            msg`移除后，这些成员将不再参与本群消息。可以稍后通过“添加成员”重新邀请。`,
          )}
          actions={[
            {
              key: "confirm-remove",
              label: t(msg`确认移除`),
              danger: true,
              disabled: submitMutation.isPending,
              onClick: () => {
                if (submitMutation.isPending) {
                  return;
                }
                if (submittingRef.current) {
                  return;
                }
                submittingRef.current = true;
                submitMutation.mutate(undefined, {
                  onSettled: () => {
                    submittingRef.current = false;
                  },
                });
              },
            },
          ]}
          onClose={() => {
            if (submitMutation.isPending) {
              return;
            }
            setRemoveConfirmOpen(false);
          }}
        />
      ) : null}
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
