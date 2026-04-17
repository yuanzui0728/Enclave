import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import type { ReplyLogicCharacterSnapshot } from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  SectionHeading,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminPageHero,
  AdminRecordCard,
  AdminValueCard as ValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { CharacterWorkspaceNav } from "../components/character-workspace-nav";

const ACTIVITY_OPTIONS = [
  { value: "", label: "未设置" },
  { value: "free", label: "空闲" },
  { value: "working", label: "工作中" },
  { value: "eating", label: "吃饭中" },
  { value: "resting", label: "休息中" },
  { value: "commuting", label: "通勤中" },
  { value: "sleeping", label: "睡觉中" },
];

export function CharacterRuntimePage() {
  const { characterId } = useParams({ from: "/characters/$characterId/runtime" });
  const baseUrl = resolveAdminCoreApiBaseUrl();

  const snapshotQuery = useQuery({
    queryKey: ["admin-reply-logic-character", baseUrl, characterId],
    queryFn: () => adminApi.getReplyLogicCharacterSnapshot(characterId),
  });


  if (snapshotQuery.isLoading) {
    return <LoadingBlock label="正在加载角色运行逻辑..." />;
  }

  if (snapshotQuery.isError && snapshotQuery.error instanceof Error) {
    return <ErrorBlock message={snapshotQuery.error.message} />;
  }

  if (!snapshotQuery.data) {
    return <ErrorBlock message="角色运行逻辑暂不可用。" />;
  }

  const snapshot = snapshotQuery.data;
  const character = snapshot.character;

  return (
    <div className="space-y-6">
      <CharacterWorkspaceNav characterId={characterId} />

      <AdminPageHero
        eyebrow="角色运行台"
        title={character.name}
        description="查看这个角色当前的运行状态、生活信息与调度记录。"
        actions={
          <>
            <Link to="/characters">
              <Button variant="secondary" size="lg">返回角色中心</Button>
            </Link>
            <Link to="/characters/$characterId/factory" params={{ characterId }}>
              <Button variant="secondary" size="lg">前往工厂</Button>
            </Link>
            <Link to="/reply-logic">
              <Button variant="secondary" size="lg">世界级调试台</Button>
            </Link>
          </>
        }
      />


      <div className="space-y-6">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>生活状态</SectionHeading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="在线模式" value={formatMode(character.onlineMode)} />
            <MetricCard label="活动模式" value={formatMode(character.activityMode)} />
            <MetricCard label="当前活动" value={formatActivity(character.currentActivity)} />
            <MetricCard label="当前在线" value={character.isOnline ? "在线" : "离线"} />
            <MetricCard label="活动频率" value={character.activityFrequency || "未设置"} />
            <MetricCard label="朋友圈频率" value={`${character.momentsFrequency} 次/天`} />
            <MetricCard label="视频号频率" value={`${character.feedFrequency} 次/周`} />
            <MetricCard
              label="活跃时段"
              value={
                character.activeHoursStart != null && character.activeHoursEnd != null
                  ? `${character.activeHoursStart}:00 – ${character.activeHoursEnd}:00`
                  : "未设置"
              }
            />
            <MetricCard
              label="触发场景"
              value={character.triggerScenes?.length ? character.triggerScenes.join("、") : "无"}
            />
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>记忆与状态</SectionHeading>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">长期记忆每周一自动更新，近期记忆每日自动更新。</p>
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium text-[color:var(--text-secondary)]">长期记忆</p>
              <pre className="whitespace-pre-wrap rounded-md bg-[color:var(--surface-inset)] p-3 text-sm text-[color:var(--text-primary)]">
                {character.profile.memory?.coreMemory || "（尚未生成）"}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[color:var(--text-secondary)]">近期记忆</p>
              <pre className="whitespace-pre-wrap rounded-md bg-[color:var(--surface-inset)] p-3 text-sm text-[color:var(--text-primary)]">
                {character.profile.memory?.recentSummary || "（尚未生成）"}
              </pre>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>回复链路快照</SectionHeading>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard label="状态门模式" value={formatGateMode(snapshot.actor.stateGate.mode)} />
              <MetricCard label="最近聊天时间" value={formatDateTime(snapshot.actor.lastChatAt)} />
              <MetricCard label="历史窗口" value={snapshot.actor.historyWindow} />
              <MetricCard label="可见消息数" value={snapshot.actor.visibleHistoryCount} />
            </div>
            {snapshot.notes.length ? (
              <div className="mt-4 space-y-2">
                {snapshot.notes.map((note) => (
                  <p key={note} className="text-sm text-[color:var(--text-muted)]">{note}</p>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>生活逻辑观测</SectionHeading>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="当前小时"
                value={`${snapshot.observability.activeWindow.currentHour}:00`}
              />
              <MetricCard
                label="是否在活跃窗"
                value={snapshot.observability.activeWindow.isWithinWindow ? "是" : "否"}
              />
              <MetricCard
                label="今日朋友圈"
                value={`${snapshot.observability.contentCadence.todayMoments} / ${snapshot.observability.contentCadence.momentsTarget}`}
              />
              <MetricCard
                label="近 7 天视频号"
                value={`${snapshot.observability.contentCadence.weeklyChannels} / ${snapshot.observability.contentCadence.channelsTarget}`}
              />
              <MetricCard
                label="触发场景数"
                value={snapshot.observability.triggerScenes.length || "无"}
              />
              <MetricCard
                label="主动提醒"
                value={snapshot.observability.memoryProactive.enabled ? "已启用" : "未启用"}
              />
            </div>
            {snapshot.observability.notes.length ? (
              <div className="mt-4 space-y-1">
                {snapshot.observability.notes.map((note) => (
                  <p key={note} className="text-sm text-[color:var(--text-muted)]">{note}</p>
                ))}
              </div>
            ) : null}
          </Card>
        </div>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>Scheduler 最近执行结果</SectionHeading>
          <div className="mt-4 space-y-3">
            {snapshot.observability.relevantJobs.map((job) => (
              <AdminRecordCard
                key={job.id}
                title={job.name}
                badges={
                  <StatusPill tone={job.running ? "warning" : "healthy"}>
                    {job.running ? "运行中" : "空闲"}
                  </StatusPill>
                }
                meta={`${job.cadence} / ${job.nextRunHint}`}
                description={job.lastResult || "当前还没有执行结果。"}
                details={
                  <div className="grid gap-3 md:grid-cols-3">
                    <ValueCard label="运行次数" value={job.runCount} />
                    <ValueCard label="最近执行" value={formatDateTime(job.lastRunAt)} />
                    <ValueCard label="耗时" value={job.lastDurationMs ? `${job.lastDurationMs} ms` : "暂无"} />
                  </div>
                }
              />
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {snapshot.observability.recentRuns.map((run) => (
              <AdminRecordCard
                key={run.id}
                title={run.jobName}
                badges={
                  <StatusPill tone={run.status === "error" ? "warning" : "healthy"}>
                    {formatSchedulerRunStatus(run.status)}
                  </StatusPill>
                }
                meta={
                  <>
                    {formatDateTime(run.startedAt)}
                    {run.durationMs ? ` · ${run.durationMs} ms` : ""}
                  </>
                }
                description={run.summary}
              />
            ))}
            {snapshot.observability.recentRuns.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">当前还没有可展示的调度执行记录。</p>
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>最近生活事件</SectionHeading>
          <div className="mt-4 space-y-3">
            {snapshot.observability.lifeEvents.map((event) => (
              <AdminRecordCard
                key={event.id}
                title={event.title}
                badges={<StatusPill tone="muted">{formatLifeEventKind(event.kind)}</StatusPill>}
                meta={
                  <>
                    {event.jobName} / {formatDateTime(event.createdAt)}
                  </>
                }
                description={event.summary}
              />
            ))}
            {snapshot.observability.lifeEvents.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">当前还没有记录到该角色的生活事件。</p>
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>上下文窗口</SectionHeading>
          <div className="mt-4 space-y-3">
            {snapshot.actor.windowMessages.map((item) => (
              <AdminRecordCard
                key={item.id}
                title={item.senderName}
                badges={
                  <>
                    <StatusPill tone={item.includedInWindow ? "healthy" : "muted"}>
                      {item.includedInWindow ? "进入窗口" : "仅可见"}
                    </StatusPill>
                    <StatusPill tone="muted">{item.type}</StatusPill>
                  </>
                }
                meta={formatDateTime(item.createdAt)}
                description={item.text}
              />
            ))}
            {snapshot.actor.windowMessages.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">当前没有上下文窗口消息。</p>
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>叙事弧线</SectionHeading>
          {snapshot.narrativeArc ? (
            <AdminRecordCard
              className="mt-4"
              title={snapshot.narrativeArc.title}
              badges={
                <>
                  <StatusPill tone={snapshot.narrativeArc.status === "completed" ? "healthy" : "warning"}>
                    {snapshot.narrativeArc.status}
                  </StatusPill>
                  <StatusPill tone="muted">{snapshot.narrativeArc.progress}%</StatusPill>
                </>
              }
              details={
                <div className="flex flex-wrap gap-2">
                  {snapshot.narrativeArc.milestones.map((item) => (
                    <StatusPill key={`${snapshot.narrativeArc?.id}-${item.label}`} tone="healthy">
                      {item.label}
                    </StatusPill>
                  ))}
                </div>
              }
            />
          ) : (
            <p className="mt-4 text-sm text-[color:var(--text-muted)]">当前还没有叙事弧线记录。</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function formatMode(value?: string | null) {
  return value === "manual" ? "人工锁定" : "自动调度";
}

function formatActivity(value?: string | null) {
  return ACTIVITY_OPTIONS.find((item) => item.value === (value ?? ""))?.label ?? "未设置";
}

function formatGateMode(mode: string) {
  switch (mode) {
    case "sleep_hint_delay":
      return "睡眠延迟";
    case "busy_hint_delay":
      return "忙碌延迟";
    case "not_applied":
      return "未应用";
    default:
      return "立即回复";
  }
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "未设置";
  }
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatSchedulerRunStatus(value: "success" | "error") {
  return value === "error" ? "失败" : "成功";
}

function formatLifeEventKind(
  value: ReplyLogicCharacterSnapshot["observability"]["lifeEvents"][number]["kind"],
) {
  switch (value) {
    case "online_status_changed":
      return "在线状态";
    case "activity_changed":
      return "活动状态";
    case "moment_posted":
      return "朋友圈";
    case "channel_posted":
      return "视频号";
    case "scene_friend_request":
      return "场景好友";
    case "proactive_message":
      return "主动提醒";
    case "relationship_updated":
      return "AI 关系";
    default:
      return value;
  }
}
