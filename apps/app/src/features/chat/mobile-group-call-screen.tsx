import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import {
  getGroup,
  getGroupMembers,
  sendGroupMessage,
  type GroupMessage,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import {
  ArrowLeft,
  Camera,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  VideoOff,
  Volume2,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { GroupAvatarChip } from "../../components/group-avatar-chip";
import { InlineNoticeActionButton } from "../../components/inline-notice-action-button";
import { formatDetailedMessageTimestamp } from "../../lib/format";
import { describeRequestError } from "../../lib/request-error";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useDesktopLayout } from "../shell/use-desktop-layout";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
} from "../desktop/chat/desktop-chat-route-state";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "./mobile-group-route-state";
import { upsertServerMessageInCache } from "./chat-message-delivery";
import { buildGroupCallInviteMessage } from "./group-call-message";
import { getGroupCallStatusLabel } from "./group-call-presentation";
import { parseMobileGroupCallRouteHash } from "./mobile-group-call-route-state";
import { buildChatCallReturnSearch } from "./chat-compose-shortcut-route";

type MobileGroupCallScreenProps = {
  mode: "voice" | "video";
};

export function MobileGroupCallScreen({ mode }: MobileGroupCallScreenProps) {
  const t = useRuntimeTranslator();
  const { groupId } = useParams({
    strict: false,
  }) as {
    groupId?: string;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const baseUrl = runtimeConfig.apiBaseUrl;
  const resolvedGroupId = groupId ?? "";
  const routeState = useMemo(() => parseMobileGroupCallRouteHash(hash), [hash]);
  const fallbackGroupRouteState = useMemo(
    () => parseMobileGroupRouteState(hash),
    [hash],
  );
  const effectiveSource = routeState?.source ?? "mobile";
  const desktopThreadPath = useMemo(
    () =>
      buildDesktopChatThreadPath({
        conversationId: resolvedGroupId,
      }),
    [resolvedGroupId],
  );
  const desktopDetailsHash = useMemo(
    () =>
      buildDesktopChatRouteHash({
        conversationId: resolvedGroupId,
        panel: "details",
      }),
    [resolvedGroupId],
  );
  const groupRouteHash = useMemo(
    () =>
      buildMobileGroupRouteHash({
        highlightedMessageId:
          routeState?.highlightedMessageId ??
          fallbackGroupRouteState.highlightedMessageId,
        returnPath:
          routeState?.returnPath ?? fallbackGroupRouteState.returnPath,
        returnHash:
          routeState?.returnHash ?? fallbackGroupRouteState.returnHash,
      }),
    [
      fallbackGroupRouteState.highlightedMessageId,
      fallbackGroupRouteState.returnHash,
      fallbackGroupRouteState.returnPath,
      routeState,
    ],
  );
  const resumeCounts = useMemo(() => {
    if (
      routeState === null ||
      routeState.activeCount === null ||
      routeState.totalCount === null
    ) {
      return null;
    }

    return {
      activeCount: routeState.activeCount,
      totalCount: routeState.totalCount,
    };
  }, [routeState]);
  const hasResumeCounts = resumeCounts !== null;
  const [muted, setMuted] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(mode === "video");
  const [callTipsDismissed, setCallTipsDismissed] = useState(false);
  const [leavingScreen, setLeavingScreen] = useState(false);
  const [joinedMemberIds, setJoinedMemberIds] = useState<string[]>([]);
  // 走查新一轮 R3：原 useState lazy init 一刀切用 `new Date().toISOString()`，
  // 但「resume call」流（桌面端打开通话邀请 → 通过 hash routeState 传
  // recordedAt 给手机端继续 / 手机端切前后台 resume 等）走 routeState.recordedAt
  // 才是真正的发起时间。原版下方 init useEffect 在 membersQuery loaded 之后
  // 才会用 routeState.recordedAt 覆盖 startedAt——慢网下 membersQuery 公网
  // 隧道 ~600ms 内，顶部「发起时间」CallMetricCard 显示 "now"，之后跳到真正
  // 的 recordedAt（往往是几分钟甚至几十分钟前）。用户肉眼可见的时间跳变。
  // useState 的 lazy initializer 在 mount 期同步跑，且 routeState 在前面已经
  // 计算好，可以直接复用——避免这次 flash。
  const [startedAt, setStartedAt] = useState(
    () =>
      routeState?.recordedAt ??
      routeState?.snapshotRecordedAt ??
      new Date().toISOString(),
  );
  const [lastPublishedCounts, setLastPublishedCounts] = useState<{
    activeCount: number;
    totalCount: number;
  } | null>(null);
  const panelOpenedReportedRef = useRef(false);
  const initializedSessionKeyRef = useRef<string | null>(null);
  // 同步防双击锁——下面 handleBack 和 handleEndCall 都用 `if (leavingScreen)
  // return;` 当 guard，但 leavingScreen 是 React state，setLeavingScreen 要
  // 等 commit 才生效，同帧内连点 2 次结束/返回按钮会同时通过 guard，两份
  // sendGroupMessage("ended") + 两个 navigate 同时出去。第二份消息会被服务端
  // 接受，群里出现 2 条"通话已结束"系统提示。ref 同步赋值不走 React render。
  const leavingScreenRef = useRef(false);
  // 同步防双击锁——「同步最新状态」按钮 `disabled={syncStatusMutation.isPending}`
  // 兜底；isPending 是 React state，同帧连点 2 次 → 两份 sendGroupMessage("ongoing")
  // 同时投到群里，群通话状态卡片连刷 2 条一模一样的"成员席位已变动"系统消息。
  // auto-fire effect (line ~365) 也调 syncCurrentStatus，但走 panelOpenedReportedRef
  // / hasSyncedStatus 自己的 dedup，不会跟这个 ref 冲突。
  const syncStatusBusyRef = useRef(false);
  // 走查 R4：handleEndCall 想要在结束之前等当前 in-flight 的 sync 落地（避免两条
  // sendGroupMessage 同时投到群里出现"已结束 + 画面进行中"顺序乱），但 mutateAsync
  // 不暴露 in-flight 的 promise；这里把每次 syncCurrentStatus 的 mutateAsync 句柄
  // 留下，end 之前 await 它（不在乎结果，吞 reject 防 unhandledrejection）。
  const inFlightSyncPromiseRef = useRef<Promise<unknown> | null>(null);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, resolvedGroupId],
    queryFn: () => getGroup(resolvedGroupId, baseUrl),
    enabled: Boolean(resolvedGroupId),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, resolvedGroupId],
    queryFn: () => getGroupMembers(resolvedGroupId, baseUrl),
    enabled: Boolean(resolvedGroupId),
  });

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const callSessionKey = useMemo(
    () =>
      JSON.stringify({
        activeCount: routeState?.activeCount ?? null,
        groupId: resolvedGroupId,
        mode,
        recordedAt:
          routeState?.recordedAt ?? routeState?.snapshotRecordedAt ?? null,
        source: routeState?.source ?? "mobile",
        totalCount: routeState?.totalCount ?? null,
      }),
    [
      mode,
      resolvedGroupId,
      routeState?.activeCount,
      routeState?.recordedAt,
      routeState?.snapshotRecordedAt,
      routeState?.source,
      routeState?.totalCount,
    ],
  );
  // 走查本会话 R1：原版 activeMembers 算的是整张 filtered 数组，但下方只读
  // .length 当 activeCount 用，从不消费数组。members.filter + includes 在每个
  // joinedMemberIds 变化（用户点切换席位）或 members 变化（成员加入/移除）的
  // re-render 上跑 O(N·M)；改成 Set 化 joinedMemberIds 后 reduce 计数，O(N+M)
  // 一次，避免每次 re-render 都新建一个 throwaway array 喂 useMemo cache。
  const activeCount = useMemo(() => {
    if (!members.length || !joinedMemberIds.length) {
      return 0;
    }
    const joinedSet = new Set(joinedMemberIds);
    let count = 0;
    for (const member of members) {
      if (joinedSet.has(member.memberId)) {
        count += 1;
      }
    }
    return count;
  }, [joinedMemberIds, members]);
  const visibleMembers = useMemo(() => members.slice(0, 10), [members]);
  // 走查 R1：成员席位列表 render 里每个 button 用 joinedMemberIds.includes()
  // 做 O(N) 查找。visibleMembers 上限 10 所以 worst-case O(N·10) 不痛，
  // 但 joinedMemberIds 变化（每点一次切换席位都会）会触发整段重新跑一次
  // includes，提前 Set 化更便宜，也跟上面 activeMembers 的 joinedSet 优化对齐。
  const joinedMemberIdSet = useMemo(
    () => new Set(joinedMemberIds),
    [joinedMemberIds],
  );
  // 走查 新 R1：原版直接在 JSX 里 `members.map(m=>m.memberId)` 喂 GroupAvatarChip，
  // 每次 render（成员加入/离开、syncCurrentStatus 1200ms timer 触发、activeCount
  // 变化等）都 new 一个 array → GroupAvatarChip 拿到新 prop 引用、重新算 hashSeed
  // × 4 + 重新挂 4 个 <img>。memberIds 改 useMemo 锁住引用，群成员稳定时
  // GroupAvatarChip 完全跳过重渲染。
  const memberIdsForAvatar = useMemo(
    () => members.map((member) => member.memberId),
    [members],
  );
  const totalCount = members.length;
  const waitingCount = Math.max(totalCount - activeCount, 0);
  const groupName = groupQuery.data?.name || t(msg`群聊`);
  const callTitle =
    mode === "voice" ? t(msg`群语音通话`) : t(msg`群视频通话`);
  const statusTitle = getGroupCallStatusLabel(mode, "ongoing");
  const hasSyncedStatus =
    lastPublishedCounts?.activeCount === activeCount &&
    lastPublishedCounts?.totalCount === totalCount;

  useEffect(() => {
    if (!resolvedGroupId || membersQuery.isLoading) {
      return;
    }

    // 走查 Round 1：handleEndCall 先 setLeavingScreen(true) + leavingScreenRef
    // → 再 navigate 到 /group/$id 把 hash 清掉。组件还没 unmount 那一帧里
    // routeState 已经回 null（无 hash）→ callSessionKey 变 → init effect 再走
    // 一次 body → panelOpenedReportedRef 被按 hasResumeCounts=false 重置；
    // 下方 panel-opened effect 紧接着 fire syncCurrentStatus → 群里冒一条
    // stray "画面进行中" 紧跟在 "已结束" 后头。leavingScreen 真值时
    // handleEndCall 已经接管离屏流程，init 不该再重置任何 ref / state。
    if (leavingScreenRef.current || leavingScreen) {
      return;
    }

    if (initializedSessionKeyRef.current === callSessionKey) {
      return;
    }

    initializedSessionKeyRef.current = callSessionKey;
    setMuted(false);
    setSpeakerEnabled(true);
    setCameraEnabled(mode === "video");
    leavingScreenRef.current = false;
    setLeavingScreen(false);
    setStartedAt(
      routeState?.recordedAt ??
        routeState?.snapshotRecordedAt ??
        new Date().toISOString(),
    );
    setCallTipsDismissed(hasResumeCounts);
    setLastPublishedCounts(resumeCounts);
    panelOpenedReportedRef.current = hasResumeCounts;
    setJoinedMemberIds(
      buildInitialJoinedMemberIds(members, routeState?.activeCount ?? null),
    );
  }, [
    callSessionKey,
    hasResumeCounts,
    leavingScreen,
    members,
    membersQuery.isLoading,
    mode,
    resolvedGroupId,
    resumeCounts,
    routeState,
  ]);

  useEffect(() => {
    if (!members.length) {
      return;
    }

    const memberIds = new Set(members.map((member) => member.memberId));
    const mandatoryJoinedIds = members
      .filter(
        (member) => member.memberType === "user" || member.role === "owner",
      )
      .map((member) => member.memberId);

    setJoinedMemberIds((current) => {
      const next = current.filter((memberId) => memberIds.has(memberId));
      let changed = next.length !== current.length;

      for (const memberId of mandatoryJoinedIds) {
        if (next.includes(memberId)) {
          continue;
        }

        next.push(memberId);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [members]);

  // perf：以前同时 invalidate app-group-messages 和 app-conversations，每次
  // sync / end 群通话状态都触发整个群消息列表 GET 重拉（公网隧道 ~600ms RTT
  // × N=60 条）。改用 setQueriesData 把刚发出去的群通话状态消息直接合并
  // 进 cache（跟 socket onChatMessage echo 走同一个 upsertServerMessageInCache）
  // 省一次 GET；conversations cache 仍要 invalidate 让消息列表的最近会话
  // lastMessage / lastActivityAt 同步。
  const mergeCallMessageIntoCache = useCallback(
    (message: GroupMessage) => {
      queryClient.setQueriesData<GroupMessage[]>(
        { queryKey: ["app-group-messages", baseUrl, resolvedGroupId] },
        (current) => upsertServerMessageInCache(current, message),
      );
    },
    [baseUrl, queryClient, resolvedGroupId],
  );
  // 本会话 R1：原版 await queryClient.invalidateQueries 会让 syncStatusMutation
  // / endStatusMutation 的 onSuccess 直到 conversations refetch 完才 resolve
  // (~600ms 公网隧道 RTT)；上面 handleEndCall await mutateAsync 后才 navigate
  // 离屏，"挂断"按钮 → 等 600ms → 才跳回 thread。fire-and-forget 即可：
  // mergeCallMessageIntoCache 已经把通话状态消息同步进 cache，conversations
  // 的 lastMessage / lastActivityAt 慢一帧更新不影响功能。
  const invalidateConversationsCache = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["app-conversations", baseUrl],
    });
  }, [baseUrl, queryClient]);

  const syncStatusMutation = useMutation({
    mutationFn: (counts: { activeCount: number; totalCount: number }) =>
      sendGroupMessage(
        resolvedGroupId,
        {
          text: buildGroupCallInviteMessage(
            mode,
            groupName,
            counts,
            "ongoing",
            undefined,
            effectiveSource,
          ),
        },
        baseUrl,
      ),
    onSuccess: async (message, counts) => {
      setLastPublishedCounts(counts);
      mergeCallMessageIntoCache(message);
      invalidateConversationsCache();
    },
  });

  const endStatusMutation = useMutation({
    mutationFn: (counts: {
      activeCount: number;
      totalCount: number;
      durationMs: number;
      startedAt: string;
    }) =>
      sendGroupMessage(
        resolvedGroupId,
        {
          text: buildGroupCallInviteMessage(
            mode,
            groupName,
            counts,
            "ended",
            undefined,
            effectiveSource,
            undefined,
            counts.durationMs,
            counts.startedAt,
          ),
        },
        baseUrl,
      ),
    onSuccess: async (message) => {
      setLastPublishedCounts(null);
      mergeCallMessageIntoCache(message);
      invalidateConversationsCache();
    },
  });

  const syncCurrentStatus = useCallback(async () => {
    if (!resolvedGroupId || !groupQuery.data || !totalCount) {
      return;
    }
    // 走查新一轮 R1：「同步最新状态」按钮 inline onClick (line ~1150) 没像
    // handleRetrySyncStatus / panel-opened effect / 1200ms deferred effect
    // 那样守 leavingScreen——同帧先点「同步最新状态」紧接着点「结束通话」时，
    // handleEndCall 把 leavingScreenRef.current 翻 true 那一瞬已经晚于
    // syncCurrentStatus 内部 syncStatusBusyRef = true，sync 的 mutateAsync
    // 已经 in-flight。两份 sendGroupMessage 同时投出（一份 ongoing 一份
    // ended），公网隧道 RTT 下顺序不定，可能 ongoing 后到 → 群里"已结束"
    // 后面紧跟一条 stray"画面进行中"，跟 R2 修过的 init-effect-reseed 是
    // 同一类问题。把守 leavingScreen 沉到 syncCurrentStatus 入口，任何
    // caller 漏守都兜底。
    if (leavingScreenRef.current) {
      return;
    }
    if (syncStatusBusyRef.current) {
      return;
    }
    syncStatusBusyRef.current = true;
    try {
      const pendingSync = syncStatusMutation.mutateAsync({
        activeCount,
        totalCount,
      });
      inFlightSyncPromiseRef.current = pendingSync.catch(() => undefined);
      await pendingSync;
    } catch {
      // 走查 R2：syncCurrentStatus 在 panel-opened effect / 1200ms deferred
      // effect / "重试同步状态" / "同步最新状态" 按钮四条路径上都被 `void
      // syncCurrentStatus()` fire-and-forget 触发。mutateAsync rejection 没人
      // 接 → window.unhandledrejection 污染 telemetry。错误状态本身已经通过
      // syncStatusMutation.error 在面板上挂出 danger notice + "重试同步状态"
      // 按钮（line ~984），业务上不需要 await rejection。和姊妹文件
      // group-chat-thread-panel.tsx submitOutgoingGroupMessage Round 4 同款修法。
    } finally {
      syncStatusBusyRef.current = false;
      inFlightSyncPromiseRef.current = null;
    }
  }, [
    activeCount,
    groupQuery.data,
    resolvedGroupId,
    syncStatusMutation,
    totalCount,
  ]);

  useEffect(() => {
    if (
      !resolvedGroupId ||
      !groupQuery.data ||
      membersQuery.isLoading ||
      isDesktopLayout ||
      panelOpenedReportedRef.current ||
      // 同 init effect：handleEndCall 触发离屏流程后 panelOpenedReportedRef
      // 万一被某条 stale render 拨回 false，这里再加一道防线，避免 fire
      // 一条 stray syncCurrentStatus → "画面进行中"。
      leavingScreenRef.current ||
      leavingScreen
    ) {
      return;
    }

    panelOpenedReportedRef.current = true;
    void syncCurrentStatus();
  }, [
    groupQuery.data,
    isDesktopLayout,
    leavingScreen,
    membersQuery.isLoading,
    resolvedGroupId,
    syncCurrentStatus,
  ]);

  useEffect(() => {
    if (
      !panelOpenedReportedRef.current ||
      !resolvedGroupId ||
      !groupQuery.data ||
      !totalCount ||
      syncStatusMutation.isPending ||
      syncStatusMutation.isError ||
      hasSyncedStatus ||
      // 走查 Round 1：handleEndCall 触发 endStatusMutation.onSuccess 会把
      // lastPublishedCounts 置 null → hasSyncedStatus 翻成 false → 这条
      // deferred sync effect 重新调度 1200ms 定时器。await invalidateQueries
      // + navigate() 的等待 + 父级 chat-room 切回 group-thread 的 unmount
      // 链路可能慢于 1200ms（数据库 wal 落盘 + conversations cache 重建），
      // 导致定时器在 unmount 前 fire 一次 syncCurrentStatus，群里冒出
      // 已结束/画面进行中 紧挨的两条系统消息。leavingScreen 真值时直接跳过。
      leavingScreen
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void syncCurrentStatus();
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeCount,
    groupQuery.data,
    hasSyncedStatus,
    leavingScreen,
    resolvedGroupId,
    syncCurrentStatus,
    syncStatusMutation.isError,
    syncStatusMutation.isPending,
    totalCount,
  ]);

  const handleBack = () => {
    if (leavingScreenRef.current || leavingScreen) {
      return;
    }

    leavingScreenRef.current = true;
    setLeavingScreen(true);
    if (isDesktopLayout) {
      void navigate({
        to: desktopThreadPath,
        replace: true,
      });
      return;
    }

    void navigate({
      to: "/group/$groupId",
      params: { groupId: resolvedGroupId },
      ...(groupRouteHash ? { hash: groupRouteHash } : {}),
      replace: true,
    });
  };

  // 走查 R1：3 个错误态分支 (groupQuery 失败 / membersQuery 失败 / groupQuery.data
  // 为 null) 的「重试读取」按钮原本都裸跑 onClick={handleRetryLoad}，按钮自身
  // 也没 disabled 守护——慢网下用户对着 ErrorBlock 多点 2-3 次重试，每次同时
  // 触发 groupQuery + membersQuery 两条 refetch，公网隧道 ~600ms RTT × 4-6 条
  // 同时飞，后端短时压力翻倍。useQuery 内部对同一 queryKey 的并发 refetch 会
  // dedup，但 isFetching=true 时 refetch() 不会被复用而是仍然排队再发一次。
  // 进入前先看 isFetching；下方按钮 disabled 同步收口，让用户视觉上知道在转。
  const handleRetryLoad = () => {
    if (groupQuery.isFetching || membersQuery.isFetching) {
      return;
    }
    void groupQuery.refetch();
    void membersQuery.refetch();
  };
  const retryLoadDisabled = groupQuery.isFetching || membersQuery.isFetching;

  const renderBackToGroupAction = () => (
    <InlineNoticeActionButton
      label={t(msg`返回群聊`)}
      className="border-current/28 bg-white/12 active:bg-white/16"
      onClick={handleBack}
    />
  );

  const handleEndCall = async () => {
    if (leavingScreenRef.current || leavingScreen) {
      return;
    }
    // 走查 R4：syncCurrentStatus 在 line ~413 入口检查 leavingScreenRef，但 sync
    // 的 mutateAsync 已经 in-flight 时 setLeavingScreen(true) 阻止不了它——sync
    // 已经把 "ongoing" payload 排队飞出去。同帧用户先点「同步最新状态」紧接着
    // 点「结束通话」（公网隧道 ~600ms RTT 下窗口很大），两条 sendGroupMessage
    // 同时投到群里，群成员看到 "已结束" 后面紧跟一条 stray "画面进行中"，
    // 与 R2 修过的 init-effect-reseed 是同一类问题。end 之前等当前 in-flight
    // 的 sync promise 落地，让两条系统消息顺序确定（先 ongoing 再 ended）；
    // 直接复用同一个 mutateAsync 句柄，不再额外起一份 sendGroupMessage。
    // 下方 end 按钮 disabled 同步把 syncStatusMutation.isPending 串进去给
    // 用户视觉反馈。
    const pendingSync = inFlightSyncPromiseRef.current;
    if (pendingSync) {
      await pendingSync;
      // 走查新一轮 R1：用户在 syncStatusMutation 飞行中连点 2 次「结束通话」
      // —— 入口 leavingScreenRef 检查是 await 之前做的，两次 click 同时
      // 看到 ref=false，都 await 同一个 pendingSync。await 落地后 Call 1
      // 继续把 ref 翻 true、发 endStatusMutation；Call 2 没有 await 后
      // 的 re-check，照样进 endStatusMutation —— 群里冒出 2 条相同
      // 「群通话已结束」。disabled 跑的是 isPending state，commit 前
      // 双 click 都通过。重新读 ref 再次 guard，第二次 call 在这里 noop。
      if (leavingScreenRef.current || leavingScreen) {
        return;
      }
    }

    leavingScreenRef.current = true;
    setLeavingScreen(true);
    if (!resolvedGroupId || !groupQuery.data || !totalCount) {
      void navigate({
        to: "/group/$groupId",
        params: { groupId: resolvedGroupId },
        ...(groupRouteHash ? { hash: groupRouteHash } : {}),
        replace: true,
      });
      return;
    }

    const durationMs = Math.max(Date.now() - new Date(startedAt).getTime(), 0);
    try {
      await endStatusMutation.mutateAsync({
        activeCount,
        totalCount,
        durationMs,
        startedAt,
      });
      void navigate({
        to: "/group/$groupId",
        params: { groupId: resolvedGroupId },
        search:
          buildChatCallReturnSearch({
            kind: mode,
          }) || undefined,
        ...(groupRouteHash ? { hash: groupRouteHash } : {}),
        replace: true,
      });
    } catch {
      leavingScreenRef.current = false;
      setLeavingScreen(false);
    }
  };

  const toggleJoinedState = (memberId: string) => {
    setCallTipsDismissed(true);
    if (syncStatusMutation.isError) {
      syncStatusMutation.reset();
    }
    setJoinedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((item) => item !== memberId)
        : [...current, memberId],
    );
  };

  const handleRetrySyncStatus = () => {
    if (leavingScreen) {
      return;
    }

    setCallTipsDismissed(true);
    syncStatusMutation.reset();
    void syncCurrentStatus();
  };

  const handleContinueAfterSyncError = () => {
    syncStatusMutation.reset();
  };

  const handleRetryEndCall = () => {
    if (leavingScreen) {
      return;
    }

    endStatusMutation.reset();
    void handleEndCall();
  };

  const handleContinueAfterEndError = () => {
    endStatusMutation.reset();
  };

  if (groupQuery.isLoading || membersQuery.isLoading) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <LoadingBlock label={t(msg`正在连接...`)} />
        ) : (
          <MobileCallStatusCard
            title={t(msg`正在连接...`)}
            tone="loading"
          />
        )}
      </AppPage>
    );
  }

  if (groupQuery.isError && groupQuery.error instanceof Error) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <ErrorBlock message={describeRequestError(groupQuery.error)} />
        ) : (
          <MobileCallStatusCard
            badge={t(msg`群聊`)}
            title={t(msg`群通话暂时不可用`)}
            description={describeRequestError(groupQuery.error)}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <MobileCallActionButton
                  onClick={handleRetryLoad}
                  disabled={retryLoadDisabled}
                  className="min-w-[132px]"
                >
                  {retryLoadDisabled ? t(msg`正在重试...`) : t(msg`重试读取`)}
                </MobileCallActionButton>
                <MobileCallActionButton
                  onClick={handleBack}
                  className="min-w-[132px]"
                >
                  {t(msg`返回群聊`)}
                </MobileCallActionButton>
              </div>
            }
          />
        )}
      </AppPage>
    );
  }

  if (membersQuery.isError && membersQuery.error instanceof Error) {
    return (
      <AppPage
        className={cn(
          "min-h-full px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <ErrorBlock message={describeRequestError(membersQuery.error)} />
        ) : (
          <MobileCallStatusCard
            badge={t(msg`成员`)}
            title={t(msg`成员信息暂时不可用`)}
            description={describeRequestError(membersQuery.error)}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <MobileCallActionButton
                  onClick={handleRetryLoad}
                  disabled={retryLoadDisabled}
                  className="min-w-[132px]"
                >
                  {retryLoadDisabled ? t(msg`正在重试...`) : t(msg`重试读取`)}
                </MobileCallActionButton>
                <MobileCallActionButton
                  onClick={handleBack}
                  className="min-w-[132px]"
                >
                  {t(msg`返回群聊`)}
                </MobileCallActionButton>
              </div>
            }
          />
        )}
      </AppPage>
    );
  }

  if (!groupQuery.data) {
    return (
      <AppPage
        className={cn(
          "min-h-full space-y-4 px-4 py-6",
          isDesktopLayout ? "bg-[#f3f3f3]" : "bg-[#111827] text-white",
        )}
      >
        {isDesktopLayout ? (
          <>
            <ErrorBlock message={t(msg`当前群聊不存在，暂时无法发起群通话。`)} />
            <Button
              variant="secondary"
              onClick={handleBack}
              className={cn(
                isDesktopLayout
                  ? "rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
                  : "rounded-full",
              )}
            >
              {t(msg`返回群聊`)}
            </Button>
          </>
        ) : (
          <MobileCallStatusCard
            badge={t(msg`群聊`)}
            title={t(msg`当前不能发起群通话`)}
            description={t(msg`这个群聊暂时不可用，可以先重试读取，或返回群聊后再试。`)}
            tone="danger"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <MobileCallActionButton
                  onClick={handleRetryLoad}
                  disabled={retryLoadDisabled}
                  className="min-w-[132px]"
                >
                  {retryLoadDisabled ? t(msg`正在重试...`) : t(msg`重试读取`)}
                </MobileCallActionButton>
                <MobileCallActionButton
                  onClick={handleBack}
                  className="min-w-[132px]"
                >
                  {t(msg`返回群聊`)}
                </MobileCallActionButton>
              </div>
            }
          />
        )}
      </AppPage>
    );
  }

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full bg-[#f3f3f3] px-0 py-0">
        <div className="flex min-h-full flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-black/6 bg-[#f7f7f7] px-6 py-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-black/6 bg-white text-[color:var(--text-primary)] transition hover:bg-[#efefef]"
                aria-label={t(msg`返回群聊`)}
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                  {callTitle}
                </div>
                <div className="mt-1 text-[18px] font-medium text-[color:var(--text-primary)]">
                  {groupName}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  {t(msg`桌面端通话入口已收口到聊天顶部工具栏。`)}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleBack}
              className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
            >
              {t(msg`返回群聊`)}
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <div className="w-full max-w-[760px] rounded-[18px] border border-black/6 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <div className="rounded-full bg-[rgba(15,23,42,0.05)] px-3 py-1 text-[11px] tracking-[0.12em] text-[color:var(--text-dim)] inline-flex">
                {t(msg`桌面通话工作区`)}
              </div>
              <div className="mt-5 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(7,193,96,0.10)] text-[#1f8f4f]">
                  {mode === "video" ? <Camera size={24} /> : <Mic size={24} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[20px] font-medium text-[color:var(--text-primary)]">
                    {mode === "video"
                      ? t(msg`桌面端请从聊天页继续发起群视频`)
                      : t(msg`桌面端请从聊天页继续发起群语音`)}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    {t(msg`这个独立页面主要给手机端通话用。桌面端已经改成在群聊页里直接打开通话，这样成员列表、聊天记录和侧栏信息会保持在同一窗口里。`)}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                    {t(msg`当前群聊`)}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {groupName}
                  </div>
                </div>
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                    {t(msg`通话类型`)}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {mode === "video"
                      ? t(msg`群视频通话`)
                      : t(msg`群语音通话`)}
                  </div>
                </div>
                <div className="rounded-[12px] border border-black/6 bg-[#fafafa] px-4 py-4">
                  <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                    {t(msg`成员规模`)}
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                    {t(msg`${totalCount} 位成员`)}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <InlineNotice tone="info">
                  {t(msg`回到群聊页后，继续使用顶部通话按钮即可进入桌面群通话控制台。`)}
                </InlineNotice>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleBack}
                  className="rounded-[10px] bg-[#07c160] text-white hover:bg-[#06ad56]"
                >
                  <Users size={16} />
                  {t(msg`返回群聊继续`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigate({
                      to: "/tabs/chat",
                      ...(desktopDetailsHash
                        ? { hash: desktopDetailsHash }
                        : {}),
                    });
                  }}
                  className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
                >
                  {t(msg`查看群聊信息`)}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage className="flex min-h-[100dvh] flex-col space-y-0 bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_32%),linear-gradient(180deg,#111827_0%,#0f172a_40%,#020617_100%)] px-0 py-0 text-white">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[rgba(2,6,23,0.72)] px-3 pb-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={leavingScreen}
            className={mobileCallIconButtonClass()}
            aria-label={t(msg`返回群聊`)}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-medium">{callTitle}</div>
            <div className="mt-0.5 truncate text-[12px] text-white/60">
              {groupName}
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-3.5">
        <section className="rounded-[28px] border border-white/8 bg-[rgba(15,23,42,0.76)] px-4 py-4.5 shadow-[0_24px_60px_rgba(2,6,23,0.34)]">
          <div className="flex items-center gap-4">
            <GroupAvatarChip
              name={groupName}
              members={memberIdsForAvatar}
              size="wechat"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[22px] font-semibold tracking-[0.01em]">
                {groupName}
              </div>
              <div className="mt-1 text-sm text-white/64">{statusTitle}</div>
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2.5">
            <CallMetricCard
              label={t(msg`在线`)}
              value={t(msg`${activeCount} 人`)}
            />
            <CallMetricCard
              label={t(msg`等待`)}
              value={t(msg`${waitingCount} 人`)}
            />
            <CallMetricCard
              label={t(msg`发起时间`)}
              value={formatDetailedMessageTimestamp(startedAt)}
            />
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2">
            <CallControlButton
              active={!muted}
              disabled={leavingScreen}
              label={muted ? t(msg`取消静音`) : t(msg`静音`)}
              icon={muted ? <Mic size={16} /> : <MicOff size={16} />}
              onClick={() => {
                setCallTipsDismissed(true);
                setMuted((current) => !current);
              }}
            />
            <CallControlButton
              active={speakerEnabled}
              disabled={leavingScreen}
              label={speakerEnabled ? t(msg`关闭免提`) : t(msg`免提`)}
              icon={<Volume2 size={16} />}
              onClick={() => {
                setCallTipsDismissed(true);
                setSpeakerEnabled((current) => !current);
              }}
            />
            {mode === "video" ? (
              <CallControlButton
                active={cameraEnabled}
                disabled={leavingScreen}
                label={cameraEnabled ? t(msg`关闭摄像头`) : t(msg`打开摄像头`)}
                icon={
                  cameraEnabled ? <VideoOff size={16} /> : <Camera size={16} />
                }
                onClick={() => {
                  setCallTipsDismissed(true);
                  setCameraEnabled((current) => !current);
                }}
              />
            ) : null}
          </div>
        </section>

        <div className="mt-3.5 space-y-2.5">
          {syncStatusMutation.error instanceof Error ? (
            // 走查 2026-05-22 移动端群聊 R1：和姊妹 group-chat-thread-panel
            // R67（commit 9a8c5f...）一批 ErrorBlock 同款 a11y 修法——这条
            // 是用户点「同步在席」失败时的唯一可视错误反馈（旁边按钮也只是
            // 重试/继续，不带语义播报），裸 InlineNotice 内部仅 <div>，盲人
            // SR 在群语音通话页失败时只能看到"沉默"。role="alert" 自带
            // aria-live="assertive"，立刻读出 describeRequestError 内容。
            <MobileCallNotice
              role="alert"
              tone="danger"
              className="flex items-center justify-between gap-3"
            >
              <span>{describeRequestError(syncStatusMutation.error)}</span>
              {renderBackToGroupAction()}
            </MobileCallNotice>
          ) : null}
          {syncStatusMutation.error instanceof Error ? (
            <div className="flex flex-wrap gap-2">
              <MobileCallActionButton
                onClick={handleRetrySyncStatus}
                disabled={leavingScreen}
              >
                <Users size={16} />
                {t(msg`重试`)}
              </MobileCallActionButton>
              <MobileCallActionButton
                onClick={handleContinueAfterSyncError}
                disabled={leavingScreen}
              >
                <Mic size={16} />
                {t(msg`继续`)}
              </MobileCallActionButton>
            </div>
          ) : null}
          {endStatusMutation.error instanceof Error ? (
            // 走查 2026-05-22 R1：同 syncStatusMutation 错误条 a11y 修法。
            // 这条是用户点「结束通话」失败时的反馈，盲人 SR 听不到「结束
            // 失败，请重试」会以为通话已经结束转身离开，结果通话还在线
            // → 计费/在席状态不同步。
            <MobileCallNotice
              role="alert"
              tone="danger"
              className="flex items-center justify-between gap-3"
            >
              <span>{t(msg`结束失败，请重试`)}</span>
              {renderBackToGroupAction()}
            </MobileCallNotice>
          ) : null}
          {endStatusMutation.error instanceof Error ? (
            <div className="flex flex-wrap gap-2">
              <MobileCallActionButton
                onClick={handleRetryEndCall}
                disabled={leavingScreen}
              >
                <PhoneOff size={16} />
                {t(msg`重试`)}
              </MobileCallActionButton>
              <MobileCallActionButton
                onClick={handleContinueAfterEndError}
                disabled={leavingScreen}
              >
                <Users size={16} />
                {t(msg`保留当前状态`)}
              </MobileCallActionButton>
            </div>
          ) : null}
          {leavingScreen ? (
            <MobileCallNotice tone="info">
              {t(msg`通话结束中...`)}
            </MobileCallNotice>
          ) : null}
        </div>

        <section className="mt-3.5 min-h-0 flex-1 rounded-[28px] border border-white/8 bg-[rgba(15,23,42,0.76)] px-4 py-4 shadow-[0_24px_60px_rgba(2,6,23,0.34)]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-white">{t(msg`成员`)}</div>
            <MobileCallMetaChip>
              {t(msg`${activeCount}/${totalCount} 已加入`)}
            </MobileCallMetaChip>
          </div>

          <div className="mt-3.5 grid gap-2.5">
            {visibleMembers.map((member) => {
              const joined = joinedMemberIdSet.has(member.memberId);
              const roleLabel =
                member.role === "owner"
                  ? t(msg`群主`)
                  : member.role === "admin"
                    ? t(msg`管理员`)
                    : t(msg`群成员`);

              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleJoinedState(member.memberId)}
                  disabled={leavingScreen || member.memberType === "user"}
                  className={cn(
                    "rounded-[18px] border px-3.5 py-2.5 text-left transition",
                    joined
                      ? "border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.10)]"
                      : "border-white/12 bg-white/6",
                    member.memberType === "user"
                      ? "cursor-default"
                      : "active:bg-white/12",
                    leavingScreen ? "opacity-60" : null,
                  )}
                >
                  <div className="flex items-center gap-3">
                    <AvatarChip
                      name={member.memberName || member.memberId}
                      src={member.memberAvatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-[13px] font-medium text-white">
                          {member.memberName || member.memberId}
                        </div>
                        <MobileCallMetaChip className="px-2 py-0.5 text-[10px] text-white/64">
                          {roleLabel}
                        </MobileCallMetaChip>
                      </div>
                      <div className="mt-0.5 text-[11px] leading-[18px] text-white/52">
                        {member.memberType === "user"
                          ? t(msg`始终在线`)
                          : joined
                            ? t(msg`已加入`)
                            : t(msg`点击加入`)}
                      </div>
                    </div>
                    <MobileCallMetaChip
                      tone={joined ? "success" : "default"}
                      className={cn(
                        "shrink-0 px-2.5 py-1 text-[10px] font-medium",
                        joined ? null : "text-white/58",
                      )}
                    >
                      {joined ? t(msg`已加入`) : t(msg`待加入`)}
                    </MobileCallMetaChip>
                  </div>
                </button>
              );
            })}
          </div>

          {members.length > visibleMembers.length ? (
            <div className="mt-3 text-center text-[12px] text-white/50">
              {t(msg`其余 ${members.length - visibleMembers.length} 位成员请到群聊详情管理`)}
            </div>
          ) : null}
        </section>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <MobileCallActionButton
            onClick={() => {
              setCallTipsDismissed(true);
              syncStatusMutation.reset();
              void syncCurrentStatus();
            }}
            disabled={syncStatusMutation.isPending || !totalCount || leavingScreen}
            className="h-12 w-full min-w-0"
          >
            <Users size={16} />
            {syncStatusMutation.isPending
              ? t(msg`同步中...`)
              : hasSyncedStatus
                ? t(msg`已同步`)
                : t(msg`同步状态`)}
          </MobileCallActionButton>
          <MobileCallActionButton
            tone="danger"
            onClick={() => {
              void handleEndCall();
            }}
            // 走查 R4：sync 进行中先视觉 disable end 按钮，避免 sync 的 ~600ms
            // RTT 窗口内用户连点 end → 两条 sendGroupMessage 抢路。handleEndCall
            // 入口仍会 await 已在 in-flight 的 sync promise，双重保险。
            disabled={
              endStatusMutation.isPending ||
              syncStatusMutation.isPending ||
              leavingScreen
            }
            className="h-12 w-full min-w-0"
          >
            <PhoneOff size={16} />
            {leavingScreen || endStatusMutation.isPending
              ? t(msg`结束中...`)
              : syncStatusMutation.isPending
                ? t(msg`等待同步...`)
                : t(msg`结束通话`)}
          </MobileCallActionButton>
        </div>
      </div>
    </AppPage>
  );
}

function buildInitialJoinedMemberIds(
  members: Array<{
    memberId: string;
    memberType: string;
    role: string;
  }>,
  activeCount?: number | null,
) {
  const joinedMembers = members
    .filter(
      (member) => member.memberType === "user" || member.role === "owner",
    )
    .map((member) => member.memberId);
  const normalizedTargetCount =
    activeCount === null || activeCount === undefined
      ? Math.max(joinedMembers.length, Math.min(members.length, 3))
      : Math.max(joinedMembers.length, Math.min(activeCount, members.length));

  for (const member of members) {
    if (joinedMembers.includes(member.memberId)) {
      continue;
    }

    if (joinedMembers.length >= normalizedTargetCount) {
      break;
    }

    joinedMembers.push(member.memberId);
  }

  return Array.from(new Set(joinedMembers));
}

function MobileCallStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "mx-auto flex max-w-[26rem] flex-col items-center rounded-[28px] border px-5 py-6 text-center shadow-[0_24px_64px_rgba(2,6,23,0.28)]",
        tone === "danger"
          ? "border-[#f87171]/24 bg-[linear-gradient(180deg,rgba(127,29,29,0.34),rgba(69,10,10,0.3))] text-white"
          : "border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.88))] text-white",
      )}
    >
      {badge ? (
        <div
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.12em]",
            tone === "danger"
              ? "bg-[#ef4444]/14 text-[#fecaca]"
              : "bg-[#34d399]/12 text-[#bbf7d0]",
          )}
        >
          {badge}
        </div>
      ) : null}
      {tone === "loading" ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/24" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white/36 [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#86efac] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-3 text-[18px] font-medium leading-7">{title}</div>
      {description ? (
        <p className="mt-2 max-w-[18rem] text-[13px] leading-6 text-white/68">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </section>
  );
}

function MobileCallNotice({
  tone = "info",
  className,
  ...props
}: ComponentProps<typeof InlineNotice>) {
  return (
    <InlineNotice
      tone={tone}
      className={cn(
        "rounded-[20px] px-4 py-3 text-[12px] leading-6 shadow-none",
        tone === "warning"
          ? "border-[#f59e0b]/24 bg-[#f59e0b]/10 text-[#fde68a]"
          : tone === "danger"
            ? "border-[#f87171]/24 bg-[#ef4444]/10 text-[#fecaca]"
            : tone === "success"
              ? "border-[#34d399]/24 bg-[#34d399]/10 text-[#d1fae5]"
              : "border-white/12 bg-white/8 text-white/74",
        className,
      )}
      {...props}
    />
  );
}

function MobileCallMetaChip({
  tone = "default",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "default" | "success" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-[11px]",
        tone === "success"
          ? "border-[#34d399]/24 bg-[#34d399]/14 text-[#bbf7d0]"
          : "border-white/10 bg-white/8 text-white/72",
        className,
      )}
      {...props}
    />
  );
}

function MobileCallActionButton({
  tone = "default",
  className,
  ...props
}: ComponentProps<"button"> & { tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 min-w-[148px] items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition active:translate-y-[0.5px] disabled:opacity-45",
        tone === "danger"
          ? "border-[#fca5a5]/26 bg-[#ef4444]/14 text-[#fecaca] active:bg-[#ef4444]/20"
          : "border-white/12 bg-white/10 text-white active:bg-white/14",
        className,
      )}
      {...props}
    />
  );
}

function mobileCallIconButtonClass() {
  return "flex h-10 w-10 items-center justify-center rounded-[14px] border border-white/10 bg-white/8 text-white/82 transition active:bg-white/12 disabled:opacity-55";
}

function CallMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/12 bg-white/6 px-3 py-3">
      <div className="text-[11px] tracking-[0.12em] text-white/45">{label}</div>
      <div className="mt-2 text-sm font-medium text-white">{value}</div>
      {detail ? (
        <div className="mt-1 text-[11px] leading-5 text-white/54">{detail}</div>
      ) : null}
    </div>
  );
}

function CallControlButton({
  active,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full border px-4.5 text-[13px] font-medium transition active:translate-y-[0.5px] disabled:opacity-55",
        active
          ? "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.14)] text-[#bbf7d0]"
          : "border-white/10 bg-white/8 text-white/74 active:bg-white/12",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
