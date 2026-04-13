import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  getSystemStatus,
  updateCharacter,
  type Character,
  type ReplyLogicCharacterSnapshot,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  SectionHeading,
  StatusPill,
  ToggleChip,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminActionFeedback,
  AdminCodeBlock as CodeBlock,
  AdminInfoRows,
  AdminPageHero,
  AdminPromptSectionList,
  AdminRecordCard,
  AdminSectionNav,
  AdminSelectField as SelectFieldBlock,
  AdminTextArea as TextAreaBlock,
  AdminTextField as FieldBlock,
  AdminValueCard as ValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";

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
  const queryClient = useQueryClient();
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const [draft, setDraft] = useState<Character | null>(null);

  const snapshotQuery = useQuery({
    queryKey: ["admin-reply-logic-character", baseUrl, characterId],
    queryFn: () => adminApi.getReplyLogicCharacterSnapshot(characterId),
  });
  const systemStatusQuery = useQuery({
    queryKey: ["admin-character-runtime-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });
  const snapshotCharacter = snapshotQuery.data?.character ?? null;

  const seedSignature = useMemo(
    () => (snapshotCharacter ? JSON.stringify(snapshotCharacter) : ""),
    [snapshotCharacter],
  );

  useEffect(() => {
    setDraft(snapshotCharacter);
  }, [snapshotCharacter]);

  const isDirty = useMemo(() => {
    if (!draft || !seedSignature) {
      return false;
    }
    return JSON.stringify(draft) !== seedSignature;
  }, [draft, seedSignature]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Character) => updateCharacter(characterId, payload, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-reply-logic-character", baseUrl, characterId] }),
        queryClient.invalidateQueries({ queryKey: ["admin-reply-logic-overview", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
      ]);
    },
  });

  function patchDraft(updater: (current: Character) => Character) {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
  }

  if (snapshotQuery.isLoading) {
    return <LoadingBlock label="正在加载角色运行逻辑..." />;
  }

  if (snapshotQuery.isError && snapshotQuery.error instanceof Error) {
    return <ErrorBlock message={snapshotQuery.error.message} />;
  }

  if (!snapshotQuery.data || !draft) {
    return <ErrorBlock message="角色运行逻辑暂不可用。" />;
  }

  const snapshot = snapshotQuery.data;
  const latestRun = snapshot.observability.recentRuns[0] ?? null;
  const digitalHumanSummary = buildDigitalHumanAdminSummary(
    systemStatusQuery.data?.digitalHumanGateway,
  );

  function jumpToSection(sectionId: string) {
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminPageHero
          eyebrow="角色运行逻辑台"
          title={snapshot.character.name}
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
              <Button
                variant="primary"
                size="lg"
                onClick={() => saveMutation.mutate(draft)}
                disabled={!isDirty || saveMutation.isPending}
              >
                {saveMutation.isPending ? "保存中..." : "保存运行配置"}
              </Button>
            </>
          }
          metrics={[
            { label: "在线状态", value: draft.isOnline ? "在线" : "离线" },
            { label: "在线模式", value: formatMode(draft.onlineMode) },
            { label: "当前活动", value: formatActivity(draft.currentActivity) },
            { label: "最近调度", value: latestRun ? formatSchedulerRunStatus(latestRun.status) : "暂无" },
          ]}
        />

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>当前状态</SectionHeading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="活动模式" value={formatMode(draft.activityMode)} />
            <MetricCard label="活跃时间窗" value={snapshot.observability.activeWindow.label} />
            <MetricCard label="记忆摘要" value={draft.profile.memorySummary ? "已填写" : "未填写"} />
            <MetricCard label="叙事弧线" value={snapshot.narrativeArc ? "有" : "无"} />
            <MetricCard label="角色来源" value={formatCharacterSourceType(draft.sourceType)} />
            <MetricCard label="删除策略" value={formatDeletionPolicy(draft.deletionPolicy)} />
          </div>
        </Card>
      </div>

      <AdminCallout
        tone={digitalHumanSummary.ready ? "success" : "warning"}
        title={
          digitalHumanSummary.ready
            ? "数字人链路已进入可联调状态"
            : `数字人当前阻塞：${digitalHumanSummary.statusLabel}`
        }
        description={`${digitalHumanSummary.description} ${digitalHumanSummary.nextStep}`}
      />

      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <ErrorBlock message={saveMutation.error.message} />
      ) : null}
      {saveMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title="运行配置已保存"
          description="角色快照已刷新。"
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <AdminSectionNav
            items={[
              { label: "生活状态配置", onClick: () => jumpToSection("character-runtime-lifestyle") },
              { label: "记忆与状态", onClick: () => jumpToSection("character-runtime-memory") },
              { label: "运行观测", onClick: () => jumpToSection("character-runtime-observability") },
              { label: "提示词与窗口", detail: "分段、最终 prompt、上下文窗口", onClick: () => jumpToSection("character-runtime-prompt") },
              { label: "叙事弧线", onClick: () => jumpToSection("character-runtime-arc") },
            ]}
          />

          <AdminInfoRows
            title="操作提示"
            rows={[
              { label: "保存状态", value: isDirty ? "有未保存变更" : "已同步" },
              { label: "调度影响", value: (draft.onlineMode ?? "auto") === "auto" || (draft.activityMode ?? "auto") === "auto" ? "仍受自动调度影响" : "当前为人工锁定" },
            ]}
          />
        </div>

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card id="character-runtime-lifestyle" className="bg-[color:var(--surface-console)]">
            <SectionHeading>生活状态配置</SectionHeading>
            <div className="mt-4 space-y-4">
              <SelectFieldBlock
                label="在线模式"
                value={draft.onlineMode ?? "auto"}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    onlineMode: value === "manual" ? "manual" : "auto",
                  }))
                }
                options={[
                  { value: "auto", label: "自动调度" },
                  { value: "manual", label: "人工锁定" },
                ]}
              />
              <SelectFieldBlock
                label="活动模式"
                value={draft.activityMode ?? "auto"}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    activityMode: value === "manual" ? "manual" : "auto",
                  }))
                }
                options={[
                  { value: "auto", label: "自动调度" },
                  { value: "manual", label: "人工锁定" },
                ]}
              />
              <SelectFieldBlock
                label="当前活动"
                value={draft.currentActivity ?? ""}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    currentActivity: value || null,
                  }))
                }
                options={ACTIVITY_OPTIONS}
              />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <FieldBlock
                  label="活动频率"
                  value={draft.activityFrequency}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      activityFrequency: value,
                    }))
                  }
                />
                <FieldBlock
                  label="朋友圈频率"
                  value={draft.momentsFrequency}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      momentsFrequency: parseIntWithFallback(value, current.momentsFrequency),
                    }))
                  }
                />
                <FieldBlock
                  label="视频号频率"
                  value={draft.feedFrequency}
                  type="number"
                  min={0}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      feedFrequency: parseIntWithFallback(value, current.feedFrequency),
                    }))
                  }
                />
                <FieldBlock
                  label="活跃开始小时"
                  value={draft.activeHoursStart ?? ""}
                  type="number"
                  min={0}
                  max={23}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      activeHoursStart: parseOptionalHour(value),
                    }))
                  }
                />
                <FieldBlock
                  label="活跃结束小时"
                  value={draft.activeHoursEnd ?? ""}
                  type="number"
                  min={0}
                  max={23}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      activeHoursEnd: parseOptionalHour(value),
                    }))
                  }
                />
                <FieldBlock
                  label="触发场景"
                  value={listToCsv(draft.triggerScenes)}
                  onChange={(value) =>
                    patchDraft((current) => ({
                      ...current,
                      triggerScenes: csvToList(value),
                    }))
                  }
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <ToggleChip
                  label="当前在线"
                  checked={draft.isOnline}
                  onChange={(event) =>
                    patchDraft((current) => ({
                      ...current,
                      isOnline: event.currentTarget.checked,
                    }))
                  }
                />
              </div>
              {(draft.onlineMode ?? "auto") === "auto" || (draft.activityMode ?? "auto") === "auto" ? (
                <InlineNotice tone="warning">
                  处于自动调度模式的字段仍会被定时任务更新；切到人工锁定后，后台手动值才会持续生效。
                </InlineNotice>
              ) : null}
            </div>
          </Card>

          <Card id="character-runtime-memory" className="bg-[color:var(--surface-console)]">
            <SectionHeading>记忆与状态</SectionHeading>
            <div className="mt-4 space-y-4">
              <TextAreaBlock
                label="记忆摘要"
                value={draft.profile.memorySummary}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    profile: { ...current.profile, memorySummary: value },
                  }))
                }
              />
              <TextAreaBlock
                label="核心记忆"
                value={draft.profile.memory?.coreMemory ?? ""}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    profile: {
                      ...current.profile,
                      memory: {
                        ...current.profile.memory!,
                        coreMemory: value,
                      },
                    },
                  }))
                }
              />
              <TextAreaBlock
                label="近期摘要"
                value={draft.profile.memory?.recentSummary ?? ""}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    profile: {
                      ...current.profile,
                      memory: {
                        ...current.profile.memory!,
                        recentSummary: value,
                      },
                    },
                  }))
                }
              />
              <FieldBlock
                label="遗忘曲线"
                value={draft.profile.memory?.forgettingCurve ?? 70}
                type="number"
                min={0}
                max={100}
                onChange={(value) =>
                  patchDraft((current) => ({
                    ...current,
                    profile: {
                      ...current.profile,
                      memory: {
                        ...current.profile.memory!,
                        forgettingCurve: Math.min(
                          Math.max(parseIntWithFallback(value, current.profile.memory?.forgettingCurve ?? 70), 0),
                          100,
                        ),
                      },
                    },
                  }))
                }
              />
            </div>
          </Card>

          <Card id="character-runtime-observability" className="bg-[color:var(--surface-console)]">
            <SectionHeading>运行时摘要</SectionHeading>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <MetricCard label="状态门" value={formatGateMode(snapshot.actor.stateGate.mode)} />
              <MetricCard label="历史窗口" value={snapshot.actor.historyWindow} />
              <MetricCard label="可见消息数" value={snapshot.actor.visibleHistoryCount} />
              <MetricCard label="世界上下文" value={snapshot.actor.worldContextText || "暂无"} />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>生活逻辑观测</SectionHeading>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
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
                label="触发场景"
                value={snapshot.observability.triggerScenes.length || "无"}
              />
              <MetricCard
                label="主动提醒"
                value={snapshot.observability.memoryProactive.enabled ? "已启用" : "未启用"}
              />
            </div>
            <div className="mt-4 space-y-2">
              <InlineNotice tone={snapshot.observability.memoryProactive.enabled ? "muted" : "warning"}>
                {snapshot.observability.memoryProactive.reason}
              </InlineNotice>
              {snapshot.observability.notes.map((note) => (
                <InlineNotice key={note} tone="muted">{note}</InlineNotice>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>回复链路快照</SectionHeading>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <MetricCard label="状态门原因" value={formatStateGateReason(snapshot.actor.stateGate)} />
              <MetricCard label="最近聊天时间" value={formatDateTime(snapshot.actor.lastChatAt)} />
            </div>
            {snapshot.notes.length ? (
              <div className="mt-4 space-y-2">
                {snapshot.notes.map((note) => (
                  <InlineNotice key={note} tone="muted">{note}</InlineNotice>
                ))}
              </div>
            ) : null}
          </Card>

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
                <InlineNotice tone="muted">当前还没有可展示的调度执行记录。</InlineNotice>
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
                <InlineNotice tone="muted">当前还没有记录到该角色的生活事件。</InlineNotice>
              ) : null}
            </div>
          </Card>

          <Card id="character-runtime-prompt" className="bg-[color:var(--surface-console)]">
            <SectionHeading>提示词分段</SectionHeading>
            <AdminPromptSectionList
              className="mt-4"
              sections={snapshot.actor.promptSections.map((section) => ({
                key: section.key,
                label: section.label,
                active: section.active,
                content: section.content,
              }))}
            />
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>最终生效提示词</SectionHeading>
            <CodeBlock className="mt-4" value={snapshot.actor.effectivePrompt} />
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
            </div>
          </Card>

          <Card id="character-runtime-arc" className="bg-[color:var(--surface-console)]">
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
              <InlineNotice className="mt-4" tone="muted">当前还没有叙事弧线记录。</InlineNotice>
            )}
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
}

function csvToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToCsv(items?: string[] | null) {
  return items?.join(", ") ?? "";
}

function parseIntWithFallback(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : Math.round(parsed);
}

function parseOptionalHour(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.min(Math.max(Math.round(parsed), 0), 23);
}

function formatMode(value?: string | null) {
  return value === "manual" ? "人工锁定" : "自动调度";
}

function formatCharacterSourceType(sourceType?: Character["sourceType"]) {
  switch (sourceType) {
    case "default_seed":
      return "默认保底";
    case "preset_catalog":
      return "名人预设";
    case "manual_admin":
      return "后台手工";
    default:
      return "后台手工";
  }
}

function formatDeletionPolicy(policy?: Character["deletionPolicy"]) {
  switch (policy) {
    case "protected":
      return "受保护";
    case "archive_allowed":
      return "允许删除";
    default:
      return "允许删除";
  }
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

function formatStateGateReason(gate: { mode: string; activity?: string | null; reason: string }) {
  if (gate.mode === "busy_hint_delay") {
    return `当前活动为${formatActivity(gate.activity)}，会先发送忙碌提示，再延迟回复。`;
  }
  if (gate.mode === "sleep_hint_delay") {
    return "当前活动为睡觉中，会先发送系统提示，再延迟回复。";
  }
  return gate.reason;
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
