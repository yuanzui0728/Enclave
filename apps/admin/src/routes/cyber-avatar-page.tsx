import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type {
  CyberAvatarOverview,
  CyberAvatarProfile,
  CyberAvatarPromptProjection,
  CyberAvatarRealWorldBrief,
  CyberAvatarRealWorldItem,
  CyberAvatarRealWorldOverview,
  CyberAvatarRunDetail,
  CyberAvatarRunSummary,
  CyberAvatarRuntimeRules,
  CyberAvatarSignal,
  NeedDiscoveryOverview,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCallout,
  AdminCodeBlock,
  AdminDraftStatusPill,
  AdminEmptyState,
  AdminInfoRows,
  AdminMetaText,
  AdminMiniPanel,
  AdminPageHero,
  AdminRecordCard,
  AdminSectionHeader,
  AdminSectionNav,
  AdminSoftBox,
  AdminTabs,
  AdminTextArea,
  AdminTextField,
  AdminToggle,
  AdminValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

type WorkspaceTab = "overview" | "projection" | "evidence" | "rules";
type EvidenceTab = "runs" | "signals" | "items" | "briefs" | "need-discovery";
type RulesTab = "common" | "sources" | "prompts" | "json";
type ProjectionTab = keyof CyberAvatarPromptProjection;

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "overview", label: "运营总览" },
  { key: "projection", label: "Prompt 投影" },
  { key: "evidence", label: "运行证据" },
  { key: "rules", label: "规则编辑" },
];

const EVIDENCE_TABS: Array<{ key: EvidenceTab; label: string }> = [
  { key: "runs", label: "运行记录" },
  { key: "signals", label: "最近信号" },
  { key: "items", label: "外部条目" },
  { key: "briefs", label: "外部简报" },
  { key: "need-discovery", label: "需求上游" },
];

const RULE_TABS: Array<{ key: RulesTab; label: string }> = [
  { key: "common", label: "常用开关" },
  { key: "sources", label: "来源与回流" },
  { key: "prompts", label: "提示词模板" },
  { key: "json", label: "原始 JSON" },
];

const PROJECTION_SECTIONS: Array<{
  key: ProjectionTab;
  label: string;
  description: string;
  consumers: string[];
}> = [
  {
    key: "coreInstruction",
    label: "核心约束",
    description: "用户长期稳定边界、偏好和判断习惯的收口段。",
    consumers: [
      "self 单聊",
      "self 群聊",
      "主动跟进",
      "动作运行时",
      "scheduler 主动消息",
    ],
  },
  {
    key: "worldInteractionPrompt",
    label: "世界内互动",
    description: "用户在这个世界里怎么聊天、怎么回应、怎么接人。",
    consumers: ["self 单聊", "self 群聊", "主动跟进", "scheduler 主动消息"],
  },
  {
    key: "realWorldInteractionPrompt",
    label: "真实世界互动",
    description: "用户和现实服务、现实信息之间的交互倾向。",
    consumers: ["动作运行时"],
  },
  {
    key: "proactivePrompt",
    label: "主动跟进",
    description: "用户更愿意被怎样提醒、推进和回捞未闭环事项。",
    consumers: ["主动跟进", "scheduler 主动消息"],
  },
  {
    key: "actionPlanningPrompt",
    label: "动作规划",
    description: "用户授权 self 去做真实世界动作时的偏好和约束。",
    consumers: ["动作运行时"],
  },
  {
    key: "memoryBlock",
    label: "赛博分身记忆",
    description: "供下游链路读取的压缩上下文块，用来补足短窗口。",
    consumers: [
      "self 单聊",
      "self 群聊",
      "主动跟进",
      "动作运行时",
      "scheduler 主动消息",
      "需求发现",
    ],
  },
];

const RUN_MODE_LABELS: Record<CyberAvatarRunSummary["mode"], string> = {
  incremental: "增量刷新",
  deep_refresh: "深度刷新",
  full_rebuild: "全量重建",
  projection_only: "只重投影",
  preview: "预览",
  real_world_sync: "真实世界回流",
};

const SIGNAL_TYPE_LABELS: Record<CyberAvatarSignal["signalType"], string> = {
  direct_message: "单聊消息",
  group_message: "群聊消息",
  moment_post: "朋友圈发布",
  feed_post: "广场动态",
  channel_post: "视频号内容",
  feed_interaction: "内容互动",
  friendship_event: "社交关系变化",
  owner_profile_update: "世界主人资料更新",
  search_activity: "搜索行为",
  favorite_action: "收藏动作",
  real_world_action: "真实世界动作",
  location_update: "位置更新",
  real_world_item: "真实世界条目",
  real_world_brief: "真实世界简报",
};

const SURFACE_LABELS: Record<string, string> = {
  chat: "聊天",
  group: "群聊",
  moments: "朋友圈",
  feed: "广场",
  channels: "视频号",
  social: "社交",
  owner: "世界主人",
  real_world: "真实世界",
};

const SOURCE_TOGGLE_FIELDS: Array<{
  key: keyof CyberAvatarRuntimeRules["sourceToggles"];
  label: string;
}> = [
  { key: "includeDirectMessages", label: "单聊消息" },
  { key: "includeGroupMessages", label: "群聊消息" },
  { key: "includeMomentPosts", label: "朋友圈" },
  { key: "includeFeedPosts", label: "广场动态" },
  { key: "includeChannelPosts", label: "视频号" },
  { key: "includeFeedInteractions", label: "内容互动" },
  { key: "includeFriendshipEvents", label: "社交关系" },
  { key: "includeOwnerProfileUpdates", label: "资料更新" },
  { key: "includeSearchActivity", label: "搜索行为" },
  { key: "includeFavoriteActions", label: "收藏动作" },
  { key: "includeRealWorldActions", label: "真实世界动作" },
  { key: "includeLocationUpdates", label: "位置更新" },
  { key: "includeRealWorldItems", label: "真实世界条目" },
  { key: "includeRealWorldBriefs", label: "真实世界简报" },
];

const PROMPT_TEMPLATE_FIELDS: Array<{
  key: keyof CyberAvatarRuntimeRules["promptTemplates"];
  label: string;
  description: string;
}> = [
  {
    key: "incrementalDigestPrompt",
    label: "增量刷新 Prompt",
    description: "面向 pending signals 的快速画像更新指令。",
  },
  {
    key: "deepRefreshPrompt",
    label: "深度刷新 Prompt",
    description: "面向较大窗口历史信号的重构指令。",
  },
  {
    key: "projectionCoreInstructionTemplate",
    label: "核心约束模板",
    description: "生成 coreInstruction 的模板。",
  },
  {
    key: "projectionWorldInteractionTemplate",
    label: "世界内互动模板",
    description: "生成 worldInteractionPrompt 的模板。",
  },
  {
    key: "projectionRealWorldInteractionTemplate",
    label: "真实世界互动模板",
    description: "生成 realWorldInteractionPrompt 的模板。",
  },
  {
    key: "projectionProactiveTemplate",
    label: "主动跟进模板",
    description: "生成 proactivePrompt 的模板。",
  },
  {
    key: "projectionActionPlanningTemplate",
    label: "动作规划模板",
    description: "生成 actionPlanningPrompt 的模板。",
  },
  {
    key: "projectionMemoryTemplate",
    label: "记忆块模板",
    description: "生成 memoryBlock 的模板。",
  },
];

function safePrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { hour12: false });
}

function joinList(items: string[], emptyLabel = "暂无") {
  return items.length ? items.join(" / ") : emptyLabel;
}

function parseLineSeparatedList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveRunTone(status: CyberAvatarRunSummary["status"]) {
  if (status === "success") {
    return "healthy" as const;
  }
  if (status === "failed" || status === "partial") {
    return "warning" as const;
  }
  return "muted" as const;
}

function resolveSignalTone(status: CyberAvatarSignal["status"]) {
  if (status === "merged") {
    return "healthy" as const;
  }
  if (status === "failed") {
    return "warning" as const;
  }
  return "muted" as const;
}

function resolveRealWorldItemTone(status: CyberAvatarRealWorldItem["status"]) {
  if (status === "accepted") {
    return "healthy" as const;
  }
  if (status === "filtered_low_score" || status === "filtered_blocked_source") {
    return "warning" as const;
  }
  return "muted" as const;
}

function resolveProfileTone(status: string) {
  return status === "ready" ? ("healthy" as const) : ("warning" as const);
}

function translateRunMode(mode: CyberAvatarRunSummary["mode"]) {
  return RUN_MODE_LABELS[mode] ?? mode;
}

function translateSignalType(type: CyberAvatarSignal["signalType"]) {
  return SIGNAL_TYPE_LABELS[type] ?? type;
}

function translateSurface(surface: string) {
  return SURFACE_LABELS[surface] ?? surface;
}

function buildOperatorSummary(input: {
  profileStatus: string;
  pendingSignalCount: number;
  missingSurfaces: string[];
  hasLatestBrief: boolean;
  realWorldEnabled: boolean;
  isRulesDirty: boolean;
  hasRulesParseError: boolean;
}) {
  const notes: string[] = [];
  let tone: "warning" | "info" | "success" = "success";

  if (input.hasRulesParseError) {
    tone = "warning";
    notes.push(
      "规则草稿 JSON 当前无法解析，结构化编辑已不可用，先在原始 JSON 里修复格式。",
    );
  }

  if (input.profileStatus !== "ready") {
    tone = "warning";
    notes.push(
      `画像当前状态为 ${input.profileStatus}，建议先检查最近一次 run 的输入快照和跳过/失败原因。`,
    );
  }

  if (input.pendingSignalCount > 0) {
    tone = tone === "success" ? "info" : tone;
    notes.push(
      `当前还有 ${input.pendingSignalCount} 条待处理信号，适合先跑一次增量刷新。`,
    );
  }

  if (input.missingSurfaces.length > 0) {
    tone = tone === "success" ? "info" : tone;
    notes.push(
      `最近窗口缺失 ${joinList(input.missingSurfaces)}，可回到来源与回流里检查采集开关。`,
    );
  }

  if (input.realWorldEnabled && !input.hasLatestBrief) {
    tone = tone === "success" ? "info" : tone;
    notes.push(
      "真实世界回流已启用但还没有最新简报，建议拉一次真实世界信息确认外部查询链路是否正常。",
    );
  }

  if (input.isRulesDirty) {
    tone = tone === "success" ? "info" : tone;
    notes.push(
      "当前有未保存的规则草稿，若已确认变更，可以直接保存并跑一次重投影或增量刷新。",
    );
  }

  if (!notes.length) {
    notes.push(
      "当前画像、Prompt 投影和真实世界回流都处于可运营状态，可以直接检查 Prompt 投影或做细粒度规则调优。",
    );
  }

  return {
    tone,
    title:
      tone === "warning"
        ? "当前有待处理项"
        : tone === "info"
          ? "当前有可操作项"
          : "当前运行状态稳定",
    notes,
  };
}

export function CyberAvatarPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [projectionTab, setProjectionTab] =
    useState<ProjectionTab>("coreInstruction");
  const [evidenceTab, setEvidenceTab] = useState<EvidenceTab>("runs");
  const [rulesTab, setRulesTab] = useState<RulesTab>("common");
  const [rulesJsonDraft, setRulesJsonDraft] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [rulesParseError, setRulesParseError] = useState("");

  const overviewQuery = useQuery({
    queryKey: ["admin-cyber-avatar-overview", baseUrl],
    queryFn: () => adminApi.getCyberAvatarOverview(),
  });

  const needDiscoveryQuery = useQuery({
    queryKey: ["admin-need-discovery-overview", baseUrl],
    queryFn: () => adminApi.getNeedDiscoveryOverview(),
  });

  const overviewRulesJson = useMemo(
    () => (overviewQuery.data ? safePrettyJson(overviewQuery.data.rules) : ""),
    [overviewQuery.data],
  );

  useEffect(() => {
    if (!overviewQuery.data) {
      return;
    }

    if (!rulesJsonDraft.trim()) {
      setRulesJsonDraft(overviewRulesJson);
    }

    if (!selectedRunId && overviewQuery.data.recentRuns[0]) {
      setSelectedRunId(overviewQuery.data.recentRuns[0].id);
    }
  }, [overviewQuery.data, overviewRulesJson, rulesJsonDraft, selectedRunId]);

  const runDetailQuery = useQuery({
    queryKey: ["admin-cyber-avatar-run", baseUrl, selectedRunId],
    queryFn: () => adminApi.getCyberAvatarRun(selectedRunId),
    enabled: Boolean(selectedRunId),
  });

  const saveRulesMutation = useMutation({
    mutationFn: (payload: CyberAvatarRuntimeRules) =>
      adminApi.setCyberAvatarRules(payload),
    onSuccess: (nextRules) => {
      setRulesJsonDraft(safePrettyJson(nextRules));
      setRulesParseError("");
      void queryClient.invalidateQueries({
        queryKey: ["admin-cyber-avatar-overview", baseUrl],
      });
    },
  });

  const runMutation = useMutation({
    mutationFn: (
      mode:
        | "incremental"
        | "deep_refresh"
        | "full_rebuild"
        | "project"
        | "real_world",
    ) => {
      if (mode === "incremental") {
        return adminApi.runCyberAvatarIncremental();
      }
      if (mode === "deep_refresh") {
        return adminApi.runCyberAvatarDeepRefresh();
      }
      if (mode === "full_rebuild") {
        return adminApi.runCyberAvatarFullRebuild();
      }
      if (mode === "real_world") {
        return adminApi.runCyberAvatarRealWorldSync();
      }
      return adminApi.runCyberAvatarProjection();
    },
    onSuccess: async (result) => {
      setSelectedRunId(result.id);
      setWorkspaceTab("evidence");
      setEvidenceTab("runs");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-cyber-avatar-overview", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-need-discovery-overview", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-cyber-avatar-run", baseUrl, result.id],
        }),
      ]);
    },
  });

  const parsedRules = useMemo(() => {
    if (!rulesJsonDraft.trim()) {
      return null;
    }

    try {
      return JSON.parse(rulesJsonDraft) as CyberAvatarRuntimeRules;
    } catch {
      return null;
    }
  }, [rulesJsonDraft]);

  const isRulesDirty = useMemo(() => {
    if (!overviewRulesJson) {
      return false;
    }

    return rulesJsonDraft.trim() !== overviewRulesJson;
  }, [overviewRulesJson, rulesJsonDraft]);

  if (overviewQuery.isLoading) {
    return <LoadingBlock label="正在读取赛博分身概览..." />;
  }

  if (overviewQuery.isError && overviewQuery.error instanceof Error) {
    return <ErrorBlock message={overviewQuery.error.message} />;
  }

  if (!overviewQuery.data) {
    return (
      <AdminEmptyState
        title="赛博分身概览暂不可用"
        description="后台还没有拿到画像、规则或运行记录。先检查后端 cyber-avatar 模块是否已成功加载。"
      />
    );
  }

  const overview = overviewQuery.data;
  const profile = overview.profile;
  const realWorld = overview.realWorld;
  const activeRun = runDetailQuery.data;
  const selectedProjection =
    PROJECTION_SECTIONS.find((item) => item.key === projectionTab) ??
    PROJECTION_SECTIONS[0];

  const operatorSummary = buildOperatorSummary({
    profileStatus: profile.status,
    pendingSignalCount: profile.pendingSignalCount,
    missingSurfaces: profile.sourceCoverage.missingSurfaces,
    hasLatestBrief: Boolean(realWorld.latestBrief),
    realWorldEnabled: realWorld.rules.realWorldSyncEnabled,
    isRulesDirty,
    hasRulesParseError: Boolean(rulesJsonDraft.trim()) && !parsedRules,
  });

  function handleSaveRules() {
    if (!parsedRules) {
      setRulesParseError("规则 JSON 解析失败，先修正格式再保存。");
      setWorkspaceTab("rules");
      setRulesTab("json");
      return;
    }

    setRulesParseError("");
    saveRulesMutation.mutate(parsedRules);
  }

  function resetRulesDraft() {
    setRulesJsonDraft(overviewRulesJson);
    setRulesParseError("");
  }

  function patchRulesDraft(
    updater: (current: CyberAvatarRuntimeRules) => CyberAvatarRuntimeRules,
  ) {
    if (!parsedRules) {
      setRulesParseError(
        "当前 JSON 草稿格式错误，先到“原始 JSON”里修复后再使用结构化编辑。",
      );
      setWorkspaceTab("rules");
      setRulesTab("json");
      return;
    }

    const nextRules = updater(parsedRules);
    setRulesParseError("");
    setRulesJsonDraft(safePrettyJson(nextRules));
  }

  const heroMetrics = [
    { label: "画像版本", value: profile.version },
    { label: "总信号数", value: profile.signalCount },
    { label: "待处理信号", value: profile.pendingSignalCount },
    {
      label: "最近构建时间",
      value: profile.lastBuiltAt ? formatDateTime(profile.lastBuiltAt) : "暂无",
    },
    { label: "外部回流条目", value: realWorld.stats.acceptedItems },
    { label: "活跃外部简报", value: realWorld.stats.activeBriefs },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="Cyber Avatar Ops"
        title="赛博分身建模、回流与运营工作台"
        description="把用户在世界内的行为信号、画像状态、Prompt 投影、真实世界回流与 need-discovery 上游统一收进一个运营工作区，方便快速判断当前状态、定位异常并调整规则。"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["admin-cyber-avatar-overview", baseUrl],
                })
              }
            >
              刷新概览
            </Button>
            <Button
              variant="secondary"
              disabled={!isRulesDirty}
              onClick={resetRulesDraft}
            >
              重置草稿
            </Button>
            <Button
              variant="primary"
              disabled={
                !isRulesDirty || !parsedRules || saveRulesMutation.isPending
              }
              onClick={handleSaveRules}
            >
              {saveRulesMutation.isPending ? "保存中..." : "保存规则"}
            </Button>
          </>
        }
        metrics={heroMetrics}
      />

      <AdminCallout
        tone={operatorSummary.tone}
        title={operatorSummary.title}
        description={
          <div className="space-y-2">
            {operatorSummary.notes.map((note) => (
              <AdminSoftBox key={note} className="text-sm">
                {note}
              </AdminSoftBox>
            ))}
          </div>
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setWorkspaceTab("evidence");
                setEvidenceTab("runs");
              }}
            >
              查看运行证据
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setWorkspaceTab("rules");
                setRulesTab("common");
              }}
            >
              去规则编辑
            </Button>
          </>
        }
      />

      {saveRulesMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title="赛博分身规则已保存"
          description="新的抓取开关、调度参数和提示词模板已经写入系统配置。"
        />
      ) : null}
      {saveRulesMutation.isError && saveRulesMutation.error instanceof Error ? (
        <ErrorBlock message={saveRulesMutation.error.message} />
      ) : null}
      {rulesParseError ? <ErrorBlock message={rulesParseError} /> : null}
      {runMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title={`运行已完成：${translateRunMode(runMutation.data.mode)}`}
          description={`状态 ${runMutation.data.status}，处理了 ${runMutation.data.signalCount} 条信号。`}
        />
      ) : null}
      {runMutation.isError && runMutation.error instanceof Error ? (
        <ErrorBlock message={runMutation.error.message} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.36fr_0.64fr]">
        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <AdminSectionNav
            title="工作区"
            items={[
              {
                label: "运营总览",
                detail:
                  "先判断画像健康度、真实世界回流和 need-discovery 上游是否正常。",
                onClick: () => setWorkspaceTab("overview"),
              },
              {
                label: "Prompt 投影",
                detail:
                  "逐段查看当前 projection，并确认它实际影响哪些下游链路。",
                onClick: () => setWorkspaceTab("projection"),
              },
              {
                label: "运行证据",
                detail:
                  "回看最近 runs、signals、real-world items 和 briefs，定位画像变化来源。",
                onClick: () => setWorkspaceTab("evidence"),
              },
              {
                label: "规则编辑",
                detail: "优先用结构化配置改高频参数，需要时再进入原始 JSON。",
                onClick: () => setWorkspaceTab("rules"),
              },
            ]}
          />

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="快捷运行" />
            <div className="mt-4 grid gap-3">
              <RunActionButton
                label="跑一次增量刷新"
                pendingLabel="执行中..."
                active={runMutation.variables === "incremental"}
                pending={runMutation.isPending}
                onClick={() => runMutation.mutate("incremental")}
              />
              <RunActionButton
                label="跑一次深度刷新"
                pendingLabel="执行中..."
                active={runMutation.variables === "deep_refresh"}
                pending={runMutation.isPending}
                onClick={() => runMutation.mutate("deep_refresh")}
              />
              <RunActionButton
                label="全量重建"
                pendingLabel="执行中..."
                active={runMutation.variables === "full_rebuild"}
                pending={runMutation.isPending}
                onClick={() => runMutation.mutate("full_rebuild")}
              />
              <RunActionButton
                label="只重投影 Prompt"
                pendingLabel="执行中..."
                active={runMutation.variables === "project"}
                pending={runMutation.isPending}
                onClick={() => runMutation.mutate("project")}
              />
              <RunActionButton
                label="拉一次真实世界信息"
                pendingLabel="执行中..."
                active={runMutation.variables === "real_world"}
                pending={runMutation.isPending}
                onClick={() => runMutation.mutate("real_world")}
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader title="当前脉冲" />
            <div className="mt-4 grid gap-3">
              <AdminValueCard
                label="画像状态"
                value={
                  <StatusPill tone={resolveProfileTone(profile.status)}>
                    {profile.status}
                  </StatusPill>
                }
              />
              <AdminValueCard
                label="当前情绪 / 能量"
                value={`${profile.liveState.mood || "暂无"} / ${profile.liveState.energy || "暂无"}`}
              />
              <AdminValueCard
                label="社交温度"
                value={profile.liveState.socialTemperature || "暂无"}
              />
              <AdminValueCard
                label="最新 focus"
                value={joinList(profile.liveState.focus)}
              />
              <AdminValueCard
                label="最后信号时间"
                value={formatDateTime(profile.lastSignalAt)}
              />
              <AdminValueCard
                label="最新外部简报"
                value={
                  realWorld.latestBrief
                    ? formatDateTime(realWorld.latestBrief.createdAt)
                    : "暂无"
                }
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="当前选中运行"
              actions={
                activeRun ? (
                  <StatusPill tone={resolveRunTone(activeRun.status)}>
                    {activeRun.status}
                  </StatusPill>
                ) : null
              }
            />
            <div className="mt-4">
              {activeRun ? (
                <div className="space-y-3">
                  <AdminSoftBox>
                    {translateRunMode(activeRun.mode)} · 画像版本 v
                    {activeRun.profileVersion}
                  </AdminSoftBox>
                  <AdminInfoRows
                    title="运行摘要"
                    rows={[
                      { label: "触发方式", value: activeRun.trigger },
                      { label: "处理信号", value: activeRun.signalCount },
                      {
                        label: "时间窗口",
                        value: `${formatDateTime(activeRun.windowStartedAt)} → ${formatDateTime(activeRun.windowEndedAt)}`,
                      },
                    ]}
                  />
                </div>
              ) : (
                <AdminEmptyState
                  title="尚未选择运行"
                  description="执行一次刷新或从运行证据里选中某条 run。"
                />
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <AdminTabs
            tabs={WORKSPACE_TABS}
            activeKey={workspaceTab}
            onChange={(key) => setWorkspaceTab(key as WorkspaceTab)}
          />

          {workspaceTab === "overview" ? (
            <OverviewWorkspace
              profile={profile}
              realWorld={realWorld}
              needDiscoveryQuery={needDiscoveryQuery}
            />
          ) : null}

          {workspaceTab === "projection" ? (
            <ProjectionWorkspace
              profile={profile}
              projectionTab={projectionTab}
              onProjectionTabChange={setProjectionTab}
              selectedProjection={selectedProjection}
            />
          ) : null}

          {workspaceTab === "evidence" ? (
            <EvidenceWorkspace
              overview={overview}
              realWorld={realWorld}
              needDiscoveryQuery={needDiscoveryQuery}
              evidenceTab={evidenceTab}
              onEvidenceTabChange={setEvidenceTab}
              selectedRunId={selectedRunId}
              onSelectRunId={setSelectedRunId}
              activeRun={activeRun}
              runDetailQuery={runDetailQuery}
            />
          ) : null}

          {workspaceTab === "rules" ? (
            <RulesWorkspace
              parsedRules={parsedRules}
              rulesJsonDraft={rulesJsonDraft}
              onRulesJsonDraftChange={(value) => {
                setRulesJsonDraft(value);
                if (rulesParseError) {
                  setRulesParseError("");
                }
              }}
              rulesTab={rulesTab}
              onRulesTabChange={setRulesTab}
              isRulesDirty={isRulesDirty}
              patchRulesDraft={patchRulesDraft}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RunActionButton({
  label,
  pendingLabel,
  active,
  pending,
  onClick,
}: {
  label: string;
  pendingLabel: string;
  active: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? "primary" : "secondary"}
      disabled={pending}
      onClick={onClick}
    >
      {pending && active ? pendingLabel : label}
    </Button>
  );
}

function OverviewWorkspace({
  profile,
  realWorld,
  needDiscoveryQuery,
}: {
  profile: CyberAvatarProfile;
  realWorld: CyberAvatarRealWorldOverview;
  needDiscoveryQuery: UseQueryResult<NeedDiscoveryOverview>;
}) {
  return (
    <div className="space-y-6">
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title="画像健康与构建状态"
          actions={
            <StatusPill tone={resolveProfileTone(profile.status)}>
              {profile.status}
            </StatusPill>
          }
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="liveState 置信度"
            value={profile.confidence.liveState.toFixed(2)}
          />
          <MetricCard
            label="recentState 置信度"
            value={profile.confidence.recentState.toFixed(2)}
          />
          <MetricCard
            label="stableCore 置信度"
            value={profile.confidence.stableCore.toFixed(2)}
          />
          <MetricCard
            label="覆盖窗口"
            value={`${profile.sourceCoverage.windowDays} 天`}
          />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <AdminInfoRows
            title="构建状态"
            rows={[
              {
                label: "最后信号时间",
                value: formatDateTime(profile.lastSignalAt),
              },
              {
                label: "最后构建时间",
                value: formatDateTime(profile.lastBuiltAt),
              },
              {
                label: "最后投影时间",
                value: formatDateTime(profile.lastProjectedAt),
              },
              { label: "最后运行 ID", value: profile.lastRunId ?? "暂无" },
            ]}
          />
          <AdminInfoRows
            title="信号覆盖"
            rows={[
              {
                label: "覆盖面",
                value: joinList(
                  profile.sourceCoverage.coveredSurfaces.map((item) =>
                    translateSurface(item),
                  ),
                ),
              },
              {
                label: "缺失面",
                value: joinList(
                  profile.sourceCoverage.missingSurfaces.map((item) =>
                    translateSurface(item),
                  ),
                ),
              },
              { label: "当前 focus", value: joinList(profile.liveState.focus) },
              {
                label: "活跃主题",
                value: joinList(profile.liveState.activeTopics),
              },
            ]}
          />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileStatePanel
          title="Live State"
          subtitle="短窗口内最活跃、最即时的状态层"
          summaryRows={[
            { label: "情绪", value: profile.liveState.mood || "暂无" },
            { label: "能量", value: profile.liveState.energy || "暂无" },
            {
              label: "社交温度",
              value: profile.liveState.socialTemperature || "暂无",
            },
          ]}
          groups={[
            { label: "当前 focus", items: profile.liveState.focus },
            { label: "活跃主题", items: profile.liveState.activeTopics },
            { label: "Open Loops", items: profile.liveState.openLoops },
          ]}
        />
        <ProfileStatePanel
          title="Recent State"
          subtitle="近期重复出现的目标、摩擦和偏好信号"
          groups={[
            { label: "近期目标", items: profile.recentState.recentGoals },
            { label: "近期摩擦", items: profile.recentState.recentFriction },
            {
              label: "偏好信号",
              items: profile.recentState.recentPreferenceSignals,
            },
            {
              label: "关系信号",
              items: profile.recentState.recentRelationshipSignals,
            },
            {
              label: "Recurring Topics",
              items: profile.recentState.recurringTopics,
            },
          ]}
        />
      </div>

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader title="Stable Core" />
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <AdminMiniPanel title="身份摘要" className="bg-white/90">
            <div className="text-sm leading-7 text-[color:var(--text-secondary)]">
              {profile.stableCore.identitySummary || "暂无稳定身份摘要。"}
            </div>
          </AdminMiniPanel>
          <div className="grid gap-4 md:grid-cols-2">
            <AdminMiniPanel title="沟通方式">
              <PillList items={profile.stableCore.communicationStyle} />
            </AdminMiniPanel>
            <AdminMiniPanel title="决策方式">
              <PillList items={profile.stableCore.decisionStyle} />
            </AdminMiniPanel>
            <AdminMiniPanel title="偏好模型">
              <PillList items={profile.stableCore.preferenceModel} />
            </AdminMiniPanel>
            <AdminMiniPanel title="社交姿态">
              <PillList items={profile.stableCore.socialPosture} />
            </AdminMiniPanel>
            <AdminMiniPanel title="日常模式">
              <PillList items={profile.stableCore.routinePatterns} />
            </AdminMiniPanel>
            <AdminMiniPanel title="边界与风险">
              <PillList
                items={[
                  ...profile.stableCore.boundaries,
                  ...profile.stableCore.riskTolerance,
                ]}
              />
            </AdminMiniPanel>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="真实世界回流"
            actions={
              <StatusPill tone={realWorld.latestBrief ? "healthy" : "muted"}>
                {realWorld.latestBrief ? "已有最新简报" : "暂无简报"}
              </StatusPill>
            }
          />
          <div className="mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <MetricCard
                label="接纳条目"
                value={realWorld.stats.acceptedItems}
              />
              <MetricCard
                label="活跃简报"
                value={realWorld.stats.activeBriefs}
              />
            </div>
            <AdminInfoRows
              title="回流状态"
              rows={[
                {
                  label: "最近条目时间",
                  value: formatDateTime(realWorld.stats.latestAcceptedAt),
                },
                {
                  label: "最近简报时间",
                  value: formatDateTime(realWorld.stats.latestBriefAt),
                },
                {
                  label: "Query Preview",
                  value: joinList(realWorld.queryPreview),
                },
                {
                  label: "Need Discovery 上游",
                  value: realWorld.rules.feedNeedDiscoveryEnabled
                    ? "已启用"
                    : "已关闭",
                },
              ]}
            />
            {realWorld.latestBrief ? (
              <RealWorldBriefPanel brief={realWorld.latestBrief} compact />
            ) : (
              <AdminEmptyState
                title="还没有外部简报"
                description="先手动执行一次真实世界回流，后台会把外部条目整理成一份可读简报。"
              />
            )}
          </div>
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader title="好友需求上游" />
          <div className="mt-4">
            {needDiscoveryQuery.isLoading ? (
              <LoadingBlock label="正在读取好友需求发现概览..." />
            ) : needDiscoveryQuery.isError &&
              needDiscoveryQuery.error instanceof Error ? (
              <ErrorBlock message={needDiscoveryQuery.error.message} />
            ) : needDiscoveryQuery.data ? (
              <NeedDiscoverySnapshotPanel detail={needDiscoveryQuery.data} />
            ) : (
              <AdminEmptyState
                title="需求发现概览暂不可用"
                description="后端 need-discovery 模块未返回数据。"
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ProjectionWorkspace({
  profile,
  projectionTab,
  onProjectionTabChange,
  selectedProjection,
}: {
  profile: CyberAvatarProfile;
  projectionTab: ProjectionTab;
  onProjectionTabChange: (value: ProjectionTab) => void;
  selectedProjection: (typeof PROJECTION_SECTIONS)[number];
}) {
  const selectedValue = profile.promptProjection[projectionTab];

  return (
    <div className="space-y-6">
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title="Prompt Projection Catalog"
          actions={<StatusPill tone="muted">下游链路已标注</StatusPill>}
        />
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="space-y-3">
            {PROJECTION_SECTIONS.map((section) => {
              const value = profile.promptProjection[section.key];
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => onProjectionTabChange(section.key)}
                  className={[
                    "w-full rounded-[22px] border px-4 py-4 text-left transition",
                    section.key === projectionTab
                      ? "border-[color:var(--border-brand)] bg-white shadow-[var(--shadow-soft)]"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[color:var(--border-subtle)] hover:bg-white/90",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {section.label}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[color:var(--text-secondary)]">
                        {section.description}
                      </div>
                    </div>
                    <StatusPill tone={value.trim() ? "healthy" : "muted"}>
                      {value.trim() ? "已生成" : "空"}
                    </StatusPill>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <AdminValueCard
                      label="长度"
                      value={`${value.trim().length} 字`}
                    />
                    <AdminValueCard
                      label="下游"
                      value={`${section.consumers.length} 条`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <Card className="bg-white/90">
            <AdminSectionHeader
              title={selectedProjection.label}
              actions={
                <StatusPill tone={selectedValue.trim() ? "healthy" : "muted"}>
                  {selectedValue.trim() ? "当前生效中" : "当前为空"}
                </StatusPill>
              }
            />
            <div className="mt-4 grid gap-4">
              <AdminSoftBox>{selectedProjection.description}</AdminSoftBox>
              <AdminInfoRows
                title="下游消费链路"
                rows={[
                  {
                    label: "影响范围",
                    value: joinList(selectedProjection.consumers),
                  },
                  {
                    label: "建议检查",
                    value:
                      selectedProjection.key === "memoryBlock"
                        ? "关注过长或过泛，避免把短窗口信息再次稀释。"
                        : selectedProjection.key === "coreInstruction"
                          ? "优先检查边界、口吻和长期稳定偏好是否被正确收口。"
                          : "查看对应下游链路是否出现行为偏差，再回看这段内容。",
                  },
                ]}
              />
              <AdminCodeBlock
                value={selectedValue || "暂无"}
                className="min-h-[360px]"
              />
            </div>
          </Card>
        </div>
      </Card>
    </div>
  );
}

function EvidenceWorkspace({
  overview,
  realWorld,
  needDiscoveryQuery,
  evidenceTab,
  onEvidenceTabChange,
  selectedRunId,
  onSelectRunId,
  activeRun,
  runDetailQuery,
}: {
  overview: CyberAvatarOverview;
  realWorld: CyberAvatarRealWorldOverview;
  needDiscoveryQuery: UseQueryResult<NeedDiscoveryOverview>;
  evidenceTab: EvidenceTab;
  onEvidenceTabChange: (value: EvidenceTab) => void;
  selectedRunId: string;
  onSelectRunId: (value: string) => void;
  activeRun: CyberAvatarRunDetail | undefined;
  runDetailQuery: UseQueryResult<CyberAvatarRunDetail>;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title="运行证据与输入样本" />
      <div className="mt-4 space-y-4">
        <AdminTabs
          tabs={EVIDENCE_TABS}
          activeKey={evidenceTab}
          onChange={(key) => onEvidenceTabChange(key as EvidenceTab)}
        />

        {evidenceTab === "runs" ? (
          <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
            <div className="space-y-3">
              {overview.recentRuns.length ? (
                overview.recentRuns.map((run) => (
                  <AdminRecordCard
                    key={run.id}
                    title={`${translateRunMode(run.mode)} · v${run.profileVersion}`}
                    badges={
                      <StatusPill tone={resolveRunTone(run.status)}>
                        {run.status}
                      </StatusPill>
                    }
                    meta={`触发方式 ${run.trigger} · ${formatDateTime(run.createdAt)}`}
                    description={`处理信号 ${run.signalCount} 条${run.skipReason ? ` · 跳过原因 ${run.skipReason}` : ""}`}
                    actions={
                      <Button
                        variant={
                          selectedRunId === run.id ? "primary" : "secondary"
                        }
                        size="sm"
                        onClick={() => onSelectRunId(run.id)}
                      >
                        查看详情
                      </Button>
                    }
                    className={
                      selectedRunId === run.id
                        ? "border-[color:var(--border-brand)]"
                        : undefined
                    }
                  />
                ))
              ) : (
                <AdminEmptyState
                  title="还没有运行记录"
                  description="先手动跑一次增量刷新或深度刷新，后台才会留下可观测的 run 快照。"
                />
              )}
            </div>
            <div>
              {runDetailQuery.isLoading ? (
                <LoadingBlock label="正在读取 run 详情..." />
              ) : runDetailQuery.isError &&
                runDetailQuery.error instanceof Error ? (
                <ErrorBlock message={runDetailQuery.error.message} />
              ) : activeRun ? (
                <CyberAvatarRunDetailPanel detail={activeRun} />
              ) : (
                <AdminEmptyState
                  title="未选择运行记录"
                  description="从左侧点开一条运行记录，就能看到输入快照、聚合结果、提示词和 merge diff。"
                />
              )}
            </div>
          </div>
        ) : null}

        {evidenceTab === "signals" ? (
          <div className="space-y-3">
            {overview.recentSignals.length ? (
              overview.recentSignals.map((signal) => (
                <AdminRecordCard
                  key={signal.id}
                  title={`${translateSignalType(signal.signalType)} · ${translateSurface(signal.sourceSurface)}`}
                  badges={
                    <StatusPill tone={resolveSignalTone(signal.status)}>
                      {signal.status}
                    </StatusPill>
                  }
                  meta={`${formatDateTime(signal.occurredAt)} · weight ${signal.weight}`}
                  description={signal.summaryText}
                  details={
                    signal.payload ? (
                      <AdminCodeBlock
                        value={safePrettyJson(signal.payload)}
                        className="max-h-56 overflow-y-auto"
                      />
                    ) : (
                      <AdminMetaText>当前无 payload</AdminMetaText>
                    )
                  }
                />
              ))
            ) : (
              <AdminEmptyState
                title="还没有行为信号"
                description="等用户产生聊天、朋友圈、广场或社交操作之后，这里会开始积累赛博分身的输入证据。"
              />
            )}
          </div>
        ) : null}

        {evidenceTab === "items" ? (
          <div className="space-y-3">
            {realWorld.recentItems.length ? (
              realWorld.recentItems.map((item) => (
                <AdminRecordCard
                  key={item.id}
                  title={item.title}
                  badges={
                    <StatusPill tone={resolveRealWorldItemTone(item.status)}>
                      {item.status}
                    </StatusPill>
                  }
                  meta={`${item.sourceName} · ${formatDateTime(item.publishedAt || item.capturedAt)}`}
                  description={item.normalizedSummary}
                  details={
                    <AdminInfoRows
                      title="条目详情"
                      rows={[
                        { label: "查询", value: item.queryText },
                        { label: "标签", value: joinList(item.topicTags) },
                        {
                          label: "综合分",
                          value: item.compositeScore.toFixed(2),
                        },
                      ]}
                    />
                  }
                />
              ))
            ) : (
              <AdminEmptyState
                title="还没有回流条目"
                description="拉取真实世界信息后，这里会显示被接纳或被过滤的外部条目。"
              />
            )}
          </div>
        ) : null}

        {evidenceTab === "briefs" ? (
          <div className="space-y-4">
            {realWorld.latestBrief ? (
              <RealWorldBriefPanel brief={realWorld.latestBrief} />
            ) : (
              <AdminEmptyState
                title="还没有外部简报"
                description="先手动执行一次真实世界回流，后台会把外部条目整理成一份可读简报。"
              />
            )}

            {realWorld.recentBriefs.length > 1 ? (
              <div className="grid gap-3">
                {realWorld.recentBriefs
                  .filter((brief) => brief.id !== realWorld.latestBrief?.id)
                  .map((brief) => (
                    <AdminRecordCard
                      key={brief.id}
                      title={brief.title}
                      badges={
                        <StatusPill
                          tone={brief.status === "active" ? "healthy" : "muted"}
                        >
                          {brief.status}
                        </StatusPill>
                      }
                      meta={`${brief.briefDate} · ${formatDateTime(brief.createdAt)}`}
                      description={brief.summary}
                    />
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {evidenceTab === "need-discovery" ? (
          <div>
            {needDiscoveryQuery.isLoading ? (
              <LoadingBlock label="正在读取好友需求发现概览..." />
            ) : needDiscoveryQuery.isError &&
              needDiscoveryQuery.error instanceof Error ? (
              <ErrorBlock message={needDiscoveryQuery.error.message} />
            ) : needDiscoveryQuery.data ? (
              <NeedDiscoverySnapshotPanel detail={needDiscoveryQuery.data} />
            ) : (
              <AdminEmptyState
                title="需求发现概览暂不可用"
                description="后端 need-discovery 模块未返回数据。"
              />
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function RulesWorkspace({
  parsedRules,
  rulesJsonDraft,
  onRulesJsonDraftChange,
  rulesTab,
  onRulesTabChange,
  isRulesDirty,
  patchRulesDraft,
}: {
  parsedRules: CyberAvatarRuntimeRules | null;
  rulesJsonDraft: string;
  onRulesJsonDraftChange: (value: string) => void;
  rulesTab: RulesTab;
  onRulesTabChange: (value: RulesTab) => void;
  isRulesDirty: boolean;
  patchRulesDraft: (
    updater: (current: CyberAvatarRuntimeRules) => CyberAvatarRuntimeRules,
  ) => void;
}) {
  const enabledSourceCount = parsedRules
    ? Object.values(parsedRules.sourceToggles).filter(Boolean).length
    : 0;

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title="规则与提示词配置"
        actions={<AdminDraftStatusPill ready dirty={isRulesDirty} />}
      />
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <AdminInfoRows
            title="当前草稿快照"
            rows={[
              {
                label: "自动建模",
                value: parsedRules?.enabled ? "已启用" : "已关闭",
              },
              {
                label: "采集来源",
                value: parsedRules
                  ? `${enabledSourceCount} 项已启用`
                  : "草稿无效",
              },
              {
                label: "真实世界回流",
                value: parsedRules?.interaction.realWorldSyncEnabled
                  ? "已启用"
                  : "已关闭",
              },
              {
                label: "提示词模板",
                value: parsedRules ? "可结构化编辑" : "先修复 JSON",
              },
            ]}
          />
          <AdminCallout
            tone={parsedRules ? "info" : "warning"}
            title={parsedRules ? "推荐编辑方式" : "当前草稿有格式错误"}
            description={
              parsedRules
                ? "高频开关、调度参数和提示词模板优先在结构化表单里改；需要一次性改很多字段时再切到原始 JSON。"
                : "当前 JSON 草稿无法解析，结构化编辑会被锁住。先切到“原始 JSON”修复格式，页面会自动恢复结构化视图。"
            }
          />
        </div>

        <AdminTabs
          tabs={RULE_TABS}
          activeKey={rulesTab}
          onChange={(key) => onRulesTabChange(key as RulesTab)}
        />

        {rulesTab === "common" ? (
          parsedRules ? (
            <div className="space-y-6">
              <Card className="bg-white/90">
                <AdminSectionHeader title="运行总开关" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <AdminToggle
                    label="启用赛博分身"
                    checked={parsedRules.enabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        enabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label="启用采集"
                    checked={parsedRules.captureEnabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        captureEnabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label="启用增量刷新"
                    checked={parsedRules.incrementalUpdateEnabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        incrementalUpdateEnabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label="启用深度刷新"
                    checked={parsedRules.deepRefreshEnabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        deepRefreshEnabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label="启用 Prompt 投影"
                    checked={parsedRules.projectionEnabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        projectionEnabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label="暂停自动更新"
                    checked={parsedRules.pauseAutoUpdates}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        pauseAutoUpdates: checked,
                      }))
                    }
                  />
                </div>
              </Card>

              <Card className="bg-white/90">
                <AdminSectionHeader title="调度参数" />
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <AdminTextField
                    label="增量最小信号数"
                    type="number"
                    value={parsedRules.scheduling.minSignalsPerIncrementalRun}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        scheduling: {
                          ...current.scheduling,
                          minSignalsPerIncrementalRun: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="增量最大信号数"
                    type="number"
                    value={parsedRules.scheduling.maxSignalsPerIncrementalRun}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        scheduling: {
                          ...current.scheduling,
                          maxSignalsPerIncrementalRun: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="增量最小间隔(分钟)"
                    type="number"
                    value={
                      parsedRules.scheduling.minMinutesBetweenIncrementalRuns
                    }
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        scheduling: {
                          ...current.scheduling,
                          minMinutesBetweenIncrementalRuns: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="增量扫描周期(分钟)"
                    type="number"
                    value={parsedRules.scheduling.incrementalScanEveryMinutes}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        scheduling: {
                          ...current.scheduling,
                          incrementalScanEveryMinutes: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="深度刷新周期(小时)"
                    type="number"
                    value={parsedRules.scheduling.deepRefreshEveryHours}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        scheduling: {
                          ...current.scheduling,
                          deepRefreshEveryHours: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="近期窗口(天)"
                    type="number"
                    value={parsedRules.scheduling.recentWindowDays}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        scheduling: {
                          ...current.scheduling,
                          recentWindowDays: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="稳定核心窗口(天)"
                    type="number"
                    value={parsedRules.scheduling.stableCoreWindowDays}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        scheduling: {
                          ...current.scheduling,
                          stableCoreWindowDays: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="全量重建窗口(天)"
                    type="number"
                    value={parsedRules.scheduling.fullRebuildWindowDays}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        scheduling: {
                          ...current.scheduling,
                          fullRebuildWindowDays: Number(value),
                        },
                      }))
                    }
                  />
                </div>
              </Card>

              <Card className="bg-white/90">
                <AdminSectionHeader title="稳定核心合并规则" />
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <AdminTextField
                    label="稳定核心阈值"
                    type="number"
                    value={parsedRules.mergeRules.stableCoreChangeThreshold}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        mergeRules: {
                          ...current.mergeRules,
                          stableCoreChangeThreshold: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="边界变化阈值"
                    type="number"
                    value={parsedRules.mergeRules.boundaryChangeThreshold}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        mergeRules: {
                          ...current.mergeRules,
                          boundaryChangeThreshold: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="偏好衰减(天)"
                    type="number"
                    value={parsedRules.mergeRules.preferenceDecayDays}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        mergeRules: {
                          ...current.mergeRules,
                          preferenceDecayDays: Number(value),
                        },
                      }))
                    }
                  />
                  <AdminTextField
                    label="Open Loop 衰减(天)"
                    type="number"
                    value={parsedRules.mergeRules.openLoopDecayDays}
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        mergeRules: {
                          ...current.mergeRules,
                          openLoopDecayDays: Number(value),
                        },
                      }))
                    }
                  />
                </div>
              </Card>
            </div>
          ) : (
            <AdminCallout
              tone="warning"
              title="结构化编辑不可用"
              description="当前草稿 JSON 无法解析，先去“原始 JSON”修复。"
            />
          )
        ) : null}

        {rulesTab === "sources" ? (
          parsedRules ? (
            <div className="space-y-6">
              <Card className="bg-white/90">
                <AdminSectionHeader title="信号来源开关" />
                <div className="mt-4 flex flex-wrap gap-2">
                  {SOURCE_TOGGLE_FIELDS.map((field) => (
                    <AdminToggle
                      key={field.key}
                      label={field.label}
                      checked={parsedRules.sourceToggles[field.key]}
                      onChange={(checked) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          sourceToggles: {
                            ...current.sourceToggles,
                            [field.key]: checked,
                          },
                        }))
                      }
                    />
                  ))}
                </div>
              </Card>

              <Card className="bg-white/90">
                <AdminSectionHeader title="真实世界回流与上游联动" />
                <div className="mt-4 space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <AdminToggle
                      label="启用交互规则"
                      checked={parsedRules.interaction.enabled}
                      onChange={(checked) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            enabled: checked,
                          },
                        }))
                      }
                    />
                    <AdminToggle
                      label="启用真实世界同步"
                      checked={parsedRules.interaction.realWorldSyncEnabled}
                      onChange={(checked) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            realWorldSyncEnabled: checked,
                          },
                        }))
                      }
                    />
                    <AdminToggle
                      label="回流生成信号"
                      checked={parsedRules.interaction.createSignals}
                      onChange={(checked) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            createSignals: checked,
                          },
                        }))
                      }
                    />
                    <AdminToggle
                      label="喂给 Need Discovery"
                      checked={parsedRules.interaction.feedNeedDiscoveryEnabled}
                      onChange={(checked) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            feedNeedDiscoveryEnabled: checked,
                          },
                        }))
                      }
                    />
                    <AdminToggle
                      label="空结果回退 mock"
                      checked={
                        parsedRules.interaction.googleNews.fallbackToMockOnEmpty
                      }
                      onChange={(checked) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            googleNews: {
                              ...current.interaction.googleNews,
                              fallbackToMockOnEmpty: checked,
                            },
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <AdminTextField
                      label="每轮 Query 数"
                      type="number"
                      value={parsedRules.interaction.maxQueriesPerRun}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            maxQueriesPerRun: Number(value),
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="默认时效(小时)"
                      type="number"
                      value={parsedRules.interaction.defaultRecencyHours}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            defaultRecencyHours: Number(value),
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="每个 Query 最大条目"
                      type="number"
                      value={parsedRules.interaction.maxItemsPerQuery}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            maxItemsPerQuery: Number(value),
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="每轮最多接纳条目"
                      type="number"
                      value={parsedRules.interaction.maxAcceptedItemsPerRun}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            maxAcceptedItemsPerRun: Number(value),
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="每份简报最多条目"
                      type="number"
                      value={parsedRules.interaction.maxItemsPerBrief}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            maxItemsPerBrief: Number(value),
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="最低接纳分"
                      type="number"
                      value={parsedRules.interaction.minimumItemScore}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            minimumItemScore: Number(value),
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="同步周期(小时)"
                      type="number"
                      value={parsedRules.interaction.syncEveryHours}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            syncEveryHours: Number(value),
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="Google News 语言"
                      value={parsedRules.interaction.googleNews.editionLanguage}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            googleNews: {
                              ...current.interaction.googleNews,
                              editionLanguage: value,
                            },
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="Google News 地区"
                      value={parsedRules.interaction.googleNews.editionRegion}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            googleNews: {
                              ...current.interaction.googleNews,
                              editionRegion: value,
                            },
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="Google News CEID"
                      value={parsedRules.interaction.googleNews.editionCeid}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            googleNews: {
                              ...current.interaction.googleNews,
                              editionCeid: value,
                            },
                          },
                        }))
                      }
                    />
                    <AdminTextField
                      label="Google News 每轮条目"
                      type="number"
                      value={
                        parsedRules.interaction.googleNews.maxEntriesPerQuery
                      }
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            googleNews: {
                              ...current.interaction.googleNews,
                              maxEntriesPerQuery: Number(value),
                            },
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-4 xl:grid-cols-3">
                    <AdminTextArea
                      label="Owner Query Overrides"
                      value={parsedRules.interaction.ownerQueryOverrides.join(
                        "\n",
                      )}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            ownerQueryOverrides: parseLineSeparatedList(value),
                          },
                        }))
                      }
                      description="一行一个额外 Query，优先用来补手工关注主题。"
                      textareaClassName="min-h-[200px]"
                    />
                    <AdminTextArea
                      label="Source Allowlist"
                      value={parsedRules.interaction.sourceAllowlist.join("\n")}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            sourceAllowlist: parseLineSeparatedList(value),
                          },
                        }))
                      }
                      description="一行一个允许源，留空表示不过滤。"
                      textareaClassName="min-h-[200px]"
                    />
                    <AdminTextArea
                      label="Source Blocklist"
                      value={parsedRules.interaction.sourceBlocklist.join("\n")}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          interaction: {
                            ...current.interaction,
                            sourceBlocklist: parseLineSeparatedList(value),
                          },
                        }))
                      }
                      description="一行一个屏蔽源，用来快速剔除低质量来源。"
                      textareaClassName="min-h-[200px]"
                    />
                  </div>

                  <AdminMiniPanel title="Signal Weights" tone="soft">
                    <AdminCodeBlock
                      value={safePrettyJson(parsedRules.signalWeights)}
                    />
                  </AdminMiniPanel>
                </div>
              </Card>
            </div>
          ) : (
            <AdminCallout
              tone="warning"
              title="结构化编辑不可用"
              description="当前草稿 JSON 无法解析，先去“原始 JSON”修复。"
            />
          )
        ) : null}

        {rulesTab === "prompts" ? (
          parsedRules ? (
            <div className="space-y-6">
              <Card className="bg-white/90">
                <AdminSectionHeader title="建模与投影模板" />
                <div className="mt-4 grid gap-4">
                  {PROMPT_TEMPLATE_FIELDS.map((field) => (
                    <AdminTextArea
                      key={field.key}
                      label={field.label}
                      value={parsedRules.promptTemplates[field.key]}
                      onChange={(value) =>
                        patchRulesDraft((current) => ({
                          ...current,
                          promptTemplates: {
                            ...current.promptTemplates,
                            [field.key]: value,
                          },
                        }))
                      }
                      description={field.description}
                      textareaClassName="min-h-[200px]"
                    />
                  ))}
                </div>
              </Card>

              <Card className="bg-white/90">
                <AdminSectionHeader title="真实世界交互模板" />
                <div className="mt-4">
                  <AdminTextArea
                    label="真实世界简报 Prompt"
                    value={
                      parsedRules.interaction.promptTemplates
                        .realWorldBriefPrompt
                    }
                    onChange={(value) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        interaction: {
                          ...current.interaction,
                          promptTemplates: {
                            ...current.interaction.promptTemplates,
                            realWorldBriefPrompt: value,
                          },
                        },
                      }))
                    }
                    description="把接纳条目整理成可读简报时使用。"
                    textareaClassName="min-h-[220px]"
                  />
                </div>
              </Card>
            </div>
          ) : (
            <AdminCallout
              tone="warning"
              title="结构化编辑不可用"
              description="当前草稿 JSON 无法解析，先去“原始 JSON”修复。"
            />
          )
        ) : null}

        {rulesTab === "json" ? (
          <Card className="bg-white/90">
            <AdminSectionHeader
              title="原始 JSON"
              actions={
                <StatusPill tone={parsedRules ? "healthy" : "warning"}>
                  {parsedRules ? "可解析" : "格式错误"}
                </StatusPill>
              }
            />
            <div className="mt-4 space-y-4">
              <AdminCallout
                tone={parsedRules ? "info" : "warning"}
                title={parsedRules ? "高级编辑模式" : "当前 JSON 无法解析"}
                description={
                  parsedRules
                    ? "适合批量改 signal weights、批量调模板或直接贴整段规则对象。这里的内容会和结构化编辑共用同一份草稿。"
                    : "先修复这里的 JSON，再回到结构化编辑。页面会自动恢复结构化表单。"
                }
              />
              <AdminTextArea
                label="赛博分身规则 JSON"
                value={rulesJsonDraft}
                onChange={onRulesJsonDraftChange}
                description="支持直接粘贴完整对象。保存前会重新做一次 JSON 解析。"
                textareaClassName="min-h-[640px] font-mono text-xs leading-6"
              />
            </div>
          </Card>
        ) : null}
      </div>
    </Card>
  );
}

function ProfileStatePanel({
  title,
  subtitle,
  summaryRows,
  groups,
}: {
  title: string;
  subtitle: string;
  summaryRows?: Array<{ label: string; value: string }>;
  groups: Array<{ label: string; items: string[] }>;
}) {
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title={title} />
      <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
        {subtitle}
      </div>
      {summaryRows?.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {summaryRows.map((row) => (
            <AdminValueCard
              key={row.label}
              label={row.label}
              value={row.value}
            />
          ))}
        </div>
      ) : null}
      <div className="mt-4 grid gap-4">
        {groups.map((group) => (
          <AdminMiniPanel key={group.label} title={group.label}>
            <PillList items={group.items} />
          </AdminMiniPanel>
        ))}
      </div>
    </Card>
  );
}

function PillList({
  items,
  emptyLabel = "暂无",
}: {
  items: string[];
  emptyLabel?: string;
}) {
  if (!items.length) {
    return <AdminMetaText>{emptyLabel}</AdminMetaText>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, index) => (
        <StatusPill key={`${item}-${index}`} tone="muted">
          {item}
        </StatusPill>
      ))}
    </div>
  );
}

function RealWorldBriefPanel({
  brief,
  compact = false,
}: {
  brief: CyberAvatarRealWorldBrief;
  compact?: boolean;
}) {
  return (
    <div className="space-y-4">
      <AdminInfoRows
        title={brief.title}
        rows={[
          { label: "简报日期", value: brief.briefDate },
          {
            label: "相关条目",
            value: brief.relatedItemIds.length
              ? String(brief.relatedItemIds.length)
              : "0",
          },
          {
            label: "Query Hints",
            value: joinList(brief.queryHints),
          },
        ]}
      />
      <AdminCodeBlock
        value={brief.summary}
        className={compact ? "max-h-52 overflow-y-auto" : undefined}
      />
      {!compact ? (
        <>
          <RunSnapshotBlock
            title="Bullet Points"
            value={{ bulletPoints: brief.bulletPoints }}
          />
          <RunSnapshotBlock
            title="Need Signals"
            value={{ needSignals: brief.needSignals }}
          />
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <AdminMiniPanel title="Bullet Points" tone="soft">
            <PillList items={brief.bulletPoints} />
          </AdminMiniPanel>
          <AdminMiniPanel title="Need Signals" tone="soft">
            <PillList items={brief.needSignals} />
          </AdminMiniPanel>
        </div>
      )}
    </div>
  );
}

function NeedDiscoverySnapshotPanel({
  detail,
}: {
  detail: NeedDiscoveryOverview;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <MetricCard label="待处理候选" value={detail.stats.pendingCandidates} />
        <MetricCard
          label="今日可生成上限"
          value={detail.config.shared.dailyCreationLimit}
        />
      </div>
      <AdminInfoRows
        title="执行配置"
        rows={[
          {
            label: "短周期模式",
            value: `${detail.config.shortInterval.executionMode} / ${detail.config.shortInterval.intervalMinutes} 分钟`,
          },
          {
            label: "日周期模式",
            value: `${detail.config.daily.executionMode} / ${detail.config.daily.runAtHour
              .toString()
              .padStart(2, "0")}:${detail.config.daily.runAtMinute
              .toString()
              .padStart(2, "0")}`,
          },
          {
            label: "允许领域",
            value:
              [
                detail.config.shared.allowMedical ? "医疗" : null,
                detail.config.shared.allowLegal ? "法律" : null,
                detail.config.shared.allowFinance ? "金融" : null,
              ]
                .filter(Boolean)
                .join(" / ") || "全部关闭",
          },
        ]}
      />
      {detail.activeCandidates.length ? (
        <div className="space-y-3">
          {detail.activeCandidates.slice(0, 4).map((candidate) => (
            <AdminRecordCard
              key={candidate.id}
              title={`${candidate.needCategory} · ${candidate.needKey}`}
              badges={<StatusPill tone="muted">{candidate.status}</StatusPill>}
              meta={`置信度 ${candidate.confidenceScore.toFixed(2)} · 优先级 ${candidate.priorityScore.toFixed(2)}`}
              description={candidate.coverageGapSummary ?? "暂无覆盖缺口摘要"}
            />
          ))}
        </div>
      ) : (
        <AdminEmptyState
          title="当前没有活跃候选"
          description="真实世界简报和用户行为会继续作为 need-discovery 的上游输入。"
        />
      )}
    </div>
  );
}

function CyberAvatarRunDetailPanel({
  detail,
}: {
  detail: CyberAvatarRunDetail;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <MetricCard label="模式" value={translateRunMode(detail.mode)} />
        <MetricCard label="处理信号" value={detail.signalCount} />
      </div>
      <AdminInfoRows
        title="执行摘要"
        rows={[
          { label: "触发方式", value: detail.trigger },
          { label: "画像版本", value: detail.profileVersion },
          { label: "开始窗口", value: formatDateTime(detail.windowStartedAt) },
          { label: "结束窗口", value: formatDateTime(detail.windowEndedAt) },
          { label: "跳过原因", value: detail.skipReason ?? "无" },
          { label: "错误信息", value: detail.errorMessage ?? "无" },
        ]}
      />
      <div className="space-y-4">
        <RunSnapshotBlock title="Input Snapshot" value={detail.inputSnapshot} />
        <RunSnapshotBlock
          title="Aggregation Payload"
          value={detail.aggregationPayload}
        />
        <RunSnapshotBlock
          title="Prompt Snapshot"
          value={detail.promptSnapshot}
        />
        <RunSnapshotBlock
          title="LLM Output Payload"
          value={detail.llmOutputPayload}
        />
        <RunSnapshotBlock title="Merge Diff" value={detail.mergeDiffPayload} />
      </div>
    </div>
  );
}

function RunSnapshotBlock({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown> | null | undefined;
}) {
  return (
    <Card className="bg-white/90">
      <AdminSectionHeader title={title} />
      <div className="mt-3">
        <AdminCodeBlock value={value ? safePrettyJson(value) : "暂无"} />
      </div>
    </Card>
  );
}
