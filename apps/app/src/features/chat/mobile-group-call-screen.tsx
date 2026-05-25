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
  type CallFinalizeEndedReason,
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
  VolumeX,
} from "lucide-react";
import { describeRequestError } from "../../lib/request-error";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";
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
import { parseMobileGroupCallRouteHash } from "./mobile-group-call-route-state";
import { buildChatCallReturnSearch } from "./chat-compose-shortcut-route";
import { useGroupVoiceCallSession } from "./use-group-voice-call-session";
import {
  CallStatusLine,
  CallTimer,
  WeChatCallControlBar,
  WeChatCallControlButton,
  WeChatCallShell,
  WeChatCallToast,
  WeChatCallToastAction,
  WeChatCallTopBar,
  WeChatGroupCallGrid,
  WeChatGroupCallTile,
} from "./wechat-call";

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
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(mode === "video");
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
  const totalCount = members.length;
  const groupName = groupQuery.data?.name || t(msg`群聊`);
  const callTitle =
    mode === "voice" ? t(msg`群语音通话`) : t(msg`群视频通话`);

  // 走查 R3：useCallFinalize 10 分钟兜底 timer 触发 hangup("timeout") 后会调
  // onSessionEnded(reason)；原版没传，10min 自动结束后群里写了一条
  // "📞 通话时长 10:00" call_log 卡片但通话屏不离屏 + 群通话状态卡片仍停在
  // "ongoing"（因为 endStatusMutation 没被触发）。用户回头看群只看到 call_log，
  // 通话状态卡片永远停留在"画面进行中"，下次他从群顶部点通话按钮还会以为
  // 通话还在线。用 ref 持后置 handler，让 onSessionEnded 走 endStatusMutation
  // + navigate 兜底路径。inline 直接 capture 闭包要写更长 deps 链；ref 模式
  // 让 voiceCall 创建时不必关心后面 endStatusMutation 还没声明的 TDZ 问题。
  const handleVoiceCallAutoEndRef = useRef<
    (reason: CallFinalizeEndedReason) => void
  >(() => {});
  // 群语音通话：录音 → 群 voice-call turn → 顺序播多角色 AI 回话；视频模式暂不接
  // 走查 R2：enabled 原本只看 mode/resolvedGroupId，但 groupQuery/membersQuery 加载
  // 这 600ms 公网 RTT 期内 VAD loop 已经 arm → speech.start() → 弹麦克风权限。如果
  // groupQuery 失败 (group 不存在 / 403)，整个错误兜底视图都展开了，麦克风还在转。
  // 等 group 数据落地 + 至少一名成员（buildInitialJoinedMemberIds 依赖）再 enable。
  const voiceCall = useGroupVoiceCallSession({
    baseUrl,
    groupId: resolvedGroupId,
    enabled:
      mode === "voice" &&
      !isDesktopLayout &&
      Boolean(resolvedGroupId) &&
      Boolean(groupQuery.data) &&
      members.length > 0,
    leaving: leavingScreen,
    participantCount: totalCount || undefined,
    onSessionEnded: (reason) => handleVoiceCallAutoEndRef.current(reason),
  });
  const voiceActiveSpeakerId = voiceCall.activeSpeakerId;
  const voiceCallSpeechError = voiceCall.speech.error;
  const voiceCallTurnError = voiceCall.turnMutation.error;
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
    setSpeakerEnabled(true);
    setCameraEnabled(mode === "video");
    leavingScreenRef.current = false;
    setLeavingScreen(false);
    setStartedAt(
      routeState?.recordedAt ??
        routeState?.snapshotRecordedAt ??
        new Date().toISOString(),
    );
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

  // 走查 R3：useGroupVoiceCallSession 10 分钟超时兜底回调。原版通话 timeout 后
  // 只写了 call_log，群通话状态卡片仍停在"画面进行中"。这里复刻 handleEndCall
  // 关键收尾：endStatusMutation 把状态卡片切成"已结束"，再 navigate 回群聊页。
  // 不 await endStatusMutation —— navigate 在公网 RTT ~600ms 下不能因为
  // sendGroupMessage 卡住；mutation 内部 onSuccess 会 merge cache 进群消息列表。
  // R5 走查：超时正好赶上 syncStatusMutation 在 in-flight 时，end 抢先到群里
  // 会导致 "已结束" 紧跟一条 stray "画面进行中"，与 handleEndCall (line ~617)
  // 同源问题。这里 fire-and-forget 也要先 await inFlightSyncPromiseRef，让两条
  // 系统消息至少按 ongoing→ended 顺序落库；await 在 navigate 之前完成，navigate
  // 在 await 之后才发起，公网慢链路下"挂断按钮"无可视反应的问题不存在（这是
  // 后台 timer 自动触发，用户没在按按钮）。
  handleVoiceCallAutoEndRef.current = (reason) => {
    if (leavingScreenRef.current) {
      return;
    }
    // 走查新一轮 R5：原版只接 timeout —— useCallFinalize R4 兜底在浏览器/iOS
    // swipe back 时也会发 hangup("user_hangup")，触发 onSessionEnded("user_hangup")
    // 经过这条回调。如果这里仍只匹配 timeout，群"画面进行中"状态卡片永远不会
    // 被翻成"已结束"，下次群成员进群以为还在通话（call_log 卡片已经被
    // useCallFinalize 自己的 finalizeGroupVoiceCall 写过，但 sendGroupMessage
    // "ended" 系统状态卡是另一条消息，只有这里能发）。
    // 明面入口（handleEndCall）已经先把 leavingScreenRef 翻 true → 上面那条
    // guard 早 return，这里加 user_hangup 分支不会重复写。
    if (reason !== "timeout" && reason !== "user_hangup") {
      return;
    }
    leavingScreenRef.current = true;
    setLeavingScreen(true);
    // 走查 R3：和 handleEndCall (line ~696) 对齐，先停 mic/audio。原版只
    // setLeavingScreen + 进 finishAutoEnd（异步等 pendingSync 落地），但
    // voiceCall.audio 仍在播，且 onSuccess R1 leavingRef 守门是 mutation 完成后
    // 才触发——已经 in-flight 的播放队列要靠 stopReplyPlayback 主动截断；
    // cancelRecordingTurn 是和 voice loop reconcile 的 cancelRecordingTurn 重复
    // 但幂等，提早跑省一帧。
    voiceCall.cancelRecordingTurn();
    voiceCall.stopReplyPlayback();

    const finishAutoEnd = () => {
      if (resolvedGroupId && groupQuery.data && totalCount) {
        const durationMs = Math.max(
          Date.now() - new Date(startedAt).getTime(),
          0,
        );
        void endStatusMutation
          .mutateAsync({ activeCount, totalCount, durationMs, startedAt })
          .catch(() => undefined);
      }

      // 走查新一轮 R6：user_hangup 走 R4 unmount 兜底路径——浏览器/iOS swipe
      // back 已经把路由 history.back 切走，组件正在 unmount。再 navigate 会和
      // history.back 撞车（router 把刚回退到的群聊页再 replace 一遍，URL 抖动、
      // 多 tab 历史栈循环）。timeout 是后台 timer 主动触发，用户还在群通话屏，
      // 必须显式 navigate 回群聊页。两条路径分流。
      if (reason === "user_hangup") {
        return;
      }

      if (isDesktopLayout) {
        void navigate({
          to: desktopThreadPath,
          replace: true,
        });
      } else {
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
      }
    };

    const pendingSync = inFlightSyncPromiseRef.current;
    if (pendingSync) {
      void pendingSync.then(finishAutoEnd, finishAutoEnd);
    } else {
      finishAutoEnd();
    }
  };

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

  // 走查 R1：原 handleBack 只 setLeavingScreen + navigate，跳过 voiceCall.hangup
  // / endStatusMutation / 停录 / 停播 / cancelFallback timer 全部收尾——用户点顶栏
  // "返回群聊"或下面 Android Back 拦截走这里，结果：
  //   1) 群里"画面进行中"系统卡片永远不变"已结束"，下次进群成员以为还在通话
  //   2) finalize HTTP 不发 → 群消息列表没有"📞 通话时长 mm:ss"call_log
  //   3) audio 节点正在播 AI 回复时直接 navigate，~200ms 残音 + media stream 在
  //      unmount 链路真正跑完前继续占麦
  // 单聊（mobile-ai-call-screen）的 handleBack 早就走的就是 hangup→ended 通知→
  // navigate 一条龙；群聊这里没有"后台通话"概念（unmount=call 终止），minimize
  // 语义上就是 end，复用 handleEndCall 让两个入口（顶栏返回 + Android Back）行为
  // 一致。原版仅在 isDesktopLayout 分支裸 navigate 是 desktop redirect shell 兜底，
  // 该路径不需要写 call_log（desktop 没真正在跑通话）。
  const handleBack = () => {
    if (leavingScreenRef.current || leavingScreen) {
      return;
    }
    if (isDesktopLayout) {
      leavingScreenRef.current = true;
      setLeavingScreen(true);
      void navigate({
        to: desktopThreadPath,
        replace: true,
      });
      return;
    }
    void handleEndCall();
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
      // call_log 卡片：和单聊同款，挂断时让系统在群里写一条「📞 通话时长 mm:ss」
      // 系统消息，使群聊记录直观看出"刚结束一通通话"。voiceCall.hangup 内部去重，
      // timeout / hangup 同时触发只会写一次。
      // fire-and-forget：hangup 内部已 try/catch 吞掉 finalize 失败，await 它
      // 只是让公网 5xx 慢链路把 navigation 拖死。组件 unmount 后闭包仍能跑完。
      if (mode === "voice") {
        void voiceCall.hangup("user_hangup");
      }
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

    syncStatusMutation.reset();
    void syncCurrentStatus();
  };

  // 走查 R1：和姊妹 mobile-ai-call-screen 一样接 Android 硬件 Back 拦截。
  // 用户按物理 Back → 默认走 history.back()，直接绕过 handleBack 兜底链路：
  //   - voiceCall.hangup 不发 → 群消息列表没"📞 通话时长"call_log
  //   - endStatusMutation 不发 → 群通话状态卡片永远停在"画面进行中"
  //   - VAD/recorder 在 React unmount 链路真正跑完前继续占麦/解码
  // handleBack 闭包持稳定身份（声明顺序晚于 handleEndCall），这里只 wrap 一层
  // event.preventDefault + 调 handleBack。leavingScreen 期间不挂拦截器，
  // 让用户能正常退出 leaving 卡死的兜底界面。
  useEffect(() => {
    if (isDesktopLayout || leavingScreen) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      handleBack();
      return true;
    });
    return unregister;
    // handleBack 闭包 deps 链长（endStatusMutation/voiceCall/navigate/...），
    // 拿当前渲染版本就够 —— leavingScreenRef 已经保证幂等。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktopLayout, leavingScreen]);

  const handleRetryEndCall = () => {
    if (leavingScreen) {
      return;
    }

    endStatusMutation.reset();
    void handleEndCall();
  };

  // 群语音通话 VAD 出错（录音/网络）后清干净，让连续监听循环重新起录
  const handleRetryGroupVoiceTurn = () => {
    if (leavingScreen) {
      return;
    }
    voiceCall.cancelRecordingTurn();
    voiceCall.stopReplyPlayback();
    voiceCall.turnMutation.reset();
    voiceCall.speech.clearResult();
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

  // 微信式群通话状态（VAD loop 仅 voice 模式生效）
  const micMuted = voiceCall.voiceLoop.micMuted;
  const setMicMuted = voiceCall.voiceLoop.setMicMuted;
  // 走查 R1：原版「免提」按钮只 toggle 本地 speakerEnabled state，从未挂到
  // voiceCall.setAudioMuted —— 用户点关闭 AI 群成员仍在响。voice 模式下委托
  // 给 session 的 audioMuted（已经 wire 到 audio.muted），video 模式仍保留
  // 本地 state stub（video 还没接通话）。
  const speakerOn =
    mode === "voice" ? !voiceCall.audioMuted : speakerEnabled;
  const toggleSpeaker =
    mode === "voice"
      ? () => voiceCall.setAudioMuted((current) => !current)
      : () => setSpeakerEnabled((current) => !current);
  const groupCallStatusLine =
    mode === "voice"
      ? voiceCall.voiceLoop.phase === "listening"
        ? t(msg`正在聆听…`)
        : voiceCall.voiceLoop.phase === "thinking"
          ? t(msg`成员正在回复…`)
          : voiceCall.voiceLoop.phase === "speaking"
            ? t(msg`成员正在说话…`)
            : ""
      : "";
  const startedAtMs = new Date(startedAt).getTime();

  let groupCallToast: ReactNode = null;
  if (!leavingScreen) {
    if (syncStatusMutation.error instanceof Error) {
      groupCallToast = (
        <WeChatCallToast
          tone="danger"
          message={describeRequestError(syncStatusMutation.error)}
          action={
            <WeChatCallToastAction
              label={t(msg`重试`)}
              onClick={handleRetrySyncStatus}
            />
          }
        />
      );
    } else if (endStatusMutation.error instanceof Error) {
      groupCallToast = (
        <WeChatCallToast
          tone="danger"
          message={t(msg`结束失败，请重试`)}
          action={
            <WeChatCallToastAction
              label={t(msg`重试`)}
              onClick={handleRetryEndCall}
            />
          }
        />
      );
    } else if (mode === "voice" && voiceCallSpeechError) {
      groupCallToast = (
        <WeChatCallToast
          tone="danger"
          message={voiceCallSpeechError}
          action={
            <WeChatCallToastAction
              label={t(msg`重试`)}
              onClick={handleRetryGroupVoiceTurn}
            />
          }
        />
      );
    } else if (mode === "voice" && voiceCallTurnError instanceof Error) {
      groupCallToast = (
        <WeChatCallToast
          tone="danger"
          message={t(msg`网络不稳定，请重试`)}
          action={
            <WeChatCallToastAction
              label={t(msg`重试`)}
              onClick={handleRetryGroupVoiceTurn}
            />
          }
        />
      );
    } else if (mode === "voice" && voiceCall.playerError) {
      groupCallToast = (
        <WeChatCallToast
          tone="info"
          message={t(msg`没有自动播报，点一下补播`)}
          action={
            <WeChatCallToastAction
              label={t(msg`补播`)}
              onClick={() => {
                void voiceCall.replayLastTurn();
              }}
            />
          }
        />
      );
    }
  }

  return (
    <WeChatCallShell
      topBar={
        <WeChatCallTopBar
          onMinimize={handleBack}
          minimizeLabel={t(msg`返回群聊`)}
          centerTitle={callTitle}
          centerSubtitle={t(msg`${activeCount}/${totalCount} 已加入`)}
        />
      }
      controls={
        <WeChatCallControlBar>
          <WeChatCallControlButton
            icon={speakerOn ? <Volume2 size={24} /> : <VolumeX size={24} />}
            label={t(msg`免提`)}
            variant={speakerOn ? "active" : "default"}
            onClick={toggleSpeaker}
            disabled={leavingScreen}
          />
          <WeChatCallControlButton
            icon={<PhoneOff size={26} />}
            label={
              leavingScreen || endStatusMutation.isPending
                ? t(msg`结束中...`)
                : t(msg`挂断`)
            }
            variant="danger"
            size="lg"
            onClick={() => {
              void handleEndCall();
            }}
            disabled={
              endStatusMutation.isPending ||
              syncStatusMutation.isPending ||
              leavingScreen
            }
          />
          <WeChatCallControlButton
            icon={micMuted ? <MicOff size={24} /> : <Mic size={24} />}
            label={micMuted ? t(msg`取消静音`) : t(msg`静音`)}
            variant={micMuted ? "active" : "default"}
            onClick={() => setMicMuted((current) => !current)}
            disabled={leavingScreen}
          />
          {mode === "video" ? (
            <WeChatCallControlButton
              icon={
                cameraEnabled ? <VideoOff size={24} /> : <Camera size={24} />
              }
              label={cameraEnabled ? t(msg`关闭摄像头`) : t(msg`打开摄像头`)}
              variant={cameraEnabled ? "active" : "default"}
              onClick={() => setCameraEnabled((current) => !current)}
              disabled={leavingScreen}
            />
          ) : null}
        </WeChatCallControlBar>
      }
      stage={
        <div className="flex w-full max-w-[420px] flex-col items-center">
          <CallTimer
            startedAtMs={startedAtMs}
            running
            waitingLabel={callTitle}
          />
          <CallStatusLine className="mt-1.5" text={groupCallStatusLine} />
          <WeChatGroupCallGrid className="mt-7 w-full">
            {visibleMembers.map((member) => (
              <WeChatGroupCallTile
                key={member.id}
                name={member.memberName || member.memberId}
                avatar={member.memberAvatar}
                joined={joinedMemberIdSet.has(member.memberId)}
                isActiveSpeaker={
                  mode === "voice" &&
                  voiceActiveSpeakerId === member.memberId
                }
                disabled={leavingScreen || member.memberType === "user"}
                onToggle={() => toggleJoinedState(member.memberId)}
              />
            ))}
          </WeChatGroupCallGrid>
          {members.length > visibleMembers.length ? (
            <div className="mt-5 text-center text-[12px] text-white/50">
              {t(msg`其余 ${members.length - visibleMembers.length} 位成员请到群聊详情管理`)}
            </div>
          ) : null}
        </div>
      }
    >
      <audio ref={voiceCall.audioRef} preload="auto" className="hidden" />
      {groupCallToast}
    </WeChatCallShell>
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
      // 走查新会话 R1：和姊妹 R1 MobileCallNotice tone="danger" 同款 a11y 修法
      // ——本 status card 是 groupQuery / membersQuery / 群不存在 三条错误路径的
      // 主体视觉（line ~705/744/796）：整页 AppPage 被它替代，旁边没有任何兜底
      // 内容。tone="danger" 时盲人 SR 进入"群通话暂时不可用"/"成员信息暂时不可用"
      // /"当前不能发起群通话"页面只能听到一个静默 "section"，连 badge/title 都
      // 不读（role="region" 隐式生效靠 aria-labelledby，section 当前没挂）。
      // role="alert" 自带 aria-live="assertive"，立刻读出 title + description，
      // 让用户知道"为什么页面是空的"。tone="loading"（"正在连接..."）改 role=
      // "status" aria-live="polite"，避免抢断 SR 当前朗读。
      role={
        tone === "danger" ? "alert" : tone === "loading" ? "status" : undefined
      }
      aria-live={
        tone === "danger" ? "assertive" : tone === "loading" ? "polite" : undefined
      }
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

