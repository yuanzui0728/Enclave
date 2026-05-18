import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
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
  AdminSoftBox,
  AdminTabs,
  AdminTextArea,
  AdminTextField,
  AdminToggle,
  AdminValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { formatAdminDateTime as formatLocalizedDateTime } from "../lib/format";

type WorkspaceTab = "overview" | "projection" | "evidence" | "rules";
type EvidenceTab = "runs" | "signals" | "items" | "briefs" | "need-discovery";
type RulesTab = "common" | "sources" | "prompts" | "json";
type ProjectionTab = keyof CyberAvatarPromptProjection;

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: ReturnType<typeof msg> }> = [
  { key: "overview", label: msg`运营总览` },
  { key: "projection", label: msg`Prompt 投影` },
  { key: "evidence", label: msg`运行证据` },
  { key: "rules", label: msg`规则编辑` },
];

const EVIDENCE_TABS: Array<{ key: EvidenceTab; label: ReturnType<typeof msg> }> = [
  { key: "runs", label: msg`运行记录` },
  { key: "signals", label: msg`最近信号` },
  { key: "items", label: msg`外部条目` },
  { key: "briefs", label: msg`外部简报` },
  { key: "need-discovery", label: msg`需求上游` },
];

const RULE_TABS: Array<{ key: RulesTab; label: ReturnType<typeof msg> }> = [
  { key: "common", label: msg`常用开关` },
  { key: "sources", label: msg`来源与回流` },
  { key: "prompts", label: msg`提示词模板` },
  { key: "json", label: msg`原始 JSON` },
];

const PROJECTION_SECTIONS: Array<{
  key: ProjectionTab;
  label: ReturnType<typeof msg>;
  description: ReturnType<typeof msg>;
  consumers: Array<ReturnType<typeof msg>>;
}> = [
  {
    key: "coreInstruction",
    label: msg`核心约束`,
    description: msg`用户长期稳定边界、偏好和判断习惯的收口段。`,
    consumers: [
      msg`self 单聊`,
      msg`self 群聊`,
      msg`主动跟进`,
      msg`动作运行时`,
      msg`scheduler 主动消息`,
    ],
  },
  {
    key: "worldInteractionPrompt",
    label: msg`世界内互动`,
    description: msg`用户在这个世界里怎么聊天、怎么回应、怎么接人。`,
    consumers: [msg`self 单聊`, msg`self 群聊`, msg`主动跟进`, msg`scheduler 主动消息`],
  },
  {
    key: "realWorldInteractionPrompt",
    label: msg`真实世界互动`,
    description: msg`用户和现实服务、现实信息之间的交互倾向。`,
    consumers: [msg`动作运行时`],
  },
  {
    key: "proactivePrompt",
    label: msg`主动跟进`,
    description: msg`用户更愿意被怎样提醒、推进和回捞未闭环事项。`,
    consumers: [msg`主动跟进`, msg`scheduler 主动消息`],
  },
  {
    key: "actionPlanningPrompt",
    label: msg`动作规划`,
    description: msg`用户授权行动助理去做真实世界动作时的偏好和约束。`,
    consumers: [msg`动作运行时`],
  },
  {
    key: "memoryBlock",
    label: msg`赛博分身记忆`,
    description: msg`供下游链路读取的压缩上下文块，用来补足短窗口。`,
    consumers: [
      msg`self 单聊`,
      msg`self 群聊`,
      msg`主动跟进`,
      msg`动作运行时`,
      msg`scheduler 主动消息`,
      msg`需求发现`,
    ],
  },
];

const RUN_MODE_LABELS: Record<CyberAvatarRunSummary["mode"], ReturnType<typeof msg>> = {
  incremental: msg`增量刷新`,
  deep_refresh: msg`深度刷新`,
  full_rebuild: msg`全量重建`,
  projection_only: msg`只重投影`,
  preview: msg`预览`,
  real_world_sync: msg`真实世界回流`,
};

const SIGNAL_TYPE_LABELS: Record<CyberAvatarSignal["signalType"], ReturnType<typeof msg>> = {
  direct_message: msg`单聊消息`,
  group_message: msg`群聊消息`,
  moment_post: msg`朋友圈发布`,
  feed_post: msg`广场动态`,
  channel_post: msg`视频号内容`,
  feed_interaction: msg`内容互动`,
  friendship_event: msg`社交关系变化`,
  owner_profile_update: msg`世界主人资料更新`,
  search_activity: msg`搜索行为`,
  favorite_action: msg`收藏动作`,
  real_world_action: msg`真实世界动作`,
  location_update: msg`位置更新`,
  real_world_item: msg`真实世界条目`,
  real_world_brief: msg`真实世界简报`,
};

const SURFACE_LABELS: Record<string, ReturnType<typeof msg>> = {
  chat: msg`聊天`,
  group: msg`群聊`,
  moments: msg`朋友圈`,
  feed: msg`广场`,
  channels: msg`视频号`,
  social: msg`社交`,
  owner: msg`世界主人`,
  real_world: msg`真实世界`,
};

const SOURCE_TOGGLE_FIELDS: Array<{
  key: keyof CyberAvatarRuntimeRules["sourceToggles"];
  label: ReturnType<typeof msg>;
}> = [
  { key: "includeDirectMessages", label: msg`单聊消息` },
  { key: "includeGroupMessages", label: msg`群聊消息` },
  { key: "includeMomentPosts", label: msg`朋友圈` },
  { key: "includeFeedPosts", label: msg`广场动态` },
  { key: "includeChannelPosts", label: msg`视频号` },
  { key: "includeFeedInteractions", label: msg`内容互动` },
  { key: "includeFriendshipEvents", label: msg`社交关系` },
  { key: "includeOwnerProfileUpdates", label: msg`资料更新` },
  { key: "includeSearchActivity", label: msg`搜索行为` },
  { key: "includeFavoriteActions", label: msg`收藏动作` },
  { key: "includeRealWorldActions", label: msg`真实世界动作` },
  { key: "includeLocationUpdates", label: msg`位置更新` },
  { key: "includeRealWorldItems", label: msg`真实世界条目` },
  { key: "includeRealWorldBriefs", label: msg`真实世界简报` },
];

const PROMPT_TEMPLATE_FIELDS: Array<{
  key: keyof CyberAvatarRuntimeRules["promptTemplates"];
  label: ReturnType<typeof msg>;
  description: ReturnType<typeof msg>;
}> = [
  {
    key: "incrementalDigestPrompt",
    label: msg`增量刷新 Prompt`,
    description: msg`面向 pending signals 的快速画像更新指令。`,
  },
  {
    key: "deepRefreshPrompt",
    label: msg`深度刷新 Prompt`,
    description: msg`面向较大窗口历史信号的重构指令。`,
  },
  {
    key: "projectionCoreInstructionTemplate",
    label: msg`核心约束模板`,
    description: msg`生成 coreInstruction 的模板。`,
  },
  {
    key: "projectionWorldInteractionTemplate",
    label: msg`世界内互动模板`,
    description: msg`生成 worldInteractionPrompt 的模板。`,
  },
  {
    key: "projectionRealWorldInteractionTemplate",
    label: msg`真实世界互动模板`,
    description: msg`生成 realWorldInteractionPrompt 的模板。`,
  },
  {
    key: "projectionProactiveTemplate",
    label: msg`主动跟进模板`,
    description: msg`生成 proactivePrompt 的模板。`,
  },
  {
    key: "projectionActionPlanningTemplate",
    label: msg`动作规划模板`,
    description: msg`生成 actionPlanningPrompt 的模板。`,
  },
  {
    key: "projectionMemoryTemplate",
    label: msg`记忆块模板`,
    description: msg`生成 memoryBlock 的模板。`,
  },
];

function safePrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatDateTime(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
    "none",
  );
}

function joinList(items: string[], emptyLabel = translateRuntimeMessage(msg`暂无`)) {
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
  return translateRuntimeMessage(RUN_MODE_LABELS[mode] ?? msg`${mode}`);
}

function translateSignalType(type: CyberAvatarSignal["signalType"]) {
  return translateRuntimeMessage(SIGNAL_TYPE_LABELS[type] ?? msg`${type}`);
}

function translateSurface(surface: string) {
  const label = SURFACE_LABELS[surface];
  return label ? translateRuntimeMessage(label) : surface;
}

function buildOperatorWarning(input: {
  profileStatus: string;
  hasRulesParseError: boolean;
  pendingSignalCount: number;
  missingSurfaces: string[];
  hasLatestBrief: boolean;
  realWorldEnabled: boolean;
  isRulesDirty: boolean;
}): {
  tone: "warning" | "muted";
  title: string;
  notes: string[];
} | null {
  const notes: string[] = [];
  let hasBlocker = false;

  if (input.hasRulesParseError) {
    notes.push(
      translateRuntimeMessage(
        msg`规则草稿 JSON 当前无法解析，结构化编辑已不可用，先在原始 JSON 里修复格式。`,
      ),
    );
    hasBlocker = true;
  }
  if (input.profileStatus !== "ready") {
    notes.push(
      translateRuntimeMessage(
        msg`画像当前状态为 ${input.profileStatus}，建议检查最近一次 run 的输入快照和跳过/失败原因。`,
      ),
    );
    hasBlocker = true;
  }
  if (input.pendingSignalCount > 0) {
    notes.push(
      translateRuntimeMessage(
        msg`待处理信号 ${input.pendingSignalCount} 条尚未消化。`,
      ),
    );
  }
  if (input.missingSurfaces.length > 0) {
    notes.push(
      translateRuntimeMessage(
        msg`缺失数据源：${input.missingSurfaces.map((surface) => translateSurface(surface)).join("、")}`,
      ),
    );
  }
  if (!input.hasLatestBrief) {
    notes.push(translateRuntimeMessage(msg`尚未生成最新真实世界简报。`));
  }
  if (!input.realWorldEnabled) {
    notes.push(
      translateRuntimeMessage(
        msg`真实世界回流总开关当前为关闭，相关运行将跳过。`,
      ),
    );
  }
  if (input.isRulesDirty) {
    notes.push(translateRuntimeMessage(msg`当前规则有未保存的草稿改动。`));
  }

  if (notes.length === 0) return null;

  const tone: "warning" | "muted" = hasBlocker ? "warning" : "muted";
  const title = hasBlocker
    ? translateRuntimeMessage(msg`赛博分身运行存在阻塞警告`)
    : translateRuntimeMessage(msg`赛博分身运行有提示`);

  return { tone, title, notes };
}

export function CyberAvatarPage() {
  const t = translateRuntimeMessage;
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
    return <LoadingBlock label={t(msg`正在读取赛博分身概览...`)} />;
  }

  if (overviewQuery.isError && overviewQuery.error instanceof Error) {
    return <ErrorBlock message={overviewQuery.error.message} />;
  }

  if (!overviewQuery.data) {
    return (
      <AdminEmptyState
        title={t(msg`赛博分身概览暂不可用`)}
        description={t(msg`后台还没有拿到画像、规则或运行记录。先检查后端 cyber-avatar 模块是否已成功加载。`)}
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

  const operatorWarning = buildOperatorWarning({
    profileStatus: profile.status,
    hasRulesParseError: Boolean(rulesJsonDraft.trim()) && !parsedRules,
    pendingSignalCount: profile.pendingSignalCount,
    missingSurfaces: profile.sourceCoverage.missingSurfaces,
    hasLatestBrief: Boolean(realWorld.latestBrief),
    // 用服务端已生效的 rules 而非 parsedRules——后者在 JSON 解析失败时为 null，
    // 会让"draft 解析失败"误报成"服务端关闭了真实世界回流"。
    realWorldEnabled: Boolean(
      overview.rules.interaction?.realWorldSyncEnabled,
    ),
    isRulesDirty,
  });

  function handleSaveRules() {
    if (!parsedRules) {
      setRulesParseError(t(msg`规则 JSON 解析失败，先修正格式再保存。`));
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
        t(msg`当前 JSON 草稿格式错误，先到”原始 JSON”里修复后再使用结构化编辑。`),
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
    { label: t(msg`画像版本`), value: profile.version },
    { label: t(msg`待处理信号`), value: profile.pendingSignalCount },
    {
      label: t(msg`最后信号时间`),
      value: profile.lastSignalAt ? formatDateTime(profile.lastSignalAt) : t(msg`暂无`),
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="Cyber Avatar Ops"
        title={t(msg`赛博分身建模、回流与运营工作台`)}
        description={t(msg`把用户在世界内的行为信号、画像状态、Prompt 投影、真实世界回流与 need-discovery 上游统一收进一个运营工作区，方便快速判断当前状态、定位异常并调整规则。`)}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={!isRulesDirty}
              onClick={resetRulesDraft}
            >
              {t(msg`重置草稿`)}
            </Button>
            <Button
              variant="primary"
              disabled={
                !isRulesDirty || !parsedRules || saveRulesMutation.isPending
              }
              onClick={handleSaveRules}
            >
              {saveRulesMutation.isPending ? t(msg`保存中...`) : t(msg`保存规则`)}
            </Button>
          </>
        }
        metrics={heroMetrics}
      />

      {operatorWarning ? (
        <AdminCallout
          tone={operatorWarning.tone === "warning" ? "warning" : "info"}
          title={operatorWarning.title}
          description={
            <ul className="ml-4 list-disc space-y-1">
              {operatorWarning.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          }
        />
      ) : null}

      <CyberAvatarRunActionBar runMutation={runMutation} />

      {saveRulesMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title={t(msg`赛博分身规则已保存`)}
          description={t(msg`新的抓取开关、调度参数和提示词模板已经写入系统配置。`)}
        />
      ) : null}
      {saveRulesMutation.isError && saveRulesMutation.error instanceof Error ? (
        <ErrorBlock message={saveRulesMutation.error.message} />
      ) : null}
      {rulesParseError ? <ErrorBlock message={rulesParseError} /> : null}
      {runMutation.isSuccess ? (
        <AdminActionFeedback
          tone="success"
          title={t(msg`运行已完成：${translateRunMode(runMutation.data.mode)}`)}
          description={t(msg`状态 ${runMutation.data.status}，处理了 ${runMutation.data.signalCount} 条信号。`)}
        />
      ) : null}
      {runMutation.isError && runMutation.error instanceof Error ? (
        <ErrorBlock message={runMutation.error.message} />
      ) : null}

      <AdminTabs
        tabs={WORKSPACE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
        activeKey={workspaceTab}
        onChange={(key) => setWorkspaceTab(key as WorkspaceTab)}
      />

      {workspaceTab === "overview" ? (
        <OverviewWorkspace
          profile={profile}
          realWorld={realWorld}
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
  );
}

type RunMode =
  | "incremental"
  | "deep_refresh"
  | "full_rebuild"
  | "project"
  | "real_world";

function CyberAvatarRunActionBar({
  runMutation,
}: {
  runMutation: {
    mutate: (mode: RunMode) => void;
    isPending: boolean;
    variables: RunMode | undefined;
  };
}) {
  const t = translateRuntimeMessage;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const isPending = runMutation.isPending;
  const activeMode = runMutation.variables;
  const incrementalActive = activeMode === "incremental";

  const moreActions: Array<{ mode: RunMode; label: string }> = [
    { mode: "deep_refresh", label: t(msg`深度刷新`) },
    { mode: "full_rebuild", label: t(msg`全量重建`) },
    { mode: "project", label: t(msg`只重投影 Prompt`) },
    { mode: "real_world", label: t(msg`拉一次真实世界信息`) },
  ];

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[color:var(--text-secondary)]">
          {t(msg`运营操作`)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={isPending}
            onClick={() => runMutation.mutate("incremental")}
          >
            {isPending && incrementalActive
              ? t(msg`执行中...`)
              : t(msg`增量刷新`)}
          </Button>
          <div className="relative" ref={menuRef}>
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              {t(msg`更多操作`)} ▾
            </Button>
            {menuOpen ? (
              <div className="absolute right-0 top-full z-10 mt-2 w-60 rounded-[18px] border border-[color:var(--border-faint)] bg-white p-2 shadow-[var(--shadow-soft)]">
                <div className="flex flex-col gap-1">
                  {moreActions.map((item) => {
                    const itemActive = activeMode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setMenuOpen(false);
                          runMutation.mutate(item.mode);
                        }}
                        className="rounded-[12px] px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isPending && itemActive
                          ? t(msg`执行中...`)
                          : item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

function OverviewWorkspace({
  profile,
  realWorld,
}: {
  profile: CyberAvatarProfile;
  realWorld: CyberAvatarRealWorldOverview;
}) {
  const t = translateRuntimeMessage;
  return (
    <div className="space-y-6">
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`状态总览`)}
          actions={
            <StatusPill tone={resolveProfileTone(profile.status)}>
              {profile.status}
            </StatusPill>
          }
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <AdminValueCard
            label={t(msg`当前情绪 / 能量`)}
            value={`${profile.liveState.mood || t(msg`暂无`)} / ${profile.liveState.energy || t(msg`暂无`)}`}
          />
          <AdminValueCard
            label={t(msg`社交温度`)}
            value={profile.liveState.socialTemperature || t(msg`暂无`)}
          />
          <AdminValueCard
            label={t(msg`最新 focus`)}
            value={joinList(profile.liveState.focus)}
          />
          <AdminValueCard
            label={t(msg`最新外部简报`)}
            value={
              realWorld.latestBrief
                ? formatDateTime(realWorld.latestBrief.createdAt)
                : t(msg`暂无`)
            }
          />
        </div>
      </Card>

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader title={t(msg`画像健康与构建状态`)} />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <MetricCard
            label={t(msg`liveState 置信度`)}
            value={profile.confidence.liveState.toFixed(2)}
          />
          <MetricCard
            label={t(msg`recentState 置信度`)}
            value={profile.confidence.recentState.toFixed(2)}
          />
          <MetricCard
            label={t(msg`stableCore 置信度`)}
            value={profile.confidence.stableCore.toFixed(2)}
          />
          <MetricCard
            label={t(msg`覆盖窗口`)}
            value={t(msg`${profile.sourceCoverage.windowDays} 天`)}
          />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <AdminInfoRows
            title={t(msg`构建状态`)}
            rows={[
              {
                label: t(msg`最后信号时间`),
                value: formatDateTime(profile.lastSignalAt),
              },
              {
                label: t(msg`最后构建时间`),
                value: formatDateTime(profile.lastBuiltAt),
              },
              {
                label: t(msg`最后投影时间`),
                value: formatDateTime(profile.lastProjectedAt),
              },
              { label: t(msg`最后运行 ID`), value: profile.lastRunId ?? t(msg`暂无`) },
            ]}
          />
          <AdminInfoRows
            title={t(msg`信号覆盖`)}
            rows={[
              {
                label: t(msg`覆盖面`),
                value: joinList(
                  profile.sourceCoverage.coveredSurfaces.map((item) =>
                    translateSurface(item),
                  ),
                ),
              },
              {
                label: t(msg`缺失面`),
                value: joinList(
                  profile.sourceCoverage.missingSurfaces.map((item) =>
                    translateSurface(item),
                  ),
                ),
              },
              { label: t(msg`当前 focus`), value: joinList(profile.liveState.focus) },
              {
                label: t(msg`活跃主题`),
                value: joinList(profile.liveState.activeTopics),
              },
            ]}
          />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProfileStatePanel
          title="Live State" // i18n-ignore-line: admin technical label
          subtitle={t(msg`短窗口内最活跃、最即时的状态层`)}
          groups={[
            { label: t(msg`当前 focus`), items: profile.liveState.focus },
            { label: t(msg`活跃主题`), items: profile.liveState.activeTopics },
            { label: t(msg`Open Loops`), items: profile.liveState.openLoops },
          ]}
        />
        <ProfileStatePanel
          title="Recent State" // i18n-ignore-line: admin technical label
          subtitle={t(msg`近期重复出现的目标、摩擦和偏好信号`)}
          groups={[
            { label: t(msg`近期目标`), items: profile.recentState.recentGoals },
            { label: t(msg`近期摩擦`), items: profile.recentState.recentFriction },
            {
              label: t(msg`偏好信号`),
              items: profile.recentState.recentPreferenceSignals,
            },
            {
              label: t(msg`关系信号`),
              items: profile.recentState.recentRelationshipSignals,
            },
            {
              label: t(msg`Recurring Topics`),
              items: profile.recentState.recurringTopics,
            },
          ]}
        />
      </div>

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader title={t(msg`Stable Core`)} />
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <AdminMiniPanel title={t(msg`身份摘要`)} className="bg-white/90">
            <div className="text-sm leading-7 text-[color:var(--text-secondary)]">
              {profile.stableCore.identitySummary || t(msg`暂无稳定身份摘要。`)}
            </div>
          </AdminMiniPanel>
          <div className="grid gap-4 md:grid-cols-2">
            <AdminMiniPanel title={t(msg`沟通方式`)}>
              <PillList items={profile.stableCore.communicationStyle} />
            </AdminMiniPanel>
            <AdminMiniPanel title={t(msg`决策方式`)}>
              <PillList items={profile.stableCore.decisionStyle} />
            </AdminMiniPanel>
            <AdminMiniPanel title={t(msg`偏好模型`)}>
              <PillList items={profile.stableCore.preferenceModel} />
            </AdminMiniPanel>
            <AdminMiniPanel title={t(msg`社交姿态`)}>
              <PillList items={profile.stableCore.socialPosture} />
            </AdminMiniPanel>
            <AdminMiniPanel title={t(msg`日常模式`)}>
              <PillList items={profile.stableCore.routinePatterns} />
            </AdminMiniPanel>
            <AdminMiniPanel title={t(msg`边界与风险`)}>
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

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`真实世界回流`)}
          actions={
            <StatusPill tone={realWorld.latestBrief ? "healthy" : "muted"}>
              {realWorld.latestBrief ? t(msg`已有最新简报`) : t(msg`暂无简报`)}
            </StatusPill>
          }
        />
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard
              label={t(msg`接纳条目`)}
              value={realWorld.stats.acceptedItems}
            />
            <MetricCard
              label={t(msg`活跃简报`)}
              value={realWorld.stats.activeBriefs}
            />
          </div>
          <AdminInfoRows
            title={t(msg`回流状态`)}
            rows={[
              {
                label: t(msg`最近条目时间`),
                value: formatDateTime(realWorld.stats.latestAcceptedAt),
              },
              {
                label: t(msg`最近简报时间`),
                value: formatDateTime(realWorld.stats.latestBriefAt),
              },
              {
                label: t(msg`Query Preview`),
                value: joinList(realWorld.queryPreview),
              },
              {
                label: t(msg`Need Discovery 上游`),
                value: realWorld.rules.feedNeedDiscoveryEnabled
                  ? t(msg`已启用`)
                  : t(msg`已关闭`),
              },
            ]}
          />
          {realWorld.latestBrief ? (
            <RealWorldBriefPanel brief={realWorld.latestBrief} compact />
          ) : (
            <AdminEmptyState
              title={t(msg`还没有外部简报`)}
              description={t(msg`先手动执行一次真实世界回流，后台会把外部条目整理成一份可读简报。`)}
            />
          )}
        </div>
      </Card>
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
  const t = translateRuntimeMessage;
  const selectedValue = profile.promptProjection[projectionTab];

  return (
    <div className="space-y-6">
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`Prompt Projection Catalog`)}
          actions={<StatusPill tone="muted">{t(msg`下游链路已标注`)}</StatusPill>}
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
                        {t(section.label)}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-[color:var(--text-secondary)]">
                        {t(section.description)}
                      </div>
                    </div>
                    <StatusPill tone={value.trim() ? "healthy" : "muted"}>
                      {value.trim()
                        ? t(msg`已生成`)
                        : t(msg`空`)}
                    </StatusPill>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <AdminValueCard
                      label={t(msg`长度`)}
                      value={t(msg`${value.trim().length} 字`)}
                    />
                    <AdminValueCard
                      label={t(msg`下游`)}
                      value={t(msg`${section.consumers.length} 条`)}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <Card className="bg-white/90">
            <AdminSectionHeader
              title={t(selectedProjection.label)}
              actions={
                <StatusPill tone={selectedValue.trim() ? "healthy" : "muted"}>
                  {selectedValue.trim() ? t(msg`当前生效中`) : t(msg`当前为空`)}
                </StatusPill>
              }
            />
            <div className="mt-4 grid gap-4">
              <AdminSoftBox>{t(selectedProjection.description)}</AdminSoftBox>
              <AdminInfoRows
                title={t(msg`下游消费链路`)}
                rows={[
                  {
                    label: t(msg`影响范围`),
                    value: joinList(selectedProjection.consumers.map((c) => t(c))),
                  },
                  {
                    label: t(msg`建议检查`),
                    value:
                      selectedProjection.key === "memoryBlock"
                        ? t(msg`关注过长或过泛，避免把短窗口信息再次稀释。`)
                        : selectedProjection.key === "coreInstruction"
                          ? t(msg`优先检查边界、口吻和长期稳定偏好是否被正确收口。`)
                          : t(msg`查看对应下游链路是否出现行为偏差，再回看这段内容。`),
                  },
                ]}
              />
              <AdminCodeBlock
                value={selectedValue || t(msg`暂无`)}
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
  const t = translateRuntimeMessage;
  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title={t(msg`运行证据与输入样本`)} />
      <div className="mt-4 space-y-4">
        <AdminTabs
          tabs={EVIDENCE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
          activeKey={evidenceTab}
          onChange={(key) => onEvidenceTabChange(key as EvidenceTab)}
        />

        {evidenceTab === "runs" ? (
          <div className="space-y-4">
            {activeRun ? (
              <AdminSoftBox className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <span className="font-medium text-[color:var(--text-primary)]">
                    {translateRunMode(activeRun.mode)}
                  </span>
                  <span className="ml-2 text-[color:var(--text-secondary)]">
                    {t(msg`v${activeRun.profileVersion} · ${activeRun.trigger} · 处理信号 ${activeRun.signalCount} 条`)}
                  </span>
                </div>
                <StatusPill tone={resolveRunTone(activeRun.status)}>
                  {activeRun.status}
                </StatusPill>
              </AdminSoftBox>
            ) : null}
            <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
            <div className="space-y-3">
              {overview.recentRuns.length ? (
                overview.recentRuns.map((run) => {
                  const isSelected = selectedRunId === run.id;
                  return (
                    <div
                      key={run.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectRunId(run.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelectRunId(run.id);
                        }
                      }}
                      className={`cursor-pointer rounded-[20px] outline-none transition focus-visible:ring-2 focus-visible:ring-[color:var(--border-brand)] ${
                        isSelected
                          ? ""
                          : "hover:opacity-90"
                      }`}
                    >
                      <AdminRecordCard
                        title={`${translateRunMode(run.mode)} · v${run.profileVersion}`}
                        badges={
                          <StatusPill tone={resolveRunTone(run.status)}>
                            {run.status}
                          </StatusPill>
                        }
                        meta={t(msg`触发方式 ${run.trigger} · ${formatDateTime(run.createdAt)}`)}
                        description={t(msg`处理信号 ${run.signalCount} 条${run.skipReason ? ` · 跳过原因 ${run.skipReason}` : ""}`)}
                        className={
                          isSelected
                            ? "border-[color:var(--border-brand)] bg-white"
                            : undefined
                        }
                      />
                    </div>
                  );
                })
              ) : (
                <AdminEmptyState
                  title={t(msg`还没有运行记录`)}
                  description={t(msg`先手动跑一次增量刷新或深度刷新，后台才会留下可观测的 run 快照。`)}
                />
              )}
            </div>
            <div>
              {runDetailQuery.isLoading ? (
                <LoadingBlock label={t(msg`正在读取 run 详情...`)} />
              ) : runDetailQuery.isError &&
                runDetailQuery.error instanceof Error ? (
                <ErrorBlock message={runDetailQuery.error.message} />
              ) : activeRun ? (
                <CyberAvatarRunDetailPanel detail={activeRun} />
              ) : (
                <AdminEmptyState
                  title={t(msg`未选择运行记录`)}
                  description={t(msg`从左侧点开一条运行记录，就能看到输入快照、聚合结果、提示词和 merge diff。`)}
                />
              )}
            </div>
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
                      <AdminMetaText>{t(msg`当前无 payload`)}</AdminMetaText>
                    )
                  }
                />
              ))
            ) : (
              <AdminEmptyState
                title={t(msg`还没有行为信号`)}
                description={t(msg`等用户产生聊天、朋友圈、广场或社交操作之后，这里会开始积累赛博分身的输入证据。`)}
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
                      title={t(msg`条目详情`)}
                      rows={[
                        { label: t(msg`查询`), value: item.queryText },
                        { label: t(msg`标签`), value: joinList(item.topicTags) },
                        {
                          label: t(msg`综合分`),
                          value: item.compositeScore.toFixed(2),
                        },
                      ]}
                    />
                  }
                />
              ))
            ) : (
              <AdminEmptyState
                title={t(msg`还没有回流条目`)}
                description={t(msg`拉取真实世界信息后，这里会显示被接纳或被过滤的外部条目。`)}
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
                title={t(msg`还没有外部简报`)}
                description={t(msg`先手动执行一次真实世界回流，后台会把外部条目整理成一份可读简报。`)}
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
              <LoadingBlock label={t(msg`正在读取好友需求发现概览...`)} />
            ) : needDiscoveryQuery.isError &&
              needDiscoveryQuery.error instanceof Error ? (
              <ErrorBlock message={needDiscoveryQuery.error.message} />
            ) : needDiscoveryQuery.data ? (
              <NeedDiscoverySnapshotPanel detail={needDiscoveryQuery.data} />
            ) : (
              <AdminEmptyState
                title={t(msg`需求发现概览暂不可用`)}
                description={t(msg`后端 need-discovery 模块未返回数据。`)}
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
  const t = translateRuntimeMessage;
  const enabledSourceCount = parsedRules
    ? Object.values(parsedRules.sourceToggles).filter(Boolean).length
    : 0;

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader
        title={t(msg`规则与提示词配置`)}
        actions={<AdminDraftStatusPill ready dirty={isRulesDirty} />}
      />
      <div className="mt-4 space-y-4">
        <AdminInfoRows
          title={t(msg`当前草稿快照`)}
          rows={[
            {
              label: t(msg`自动建模`),
              value: parsedRules?.enabled ? t(msg`已启用`) : t(msg`已关闭`),
            },
            {
              label: t(msg`采集来源`),
              value: parsedRules
                ? t(msg`${enabledSourceCount} 项已启用`)
                : t(msg`草稿无效`),
            },
            {
              label: t(msg`真实世界回流`),
              value: parsedRules?.interaction.realWorldSyncEnabled
                ? t(msg`已启用`)
                : t(msg`已关闭`),
            },
            {
              label: t(msg`提示词模板`),
              value: parsedRules ? t(msg`可结构化编辑`) : t(msg`先修复 JSON`),
            },
          ]}
        />
        {!parsedRules ? (
          <AdminCallout
            tone="warning"
            title={t(msg`当前草稿有格式错误`)}
            description={t(msg`当前 JSON 草稿无法解析，结构化编辑会被锁住。先切到"原始 JSON"修复格式，页面会自动恢复结构化视图。`)}
          />
        ) : null}

        <AdminTabs
          tabs={RULE_TABS.map((tab) => ({ ...tab, label: t(tab.label) }))}
          activeKey={rulesTab}
          onChange={(key) => onRulesTabChange(key as RulesTab)}
        />

        {rulesTab === "common" ? (
          parsedRules ? (
            <div className="space-y-6">
              <Card className="bg-white/90">
                <AdminSectionHeader title={t(msg`运行总开关`)} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <AdminToggle
                    label={t(msg`启用赛博分身`)}
                    checked={parsedRules.enabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        enabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label={t(msg`启用采集`)}
                    checked={parsedRules.captureEnabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        captureEnabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label={t(msg`启用增量刷新`)}
                    checked={parsedRules.incrementalUpdateEnabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        incrementalUpdateEnabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label={t(msg`启用深度刷新`)}
                    checked={parsedRules.deepRefreshEnabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        deepRefreshEnabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label={t(msg`启用 Prompt 投影`)}
                    checked={parsedRules.projectionEnabled}
                    onChange={(checked) =>
                      patchRulesDraft((current) => ({
                        ...current,
                        projectionEnabled: checked,
                      }))
                    }
                  />
                  <AdminToggle
                    label={t(msg`暂停自动更新`)}
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
                <AdminSectionHeader title={t(msg`调度参数`)} />
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <AdminTextField
                    label={t(msg`增量最小信号数`)}
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
                    label={t(msg`增量最大信号数`)}
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
                    label={t(msg`增量最小间隔(分钟)`)}
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
                    label={t(msg`增量扫描周期(分钟)`)}
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
                    label={t(msg`深度刷新周期(小时)`)}
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
                    label={t(msg`近期窗口(天)`)}
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
                    label={t(msg`稳定核心窗口(天)`)}
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
                    label={t(msg`全量重建窗口(天)`)}
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
                <AdminSectionHeader title={t(msg`稳定核心合并规则`)} />
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <AdminTextField
                    label={t(msg`稳定核心阈值`)}
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
                    label={t(msg`边界变化阈值`)}
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
                    label={t(msg`偏好衰减(天)`)}
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
                    label={t(msg`Open Loop 衰减(天)`)}
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
              title={t(msg`结构化编辑不可用`)}
              description={t(msg`当前草稿 JSON 无法解析，先去“原始 JSON”修复。`)}
            />
          )
        ) : null}

        {rulesTab === "sources" ? (
          parsedRules ? (
            <div className="space-y-6">
              <Card className="bg-white/90">
                <AdminSectionHeader title={t(msg`信号来源开关`)} />
                <div className="mt-4 flex flex-wrap gap-2">
                  {SOURCE_TOGGLE_FIELDS.map((field) => (
                    <AdminToggle
                      key={field.key}
                      label={t(field.label)}
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
                <AdminSectionHeader title={t(msg`真实世界回流与上游联动`)} />
                <div className="mt-4 space-y-5">
                  <div className="flex flex-wrap gap-2">
                    <AdminToggle
                      label={t(msg`启用交互规则`)}
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
                      label={t(msg`启用真实世界同步`)}
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
                      label={t(msg`回流生成信号`)}
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
                      label={t(msg`喂给 Need Discovery`)}
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
                      label={t(msg`空结果回退 mock`)}
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <AdminTextField
                      label={t(msg`每轮 Query 数`)}
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
                      label={t(msg`默认时效(小时)`)}
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
                      label={t(msg`每个 Query 最大条目`)}
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
                      label={t(msg`每轮最多接纳条目`)}
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
                      label={t(msg`每份简报最多条目`)}
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
                      label={t(msg`最低接纳分`)}
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
                      label={t(msg`同步周期(小时)`)}
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
                      label={t(msg`Google News 语言`)}
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
                      label={t(msg`Google News 地区`)}
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
                      label="Google News CEID" // i18n-ignore-line: admin technical label
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
                      label={t(msg`Google News 每轮条目`)}
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <AdminTextArea
                      label="Owner Query Overrides" // i18n-ignore-line: admin technical label
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
                      description={t(msg`一行一个额外 Query，优先用来补手工关注主题。`)}
                      textareaClassName="min-h-[200px]"
                    />
                    <AdminTextArea
                      label="Source Allowlist" // i18n-ignore-line: admin technical label
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
                      description={t(msg`一行一个允许源，留空表示不过滤。`)}
                      textareaClassName="min-h-[200px]"
                    />
                    <AdminTextArea
                      label="Source Blocklist" // i18n-ignore-line: admin technical label
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
                      description={t(msg`一行一个屏蔽源，用来快速剔除低质量来源。`)}
                      textareaClassName="min-h-[200px]"
                    />
                  </div>

                  <AdminMiniPanel title="Signal Weights" tone="soft"> {/* i18n-ignore-line: admin technical label */}
                    <AdminCodeBlock
                      value={safePrettyJson(parsedRules.signalWeights)}
                    />
                  </AdminMiniPanel>
                </div>
              </Card>
            </div>
          ) : null
        ) : null}

        {rulesTab === "prompts" ? (
          parsedRules ? (
            <div className="space-y-6">
              <Card className="bg-white/90">
                <AdminSectionHeader title={t(msg`建模与投影模板`)} />
                <div className="mt-4 grid gap-4">
                  {PROMPT_TEMPLATE_FIELDS.map((field) => (
                    <AdminTextArea
                      key={field.key}
                      label={t(field.label)}
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
                      description={t(field.description)}
                      textareaClassName="min-h-[200px]"
                    />
                  ))}
                </div>
              </Card>

              <Card className="bg-white/90">
                <AdminSectionHeader title={t(msg`真实世界交互模板`)} />
                <div className="mt-4">
                  <AdminTextArea
                    label={t(msg`真实世界简报 Prompt`)}
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
                    description={t(msg`把接纳条目整理成可读简报时使用。`)}
                    textareaClassName="min-h-[220px]"
                  />
                </div>
              </Card>
            </div>
          ) : null
        ) : null}

        {rulesTab === "json" ? (
          <Card className="bg-white/90">
            <AdminSectionHeader
              title={t(msg`原始 JSON`)}
              actions={
                <StatusPill tone={parsedRules ? "healthy" : "warning"}>
                  {parsedRules ? t(msg`可解析`) : t(msg`格式错误`)}
                </StatusPill>
              }
            />
            <div className="mt-4 space-y-4">
              <AdminCallout
                tone={parsedRules ? "info" : "warning"}
                title={parsedRules ? t(msg`高级编辑模式`) : t(msg`当前 JSON 无法解析`)}
                description={
                  parsedRules
                    ? t(msg`适合批量改 signal weights、批量调模板或直接贴整段规则对象。这里的内容会和结构化编辑共用同一份草稿。`)
                    : t(msg`先修复这里的 JSON，再回到结构化编辑。页面会自动恢复结构化表单。`)
                }
              />
              <AdminTextArea
                label={t(msg`赛博分身规则 JSON`)}
                value={rulesJsonDraft}
                onChange={onRulesJsonDraftChange}
                description={t(msg`支持直接粘贴完整对象。保存前会重新做一次 JSON 解析。`)}
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
        <div className="mt-4 grid gap-3 md:grid-cols-2">
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
  emptyLabel = translateRuntimeMessage(msg`暂无`),
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
  const t = translateRuntimeMessage;
  return (
    <div className="space-y-4">
      <AdminInfoRows
        title={brief.title}
        rows={[
          { label: t(msg`简报日期`), value: brief.briefDate },
          {
            label: t(msg`相关条目`),
            value: brief.relatedItemIds.length
              ? String(brief.relatedItemIds.length)
              : "0",
          },
          {
            label: "Query Hints", // i18n-ignore-line: admin technical label
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
          {/* i18n-ignore-start: admin technical labels for snapshot/panel blocks */}
          <RunSnapshotBlock
            title="Bullet Points"
            value={{ bulletPoints: brief.bulletPoints }}
          />
          <RunSnapshotBlock
            title="Need Signals"
            value={{ needSignals: brief.needSignals }}
          />
          {/* i18n-ignore-end */}
        </>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <AdminMiniPanel title="Bullet Points" tone="soft"> {/* i18n-ignore-line: admin technical label */}
            <PillList items={brief.bulletPoints} />
          </AdminMiniPanel>
          <AdminMiniPanel title="Need Signals" tone="soft"> {/* i18n-ignore-line: admin technical label */}
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
  const t = translateRuntimeMessage;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <MetricCard label={t(msg`待处理候选`)} value={detail.stats.pendingCandidates} />
        <MetricCard
          label={t(msg`今日可生成上限`)}
          value={detail.config.shared.dailyCreationLimit}
        />
      </div>
      <AdminInfoRows
        title={t(msg`执行配置`)}
        rows={[
          {
            label: t(msg`短周期模式`),
            value: t(msg`${detail.config.shortInterval.executionMode} / ${detail.config.shortInterval.intervalMinutes} 分钟`),
          },
          {
            label: t(msg`日周期模式`),
            value: `${detail.config.daily.executionMode} / ${detail.config.daily.runAtHour
              .toString()
              .padStart(2, "0")}:${detail.config.daily.runAtMinute
              .toString()
              .padStart(2, "0")}`,
          },
          {
            label: t(msg`允许领域`),
            value:
              [
                detail.config.shared.allowMedical ? t(msg`医疗`) : null,
                detail.config.shared.allowLegal ? t(msg`法律`) : null,
                detail.config.shared.allowFinance ? t(msg`金融`) : null,
              ]
                .filter(Boolean)
                .join(" / ") || t(msg`全部关闭`),
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
              meta={t(msg`置信度 ${candidate.confidenceScore.toFixed(2)} · 优先级 ${candidate.priorityScore.toFixed(2)}`)}
              description={candidate.coverageGapSummary ?? t(msg`暂无覆盖缺口摘要`)}
            />
          ))}
        </div>
      ) : (
        <AdminEmptyState
          title={t(msg`当前没有活跃候选`)}
          description={t(msg`真实世界简报和用户行为会继续作为 need-discovery 的上游输入。`)}
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
  const t = translateRuntimeMessage;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <MetricCard label={t(msg`模式`)} value={translateRunMode(detail.mode)} />
        <MetricCard label={t(msg`处理信号`)} value={detail.signalCount} />
      </div>
      <AdminInfoRows
        title={t(msg`执行摘要`)}
        rows={[
          { label: t(msg`触发方式`), value: detail.trigger },
          { label: t(msg`画像版本`), value: detail.profileVersion },
          { label: t(msg`开始窗口`), value: formatDateTime(detail.windowStartedAt) },
          { label: t(msg`结束窗口`), value: formatDateTime(detail.windowEndedAt) },
          { label: t(msg`跳过原因`), value: detail.skipReason ?? t(msg`无`) },
          { label: t(msg`错误信息`), value: detail.errorMessage ?? t(msg`无`) },
        ]}
      />
      {/* i18n-ignore-start: admin technical snapshot/payload labels */}
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
      {/* i18n-ignore-end */}
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
  const t = translateRuntimeMessage;
  return (
    <Card className="bg-white/90">
      <AdminSectionHeader title={title} />
      <div className="mt-3">
        <AdminCodeBlock value={value ? safePrettyJson(value) : t(msg`暂无`)} />
      </div>
    </Card>
  );
}
