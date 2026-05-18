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
  useEffect(() => {
    setMuted(false);
    setCameraEnabled(kind === "video");
    setSpeakerEnabled(true);
    setStartedAt(new Date().toISOString());
    setPanelOpenedReported(false);
    setJoinedMemberIds(buildInitialJoinedMemberIds(members));
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
  useEffect(() => {
    setJoinedMemberIds((current) => {
      const memberIdSet = new Set(members.map((member) => member.memberId));
      const next = current.filter((id) => memberIdSet.has(id));
      return next.length === current.length ? current : next;
    });
  }, [members]);

  const activeMembers = useMemo(
    () => members.filter((member) => joinedMemberIds.includes(member.memberId)),
    [joinedMemberIds, members],
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
  const callKindLabel = kind === "voice" ? t(msg`群语音`) : t(msg`群视频`);
  const activeCount = activeMembers.length;
  const waitingCount = Math.max(members.length - activeCount, 0);
  const hasSyncedStatus =
    lastSyncedCounts?.activeCount === activeCount &&
    lastSyncedCounts?.totalCount === members.length;
  const workspaceSummaryLines = buildGroupCallWorkspaceSummaryLines({
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
  });

  useEffect(() => {
    if (panelOpenedReported) {
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
  const attemptedSyncCountsRef = useRef<{
    activeCount: number;
    totalCount: number;
  } | null>(null);
  useEffect(() => {
    if (inviteNoticePending || endNoticePending || hasSyncedStatus) {
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
      onSendInviteNotice({
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
    onSendInviteNotice,
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

  return (
    <section className="flex h-full min-h-0 gap-4 rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)] p-5 shadow-[var(--shadow-card)]">
      <div className="flex min-w-0 flex-[1.08] flex-col rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-[color:var(--brand-primary)]">
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
            detail={t(msg`已加入当前桌面通话工作台`)}
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

          <div className="mt-4">
            <div className="space-y-3">
              {workspaceSummaryLines.map((line) => (
                <InlineNotice key={line} tone="info">
                  {line}
                </InlineNotice>
              ))}
            </div>
          </div>
          {!hasSyncedStatus ? (
            <div className="mt-3">
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
            onClick={() =>
              onSendInviteNotice({
                activeCount,
                totalCount: members.length,
              })
            }
            disabled={inviteNoticePending}
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
            onClick={onOpenMobileHandoff}
            className="rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] shadow-none hover:bg-white hover:text-[color:var(--text-primary)]"
          >
            <Smartphone size={16} />
            {t(msg`到手机继续`)}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onEndCall({
                activeCount,
                totalCount: members.length,
                durationMs: Math.max(
                  Date.now() - new Date(startedAt).getTime(),
                  0,
                ),
                startedAt,
              })
            }
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
          <div className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
            {t(msg`${activeCount}/${members.length} 已加入`)}
          </div>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 gap-3 overflow-auto sm:grid-cols-2">
          {visibleMembers.map((member) => {
            const joined = joinedMemberIds.includes(member.memberId);
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
                onClick={() => toggleJoinedState(member)}
                disabled={member.memberType === "user"}
                className={cn(
                  "rounded-[12px] border px-4 py-4 text-left transition",
                  joined
                    ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[var(--shadow-soft)]"
                    : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
                  member.memberType === "user"
                    ? "cursor-default"
                    : "",
                )}
              >
                <div className="flex items-center gap-3">
                  <AvatarChip
                    name={member.memberName ?? member.memberId}
                    src={member.memberAvatar}
                    size="wechat"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {member.memberName ?? member.memberId}
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
                        ? "bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
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
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-[10px] border px-4 text-sm transition",
        active
          ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
          : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
