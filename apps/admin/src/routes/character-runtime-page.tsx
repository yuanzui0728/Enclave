import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import type { ReplyLogicCharacterSnapshot } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  MetricCard,
  SectionHeading,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminErrorState,
  AdminPageHero,
  AdminRecordCard,
  AdminSkeletonCard,
  AdminValueCard as ValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { formatAdminDateTime as formatLocalizedDateTime } from "../lib/format";
import { CharacterWorkspaceNav } from "../components/character-workspace-nav";

const ACTIVITY_LABEL_MESSAGES: Record<string, ReturnType<typeof msg>> = {
  "": msg`未设置`,
  free: msg`空闲`,
  working: msg`工作中`,
  eating: msg`吃饭中`,
  resting: msg`休息中`,
  commuting: msg`通勤中`,
  sleeping: msg`睡觉中`,
};

function getActivityLabel(value?: string | null): string {
  const key = value ?? "";
  const message = ACTIVITY_LABEL_MESSAGES[key] ?? ACTIVITY_LABEL_MESSAGES[""];
  return translateRuntimeMessage(message);
}

export function CharacterRuntimePage() {
  const { characterId } = useParams({ from: "/characters/$characterId/runtime" });
  const baseUrl = resolveAdminCoreApiBaseUrl();

  const snapshotQuery = useQuery({
    queryKey: ["admin-reply-logic-character", baseUrl, characterId],
    queryFn: () => adminApi.getReplyLogicCharacterSnapshot(characterId),
  });


  if (snapshotQuery.isLoading) {
    return <AdminSkeletonCard rows={5} showAction />;
  }

  const t = translateRuntimeMessage;

  if (snapshotQuery.isError && snapshotQuery.error instanceof Error) {
    return (
      <AdminErrorState
        title={t(msg`角色运行逻辑加载失败`)}
        detail={snapshotQuery.error.message}
        onRetry={() => snapshotQuery.refetch()}
      />
    );
  }

  if (!snapshotQuery.data) {
    return (
      <AdminErrorState
        title={t(msg`角色运行逻辑暂不可用`)}
        detail={t(msg`未能从远程获取到 reply-logic 快照。`)}
        onRetry={() => snapshotQuery.refetch()}
      />
    );
  }

  const snapshot = snapshotQuery.data;
  const character = snapshot.character;

  return (
    <div className="space-y-6">
      <CharacterWorkspaceNav characterId={characterId} />

      <AdminPageHero
        eyebrow={t(msg`角色运行台`)}
        title={character.name}
        description={t(msg`查看这个角色当前的运行状态、生活信息与调度记录。`)}
        actions={
          <>
            <Link to="/characters">
              <Button variant="secondary" size="lg">{t(msg`返回角色中心`)}</Button>
            </Link>
            <Link to="/characters/$characterId/factory" params={{ characterId }}>
              <Button variant="secondary" size="lg">{t(msg`前往工厂`)}</Button>
            </Link>
            <Link to="/reply-logic">
              <Button variant="secondary" size="lg">{t(msg`世界级调试台`)}</Button>
            </Link>
          </>
        }
      />


      <div className="space-y-6">
        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>{t(msg`生活状态`)}</SectionHeading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={t(msg`在线模式`)} value={formatMode(character.onlineMode)} />
            <MetricCard label={t(msg`活动模式`)} value={formatMode(character.activityMode)} />
            <MetricCard label={t(msg`当前活动`)} value={formatActivity(character.currentActivity)} />
            <MetricCard label={t(msg`当前在线`)} value={character.isOnline ? t(msg`在线`) : t(msg`离线`)} />
            <MetricCard label={t(msg`活动频率`)} value={character.activityFrequency || t(msg`未设置`)} />
            <MetricCard label={t(msg`朋友圈频率`)} value={t(msg`${character.momentsFrequency} 次/天`)} />
            <MetricCard label={t(msg`视频号频率`)} value={t(msg`${character.feedFrequency} 次/周`)} />
            <MetricCard
              label={t(msg`活跃时段`)}
              value={
                character.activeHoursStart != null && character.activeHoursEnd != null
                  ? `${character.activeHoursStart}:00 – ${character.activeHoursEnd}:00`
                  : t(msg`未设置`)
              }
            />
            <MetricCard
              label={t(msg`触发场景`)}
              value={character.triggerScenes?.length ? character.triggerScenes.join("、") : t(msg`无`)}
            />
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>{t(msg`记忆与状态`)}</SectionHeading>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">{t(msg`核心记忆每周一自动更新，近期摘要每日自动更新。`)}</p>
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium text-[color:var(--text-secondary)]">{t(msg`核心记忆`)}</p>
              <pre className="whitespace-pre-wrap rounded-md bg-[color:var(--surface-inset)] p-3 text-sm text-[color:var(--text-primary)]">
                {character.profile.memory?.coreMemory || t(msg`（尚未生成）`)}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-[color:var(--text-secondary)]">{t(msg`近期摘要`)}</p>
              <pre className="whitespace-pre-wrap rounded-md bg-[color:var(--surface-inset)] p-3 text-sm text-[color:var(--text-primary)]">
                {character.profile.memory?.recentSummary || t(msg`（尚未生成）`)}
              </pre>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>{t(msg`回复链路快照`)}</SectionHeading>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard label={t(msg`状态门模式`)} value={formatGateMode(snapshot.actor.stateGate.mode)} />
              <MetricCard label={t(msg`最近聊天时间`)} value={formatDateTime(snapshot.actor.lastChatAt)} />
              <MetricCard label={t(msg`历史窗口`)} value={snapshot.actor.historyWindow} />
              <MetricCard label={t(msg`可见消息数`)} value={snapshot.actor.visibleHistoryCount} />
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
            <SectionHeading>{t(msg`生活逻辑观测`)}</SectionHeading>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MetricCard
                label={t(msg`当前小时`)}
                value={`${snapshot.observability.activeWindow.currentHour}:00`}
              />
              <MetricCard
                label={t(msg`是否在活跃窗`)}
                value={snapshot.observability.activeWindow.isWithinWindow ? t(msg`是`) : t(msg`否`)}
              />
              <MetricCard
                label={t(msg`今日朋友圈`)}
                value={`${snapshot.observability.contentCadence.todayMoments} / ${snapshot.observability.contentCadence.momentsTarget}`}
              />
              <MetricCard
                label={t(msg`近 7 天视频号`)}
                value={`${snapshot.observability.contentCadence.weeklyChannels} / ${snapshot.observability.contentCadence.channelsTarget}`}
              />
              <MetricCard
                label={t(msg`触发场景数`)}
                value={snapshot.observability.triggerScenes.length || t(msg`无`)}
              />
              <MetricCard
                label={t(msg`主动提醒`)}
                value={snapshot.observability.memoryProactive.enabled ? t(msg`已启用`) : t(msg`未启用`)}
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
          <SectionHeading>{t(msg`Scheduler 最近执行结果`)}</SectionHeading>
          <div className="mt-4 space-y-3">
            {snapshot.observability.relevantJobs.map((job) => (
              <AdminRecordCard
                key={job.id}
                title={job.name}
                badges={
                  <StatusPill tone={job.running ? "warning" : "healthy"}>
                    {job.running ? t(msg`运行中`) : t(msg`空闲`)}
                  </StatusPill>
                }
                meta={`${job.cadence} / ${job.nextRunHint}`}
                description={job.lastResult || t(msg`当前还没有执行结果。`)}
                details={
                  <div className="grid gap-3 md:grid-cols-3">
                    <ValueCard label={t(msg`运行次数`)} value={job.runCount} />
                    <ValueCard label={t(msg`最近执行`)} value={formatDateTime(job.lastRunAt)} />
                    <ValueCard label={t(msg`耗时`)} value={job.lastDurationMs ? `${job.lastDurationMs} ms` : t(msg`暂无`)} />
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
              <p className="text-sm text-[color:var(--text-muted)]">{t(msg`当前还没有可展示的调度执行记录。`)}</p>
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>{t(msg`最近生活事件`)}</SectionHeading>
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
              <p className="text-sm text-[color:var(--text-muted)]">{t(msg`当前还没有记录到该角色的生活事件。`)}</p>
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>{t(msg`上下文窗口`)}</SectionHeading>
          <div className="mt-4 space-y-3">
            {snapshot.actor.windowMessages.map((item) => (
              <AdminRecordCard
                key={item.id}
                title={item.senderName}
                badges={
                  <>
                    <StatusPill tone={item.includedInWindow ? "healthy" : "muted"}>
                      {item.includedInWindow ? t(msg`进入窗口`) : t(msg`仅可见`)}
                    </StatusPill>
                    <StatusPill tone="muted">{item.type}</StatusPill>
                    {item.senderRemark ? (
                      <StatusPill tone="muted">
                        {t(msg`备注`)} ← {item.senderRemark.from}
                      </StatusPill>
                    ) : null}
                  </>
                }
                meta={formatDateTime(item.createdAt)}
                description={item.text}
              />
            ))}
            {snapshot.actor.windowMessages.length === 0 ? (
              <p className="text-sm text-[color:var(--text-muted)]">{t(msg`当前没有上下文窗口消息。`)}</p>
            ) : null}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>{t(msg`叙事弧线`)}</SectionHeading>
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
            <p className="mt-4 text-sm text-[color:var(--text-muted)]">{t(msg`当前还没有叙事弧线记录。`)}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function formatMode(value?: string | null) {
  return translateRuntimeMessage(
    value === "manual" ? msg`人工锁定` : msg`自动调度`,
  );
}

function formatActivity(value?: string | null) {
  return getActivityLabel(value);
}

function formatGateMode(mode: string) {
  switch (mode) {
    case "sleep_hint_delay":
      return translateRuntimeMessage(msg`睡眠延迟`);
    case "busy_hint_delay":
      return translateRuntimeMessage(msg`忙碌延迟`);
    case "not_applied":
      return translateRuntimeMessage(msg`未应用`);
    default:
      return translateRuntimeMessage(msg`立即回复`);
  }
}

function formatDateTime(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
    "notSet",
  );
}

function formatSchedulerRunStatus(value: "success" | "error") {
  return translateRuntimeMessage(value === "error" ? msg`失败` : msg`成功`);
}

function formatLifeEventKind(
  value: ReplyLogicCharacterSnapshot["observability"]["lifeEvents"][number]["kind"],
) {
  switch (value) {
    case "online_status_changed":
      return translateRuntimeMessage(msg`在线状态`);
    case "activity_changed":
      return translateRuntimeMessage(msg`活动状态`);
    case "moment_posted":
      return translateRuntimeMessage(msg`朋友圈`);
    case "channel_posted":
      return translateRuntimeMessage(msg`视频号`);
    case "scene_friend_request":
      return translateRuntimeMessage(msg`场景好友`);
    case "proactive_message":
      return translateRuntimeMessage(msg`主动提醒`);
    case "relationship_updated":
      return translateRuntimeMessage(msg`AI 关系`);
    default:
      return value;
  }
}
