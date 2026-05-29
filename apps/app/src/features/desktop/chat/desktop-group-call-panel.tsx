import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import type { GroupMember } from "@yinjie/contracts";
import {
  Mic,
  MicOff,
  PhoneOff,
  Smartphone,
  UserPlus,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import type { DesktopChatCallKind } from "./desktop-chat-header-actions";
import { formatDetailedMessageTimestamp } from "../../../lib/format";
import { buildGroupCallWorkspaceSummaryLines } from "../../chat/group-call-presentation";

type DesktopGroupCallPanelProps = {
  kind: DesktopChatCallKind;
  groupId: string;
  groupName: string;
  members: GroupMember[];
  lastSyncedCounts?: {
    activeCount: number;
    totalCount: number;
  } | null;
  inviteNoticePending?: boolean;
  endNoticePending?: boolean;
  onClose: () => void;
  onPanelOpened?: (counts: {
    activeCount: number;
    totalCount: number;
  }) => Promise<void> | void;
  onOpenMobileHandoff: () => void;
  onSendInviteNotice: (counts: {
    activeCount: number;
    totalCount: number;
  }) => void;
  onEndCall: (counts: {
    activeCount: number;
    totalCount: number;
    durationMs: number;
    startedAt: string;
  }) => void;
};

export function DesktopGroupCallPanel({
  kind,
  groupId,
  groupName,
  members,
  lastSyncedCounts = null,
  inviteNoticePending = false,
  endNoticePending = false,
  onClose,
  onPanelOpened,
  onOpenMobileHandoff,
  onSendInviteNotice,
  onEndCall,
}: DesktopGroupCallPanelProps) {
  const t = useRuntimeTranslator();
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(kind === "video");
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());
  const [panelOpenedReported, setPanelOpenedReported] = useState(false);
  const [joinedMemberIds, setJoinedMemberIds] = useState<string[]>(() =>
    buildInitialJoinedMemberIds(members),
  );

  // 仅在群/通话类型切换时重置全部本地状态。原来把 `members` 列进 deps，
  // 但 members 是 useQuery 的数组：每次 refetch 都换新引用（即便数据一样），
  // 用户点了「拉某成员下线」之后下一次 30s 轮询会把 joinedMemberIds 全部
  // 重置回初始集，操作消失。改成只在 groupId/kind 变更时重置。
  //
  // 走查电脑端群聊 R1：原版只在 [groupId, kind] 切换时 seed joinedMemberIds，
  // useState 初始化也吃 props.members。如果用户切到新群后立刻点群通话按钮
  // （public 隧道下 membersQuery ~600ms RTT 仍在飞），members 还是空数组——
  // useState 给 []、本 effect 也 setJoinedMemberIds([])，ref 永远停在空集；
  // members 真到达后下方 [members] effect 走的是"只修剪"路径，不再补 seed。
  // 结果：通话面板顶部一直显示 "0/N 已加入"、workspaceSummary 跟着空着、
  // hasSyncedStatus 永远不可能命中正确 active counts（lastPublishedCallCounts
  // 起步 0/N，但实际从来没 broadcast 出去对的 counts，autoSync 1200ms 试一次
  // 0/N 后被 attemptedSyncCountsRef 锁住），用户看不到任何成员加入态。改用
  // ref 区分"已经用非空 members 完成首轮 seed"——首次拿到非空 members 时
  // 自动补一次 seed，之后再 refetch 走"只修剪"。
  useEffect(() => {
    setMuted(false);
    setCameraEnabled(kind === "video");
    setSpeakerEnabled(true);
    setStartedAt(new Date().toISOString());
    setPanelOpenedReported(false);
    setJoinedMemberIds(buildInitialJoinedMemberIds(members));
    hasSeededJoinedMembersRef.current = members.length > 0;
    // 走查 Round 7 配套：切群/切通话类型也要清掉"已尝试过 counts"的记忆，
    // 否则上一组 counts 卡住下一组的首次自动同步。
    attemptedSyncCountsRef.current = null;
    // members 故意不进 deps：仅 groupId/kind 切换时初始化一次；后续 members
    // refetch 不能踩用户已有的 join/leave 状态。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, kind]);

  // members refetch 时只「修剪」已不存在的成员，避免引用变化但内容相同时
  // 把用户已有的 join/leave 切换被覆盖。新成员不会自动 join——保持初始
  // owner/user/前 3 个的启发式只在群/通话切换时生效。
  //
  // 走查电脑端群聊 R1 配套：未做过首轮 seed（mount 时 members 为空）时，
  // members 首次到达要补 seed —— 否则 joinedMemberIds 永远空，所有"已加入"
  // 元数据皆 0。
  const hasSeededJoinedMembersRef = useRef(members.length > 0);
  useEffect(() => {
    if (!members.length) {
      return;
    }
    if (!hasSeededJoinedMembersRef.current) {
      hasSeededJoinedMembersRef.current = true;
      setJoinedMemberIds(buildInitialJoinedMemberIds(members));
      return;
    }
    setJoinedMemberIds((current) => {
      const memberIdSet = new Set(members.map((member) => member.memberId));
      const next = current.filter((id) => memberIdSet.has(id));
      return next.length === current.length ? current : next;
    });
  }, [members]);

  // 走查电脑端群聊 R79：原版 activeMembers / 下方席位渲染 .map 内
  // joinedMemberIds.includes(member.memberId) 都是 O(K) 线性扫——8 个 visible
  // members × K（最多 50）= 400 次比较 / render；activeMembers useMemo deps
  // 含 joinedMemberIds 引用，每次 toggleJoinedState 翻新数组就重算 filter
  // 也是 O(N·K)。本面板 re-render 触发源多（mic / camera / speaker 三个
  // toggle / startedAt 翻转 / members 30s 轮询 / 1200ms auto-sync 内的
  // setQueriesData 透传也会让 joinedMemberIds 引用变化触发整段重算）。
  // 提一份 Set；activeMembers / 下方席位 button 复用，O(1) 查询。
  const joinedMemberIdSet = useMemo(
    () => new Set(joinedMemberIds),
    [joinedMemberIds],
  );
  const activeMembers = useMemo(
    () => members.filter((member) => joinedMemberIdSet.has(member.memberId)),
    [joinedMemberIdSet, members],
  );
  const visibleMembers = useMemo(() => members.slice(0, 8), [members]);
  // 走查 R4：和 mobile-group-call-screen commit 948078bb2 同款问题——下面
  // GroupAvatarChip 接收的 members={members.map(m=>m.memberId)} 原本写在 JSX
  // 里，每次 render（toggleJoinedState、setStartedAt、1200ms attempted-sync
  // useEffect 触发、members 30s 轮询 refetch 等）都 new 一份 array →
  // GroupAvatarChip 拿到新 prop 引用、重新算 hashSeed × 4 + 重新挂 4 个 <img>。
  // useMemo 锁住引用，群成员稳定时 chip 跳过重渲染。
  const memberIdsForAvatar = useMemo(
    () => members.map((member) => member.memberId),
    [members],
  );
  // 走查电脑端群聊 R81：和姊妹 DesktopGroupMemberBrowserDialog R73（commit
  // 8fdc9c0d9）同款 perf——下方 visibleMembers.map 内每行 `member.role === "owner"
  // ? t(msg`群主`) : member.role === "admin" ? t(msg`管理员`) : t(msg`群成员`)`
  // 3 个静态 t() 调用，8 个 visible tile × 3 = 24 次 translateRuntimeMessage
  // Map 查表 / render。本面板 re-render 触发源多（mic/camera/speaker toggle /
  // joinedMemberIdSet 切换 / 1200ms auto-sync / members 30s 轮询透传 /
  // setLastPublishedCallCounts 后父级回流），每次都跑同 24 次。useMemo 锁
  // t deps，locale 切换才重建。
  const roleLabels = useMemo(
    () => ({
      owner: t(msg`群主`),
      admin: t(msg`管理员`),
      member: t(msg`群成员`),
    }),
    [t],
  );
  const callKindLabel = kind === "voice" ? t(msg`群语音`) : t(msg`群视频`);
  const activeCount = activeMembers.length;
  const waitingCount = Math.max(members.length - activeCount, 0);
  const hasSyncedStatus =
    lastSyncedCounts?.activeCount === activeCount &&
    lastSyncedCounts?.totalCount === members.length;
  // 走查电脑端群聊 R79：原版每次 render 都跑 buildGroupCallWorkspaceSummaryLines
  // —— 函数内部 2-4 路 translateRuntimeMessage Map 查表 + 字符串拼接，本面板
  // re-render 频繁（mic/camera/speaker toggle / 1200ms auto-sync effect /
  // members 30s 轮询透传 / setLastPublishedCallCounts 后父级回流），每次都
  // 重做相同字符串。useMemo 让 kind/activeCount/totalCount/waitingCount 不变
  // 时直接复用旧数组——下方 .map (line ~449) 的 `key={line}` 也跟着稳定，
  // InlineNotice 不再被识别为新孩子重挂。t deps 兜 locale 切换。
  const workspaceSummaryLines = useMemo(
    () =>
      buildGroupCallWorkspaceSummaryLines({
        kind,
        status: "ongoing",
        sourceLabel: t(msg`桌面端`),
        counts: members.length
          ? {
              activeCount,
              totalCount: members.length,
              waitingCount,
            }
          : null,
      }),
    [activeCount, kind, members.length, t, waitingCount],
  );

  // 走查电脑端群聊 R2：原版 mount 时直接打 onPanelOpened，把 (activeCount=0,
  // totalCount=0) 报给 parent → parent sendCallInviteMutation 立刻发一条
  // "ongoing 0/0 已加入" 群消息出去。R1 路径下 members 公网 RTT ~600ms 还在
  // 飞时这条 0/0 已经投出，群里所有真实用户先看到"x 在群通话 0/0 已加入"
  // 这种奇怪状态——auto-sync 1200ms 后才把 M/N 的正确状态发上来，第二条卡片
  // 把 0/0 卡片覆盖，但群消息流里那条 0/0 残留。门控 members.length，等真有
  // 数据再 broadcast。reported flag 同步推迟到真发出时翻 true。
  useEffect(() => {
    if (panelOpenedReported) {
      return;
    }

    if (!members.length) {
      return;
    }

    setPanelOpenedReported(true);
    void onPanelOpened?.({
      activeCount,
      totalCount: members.length,
    });
  }, [activeCount, members.length, onPanelOpened, panelOpenedReported]);

  // 走查 Round 7：原版 auto-sync 撞失败 retry-storm — 1200ms 触发
  // onSendInviteNotice → parent mutateAsync 失败 → lastPublishedCallCounts
  // 不更新 → hasSyncedStatus 仍 false → 下个 render 这个 effect 重新跑、再
  // 拉 1200ms 定时器 → 每 1200ms 重发一条 "进行中" 邀请，群被 spam 一堆
  // 重复 ongoing 卡片。用 ref 记录"本组 counts 已经尝试过"，同 counts 不
  // 再重发；activeCount/totalCount 变了（成员加入/离开）才重新解锁。
  //
  // 走查电脑端群聊 R9（本轮新增）：parent group-chat-thread-panel 在 JSX 里
  // inline 定义 onSendInviteNotice={(counts)=>{...mutateAsync...}}（line 1691），
  // 每次 parent render 都换新函数引用。parent 在通话面板挂着的时候仍有
  // groupQuery / membersQuery / messagesQuery 周期 refetch + typing socket /
  // sendCallInviteMutation.isPending 变化等多路 re-render 触发——本 effect
  // deps 里之前列了 onSendInviteNotice，于是 parent 每渲一次 → 本 effect
  // cleanup（clearTimeout）+ re-schedule，1200ms 定时器永远在被重置；
  // hasSyncedStatus=false 的情况下，"自动把最新 counts 同步到聊天消息流"
  // 这条 path 在繁忙群里根本走不到，依赖用户手动点"同步最新状态"才能发出。
  // 用 ref 锁住最新 callback 引用，effect deps 去掉 onSendInviteNotice，
  // setTimeout 内部从 ref 取最新值——既不踩闭包过期、也不让 callback ref
  // 变化触发 cleanup。同款 onPanelOpened 因为有 panelOpenedReported state
  // gating（一旦发过就不再发），即便每 render 重跑也只 throw away，无副作用，
  // 不需要这层包装；onEndCall 是用户点击触发，根本不在 useEffect 里。
  const onSendInviteNoticeRef = useRef(onSendInviteNotice);
  useEffect(() => {
    onSendInviteNoticeRef.current = onSendInviteNotice;
  }, [onSendInviteNotice]);
  const attemptedSyncCountsRef = useRef<{
    activeCount: number;
    totalCount: number;
  } | null>(null);
  useEffect(() => {
    if (inviteNoticePending || endNoticePending || hasSyncedStatus) {
      return;
    }
    // 走查电脑端群聊 R12：和上方 panelOpenedReported effect line 172-186 同款守。
    // 原版 panelOpenedReported 已经在 R2 加了 `if (!members.length) return;`
    // 防"0/0 已加入"群消息提前出，但本 auto-sync effect 漏配——当 membersQuery
    // 错误（公网隧道短抖 / cloud token 续期窗口 / 群被服务端清空成员）members
    // 永远是空数组，hasSyncedStatus 永远 false（lastSyncedCounts=null != 0/0），
    // 1200ms 定时器无条件 fire → onSendInviteNoticeRef 走 sendCallInviteMutation
    // 发出一条 status=ongoing activeCount=0 totalCount=0 的群通话邀请消息，群
    // 里其他真实用户看到「x 在群通话 0/0 已加入」的奇怪卡片。开 panel 后用
    // 户立刻退出 / 短暂打开就关 / membersQuery 还没回 1200ms 已经到都能命中。
    // 加 members.length 守，与 panelOpenedReported 口径对齐。
    if (!members.length) {
      return;
    }
    const last = attemptedSyncCountsRef.current;
    if (
      last &&
      last.activeCount === activeCount &&
      last.totalCount === members.length
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      attemptedSyncCountsRef.current = {
        activeCount,
        totalCount: members.length,
      };
      onSendInviteNoticeRef.current({
        activeCount,
        totalCount: members.length,
      });
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeCount,
    endNoticePending,
    hasSyncedStatus,
    inviteNoticePending,
    members.length,
  ]);

  function toggleJoinedState(member: GroupMember) {
    if (member.memberType === "user") {
      return;
    }

    setJoinedMemberIds((current) =>
      current.includes(member.memberId)
        ? current.filter((item) => item !== member.memberId)
        : [...current, member.memberId],
    );
  }

  // 走查 R2：「同步最新状态」/「结束通话」两个按钮原本只靠
  // disabled={inviteNoticePending}/disabled={endNoticePending} 兜双触发，但
  // pending 是 React state 来自父级 sendCallInviteMutation.isPending，
  // 要等 commit 才进 DOM。同帧连点两次都看到 pending=false → mutateAsync
  // 飞两份 → 群里收到 2 条 "ongoing" 通知（或 2 条 "ended"）。和姊妹
  // R3 (e457a1739 — DesktopMessageAvatarPopover) 同款 sync ref 锁。
  const inviteSubmittingRef = useRef(false);
  useEffect(() => {
    if (!inviteNoticePending) {
      inviteSubmittingRef.current = false;
    }
  }, [inviteNoticePending]);
  const endSubmittingRef = useRef(false);
  useEffect(() => {
    if (!endNoticePending) {
      endSubmittingRef.current = false;
    }
  }, [endNoticePending]);

  const handleManualSync = () => {
    if (inviteNoticePending || inviteSubmittingRef.current) {
      return;
    }
    // 走查电脑端群聊 R12 配套：同手动「同步最新状态」也要守 members.length。
    // 用户点这个按钮通常是 panel 已经显示出来后，但 membersQuery 错误态下
    // panel 顶部「${activeCount}/${members.length} 已加入」徽章会显示 "0/0"，
    // 这时用户出于困惑点一下「同步最新状态」就把 0/0 ongoing 邀请打到群里。
    // 静默 no-op 比发 0/0 安全，inviteSubmittingRef 也不能锁掉用户后续重试。
    if (!members.length) {
      return;
    }
    // 走查电脑端群聊 R72：原版按钮 disabled={inviteNoticePending}，但当
    // hasSyncedStatus=true 时按钮文字变成「已同步群状态」却仍然 clickable。
    // 用户看到「已同步」字样以为这是状态展示但其实是按钮，点一下 →
    // handleManualSync 仍然走 onSendInviteNotice → parent sendCallInviteMutation
    // 发出一条完全相同 counts 的 "ongoing N/M" 群消息——群里残留一条 status=
    // ongoing 但 counts 跟上一条卡片一模一样的重复邀请，所有真实成员看到 2
    // 条相同的"x 在群通话 N/M 已加入"。auto-sync effect 的 attemptedSyncCountsRef
    // 是 effect 内独立的 gating，不挡手动 click。同 counts 已发过就早退；
    // 真有新变更（成员加入/离开）后 hasSyncedStatus 自然翻 false，按钮重新生效。
    if (hasSyncedStatus) {
      return;
    }
    inviteSubmittingRef.current = true;
    onSendInviteNotice({
      activeCount,
      totalCount: members.length,
    });
  };

  const handleEndCall = () => {
    if (endNoticePending || endSubmittingRef.current) {
      return;
    }
    endSubmittingRef.current = true;
    onEndCall({
      activeCount,
      totalCount: members.length,
      durationMs: Math.max(Date.now() - new Date(startedAt).getTime(), 0),
      startedAt,
    });
  };

  // 走查电脑端群聊（新会话）R2：和姊妹电脑端单聊 R3（commit 5fbb61838 —
  // handleDesktopCallAction / 历史记录 onOpenMessage 缺同帧双击 ref 守）
  // / R4（commit 75acaa695 — 头像 popover 4 个 navigate 按钮）同款 pattern。
  // 「到手机继续」按钮原版裸跑 `onClick={onOpenMobileHandoff}`——父级 inline
  // (group-chat-thread-panel line 1688-1698) 是 `() => void navigate({
  // to:"/desktop/mobile", hash:... })`，无任何 throttle。同帧 <16ms 双击
  // 都通过 → tanstack-router push 2 条相同 /desktop/mobile?... history 项 →
  // 用户从手机交接页返回还得多按 1 次返回；且 desktop-mobile-page mount
  // 时 spawn QR + getMobileSession 走公网 RTT ~600ms，第 2 次也会重复发出。
  // raf 解锁兜底 navigate 没真正切走的边界。「返回聊天」走 onClose（只是
  // setDesktopCallPanelState(null) state-toggle），同帧 idempotent，无需保护。
  const mobileHandoffFiredRef = useRef(false);
  const handleOpenMobileHandoff = () => {
    if (mobileHandoffFiredRef.current) return;
    mobileHandoffFiredRef.current = true;
    onOpenMobileHandoff();
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        mobileHandoffFiredRef.current = false;
      });
    }
  };

  return (
    <section className="flex h-full min-h-0 gap-4 rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)] p-5 shadow-[var(--shadow-card)]">
      <div className="flex min-w-0 flex-[1.08] flex-col rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-[color:var(--brand-primary)]">
              {kind === "voice" ? <Mic size={13} /> : <Video size={13} />}
              {callKindLabel}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <GroupAvatarChip
                name={groupName}
                members={memberIdsForAvatar}
                size="wechat"
              />
              <div className="min-w-0">
                <div className="truncate text-[22px] font-semibold text-[color:var(--text-primary)]">
                  {groupName}
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  {t(msg`已在桌面端发起 ${callKindLabel}，当前可直接管理成员状态和设备控制。`)}
                </div>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="shrink-0 rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] shadow-none hover:bg-white hover:text-[color:var(--text-primary)]"
          >
            {t(msg`返回聊天`)}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <CallMetricCard
            label={t(msg`当前在线`)}
            value={t(msg`${activeCount} 人`)}
            detail={t(msg`已加入当前桌面通话`)}
          />
          <CallMetricCard
            label={t(msg`等待加入`)}
            value={t(msg`${waitingCount} 人`)}
            detail={t(msg`可继续邀请未入会成员`)}
          />
          <CallMetricCard
            label={t(msg`发起时间`)}
            value={formatDetailedMessageTimestamp(startedAt)}
            detail={t(msg`群通话控制台已就绪`)}
          />
        </div>

        <div className="mt-5 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
          <div className="flex flex-wrap gap-3">
            <CallControlButton
              active={!muted}
              label={muted ? t(msg`解除静音`) : t(msg`静音麦克风`)}
              icon={muted ? <Mic size={16} /> : <MicOff size={16} />}
              onClick={() => setMuted((current) => !current)}
            />
            <CallControlButton
              active={speakerEnabled}
              label={speakerEnabled ? t(msg`扬声器已开`) : t(msg`开启扬声器`)}
              icon={<Volume2 size={16} />}
              onClick={() => setSpeakerEnabled((current) => !current)}
            />
            {kind === "video" ? (
              <CallControlButton
                active={cameraEnabled}
                label={cameraEnabled ? t(msg`关闭摄像头`) : t(msg`打开摄像头`)}
                icon={
                  cameraEnabled ? <VideoOff size={16} /> : <Video size={16} />
                }
                onClick={() => setCameraEnabled((current) => !current)}
              />
            ) : null}
          </div>

          {/* R43：和姊妹 R42 single-call panel 同款—— group call 面板的状态
              summary lines + 同步提示，盲人 SR 在通话中条件切换（成员加入 / 退出 /
              静音状态翻转 / 邀请待同步）时需要 audible 反馈。polite 不抢断 SR
              当前 transcript / 用户说话。 */}
          <div role="status" aria-live="polite" className="mt-4">
            <div className="space-y-3">
              {workspaceSummaryLines.map((line) => (
                <InlineNotice key={line} tone="info">
                  {line}
                </InlineNotice>
              ))}
            </div>
          </div>
          {!hasSyncedStatus ? (
            <div role="status" aria-live="polite" className="mt-3">
              <InlineNotice tone="warning">
                {inviteNoticePending
                  ? t(msg`正在把最新成员状态同步到聊天消息流。`)
                  : t(msg`成员状态刚刚有变化，系统会自动同步到聊天消息流。`)}
              </InlineNotice>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={handleManualSync}
            // 走查电脑端群聊 R72：原版只锁 inviteNoticePending；hasSyncedStatus
            // 时按钮文案翻成「已同步群状态」但仍 clickable，用户点击 → 群里
            // 冒出一条 counts 相同的重复 "ongoing N/M" 卡片。同步状态时彻底
            // 禁用让按钮真正表达"已完成"语义；handleManualSync 内也加同款守
            // 防键盘 Enter / 程序化点击绕过。
            disabled={inviteNoticePending || hasSyncedStatus}
            className="rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
          >
            <UserPlus size={16} />
            {inviteNoticePending
              ? t(msg`同步中...`)
              : hasSyncedStatus
                ? t(msg`已同步群状态`)
                : t(msg`同步最新状态`)}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleOpenMobileHandoff}
            className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] shadow-none hover:bg-white hover:text-[color:var(--text-primary)]"
          >
            <Smartphone size={16} />
            {t(msg`到手机继续`)}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleEndCall}
            disabled={endNoticePending}
            className="rounded-[10px] border-[rgba(220,38,38,0.14)] bg-[rgba(254,242,242,0.92)] text-[#d74b45] shadow-none hover:border-[rgba(220,38,38,0.2)] hover:bg-[rgba(254,226,226,0.96)]"
          >
            <PhoneOff size={16} />
            {endNoticePending ? t(msg`结束中...`) : t(msg`结束通话`)}
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-[0.92] flex-col rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`成员席位`)}
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              {t(msg`点击角色成员可切换为已加入或待加入，快速模拟群通话调度。`)}
            </div>
          </div>
          <div className="rounded-full border border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
            {t(msg`${activeCount}/${members.length} 已加入`)}
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2">
          {visibleMembers.map((member) => {
            // 走查电脑端群聊 R79 续：复用上方 joinedMemberIdSet（line ~140）
            // 替代 O(K) 的 .includes 扫——8 个 tile × K 个 joined = O(8K) 退化
            // 成 O(8) Set.has。
            const joined = joinedMemberIdSet.has(member.memberId);
            // 走查电脑端群聊 R81：复用上方 roleLabels useMemo（line ~158）
            // 替代每行 3 个 t() 直调——locale 不变 Map 查表只发生一次。
            const roleLabel =
              member.role === "owner"
                ? roleLabels.owner
                : member.role === "admin"
                  ? roleLabels.admin
                  : roleLabels.member;

            return (
              <button
                key={member.id}
                type="button"
                onClick={() => toggleJoinedState(member)}
                disabled={member.memberType === "user"}
                // 走查电脑端群聊 R13：和姊妹 CallControlButton 同款修法——成员
                // 席位 tile 是 toggle button（点击在「已加入」「待加入」之间切换
                // joinedMemberIds），原版只用绿底/灰底 + 内嵌「已加入 / 待加入」
                // 文字 chip 做视觉区分。盲人 SR 走过去只听到「${memberName} 群
                // 成员 ${roleLabel}」+ 描述行，不知道该成员当前是否已加入。补
                // aria-pressed = joined 让 SR 朗读「按下 / 未按下」。user 类型
                // 成员（世界主人）button 本身 disabled，aria-pressed 在 disabled
                // 按钮上 SR 仍朗读但配合"始终保留在通话控制台"描述行不冲突；
                // 留挂便于群里多个 user 成员（理论上可能）的边界一致。
                aria-pressed={joined}
                className={cn(
                  "rounded-[12px] border px-4 py-4 text-left transition",
                  joined
                    ? "border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] shadow-[var(--shadow-soft)]"
                    : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
                  member.memberType === "user"
                    ? "cursor-default"
                    : "",
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
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {member.memberName || member.memberId}
                      </div>
                      <span className="rounded-full border border-[color:var(--border-faint)] bg-white px-2 py-0.5 text-[10px] text-[color:var(--text-muted)]">
                        {roleLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {member.memberType === "user"
                        ? t(msg`世界主人始终保留在通话控制台`)
                        : joined
                          ? t(msg`当前已加入群通话`)
                          : t(msg`点击后可切换为已加入`)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-medium",
                      joined
                        ? "bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] text-[color:var(--brand-primary)]"
                        : "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-muted)]",
                    )}
                  >
                    {joined ? t(msg`已加入`) : t(msg`待加入`)}
                  </span>
                  {member.memberType === "character" ? (
                    <span className="text-[11px] text-[color:var(--text-dim)]">
                      {joined ? t(msg`点击设为待加入`) : t(msg`点击邀请加入`)}
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function buildInitialJoinedMemberIds(members: GroupMember[]) {
  const joinedMembers = members
    .filter(
      (member, index) =>
        member.memberType === "user" || member.role === "owner" || index < 3,
    )
    .map((member) => member.memberId);

  return Array.from(new Set(joinedMembers));
}

function CallMetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-4 shadow-[var(--shadow-soft)]">
      <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-base font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
        {detail}
      </div>
    </div>
  );
}

function CallControlButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 走查电脑端群聊 R13：和姊妹 R34 composer 桌面工具栏 toggle / R32 时间戳
      // divider toggle 同款修法——Mic/Camera/Speaker 这 3 个 control button
      // 都是按 active 表达持续状态的 toggle，原版只有绿底色 + 文案双 fallback
      //（"静音麦克风" ↔ "解除静音"）做视觉区分。盲人 SR 走过去只听到当前
      // label，但 label 文本翻转 ≠ button 的语义状态——SR 用户在群通话面板上
      // 按 Tab 浏览时不能识别"当前麦克风/扬声器/摄像头处于开还是关"。补
      // aria-pressed = active，让 SR 朗读"button 已按下/未按下"。
      aria-pressed={active}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-sm transition",
        active
          ? "border-[color-mix(in_srgb,var(--brand-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] text-[color:var(--brand-primary)]"
          : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
