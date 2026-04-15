import { useEffect, useMemo, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Character,
  TokenPricingCatalog,
  TokenPricingCatalogItem,
  TokenUsageBillingSource,
  TokenUsageBudgetConfig,
  TokenUsageBudgetEnforcement,
  TokenUsageBudgetMetric,
  TokenUsageBudgetPeriodSummary,
  TokenUsageBudgetState,
  TokenUsageBudgetStatus,
  TokenUsageBreakdownItem,
  TokenUsageCharacterBudgetRule,
  TokenUsageCharacterBudgetStatus,
  TokenUsageQuery,
  TokenUsageStatus,
} from "@yinjie/contracts";
import { Button, Card, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AdminMetaText, AdminPageHero, AdminSectionHeader } from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatDateInput(date);
}

function monthStartInput() {
  const date = new Date();
  date.setDate(1);
  return formatDateInput(date);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCost(value: number, currency: "CNY" | "USD") {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBudgetValue(
  value: number | null,
  metric: TokenUsageBudgetMetric,
  currency: "CNY" | "USD",
) {
  if (value == null) {
    return "未设置";
  }
  return metric === "cost" ? formatCost(value, currency) : `${formatInteger(value)} token`;
}

function formatRatio(value: number | null) {
  if (value == null) {
    return "未启用";
  }
  return `${Math.round(value * 100)}%`;
}

function emptyPricingItem(): TokenPricingCatalogItem {
  return {
    model: "",
    inputPer1kTokens: 0,
    outputPer1kTokens: 0,
    enabled: true,
  };
}

function emptyBudgetConfig(): TokenUsageBudgetConfig {
  return {
    overall: {
      enabled: false,
      metric: "tokens",
      enforcement: "monitor",
      dailyLimit: null,
      monthlyLimit: null,
      warningRatio: 0.8,
    },
    characters: [],
  };
}

function emptyCharacterBudgetRule(characterId = ""): TokenUsageCharacterBudgetRule {
  return {
    characterId,
    enabled: true,
    metric: "tokens",
    enforcement: "monitor",
    dailyLimit: null,
    monthlyLimit: null,
    warningRatio: 0.8,
    note: "",
  };
}

export function TokenUsagePage() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(() => shiftDate(-6));
  const [to, setTo] = useState(() => formatDateInput(new Date()));
  const [grain, setGrain] = useState<"day" | "week" | "month">("day");
  const [characterId, setCharacterId] = useState("");
  const [status, setStatus] = useState<"" | TokenUsageStatus>("");
  const [billingSource, setBillingSource] = useState<"" | TokenUsageBillingSource>("");
  const [pricingDraft, setPricingDraft] = useState<TokenPricingCatalog | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<TokenUsageBudgetConfig | null>(null);

  const listQuery = useMemo<TokenUsageQuery>(
    () => ({
      from,
      to,
      grain,
      characterId: characterId || undefined,
      status: status || undefined,
      billingSource: billingSource || undefined,
      limit: 8,
    }),
    [billingSource, characterId, from, grain, status, to],
  );

  const recordsQueryInput = useMemo<TokenUsageQuery>(
    () => ({
      ...listQuery,
      page: 1,
      pageSize: 20,
    }),
    [listQuery],
  );

  const blockedBaseQuery = useMemo<TokenUsageQuery>(
    () => ({
      from,
      to,
      characterId: characterId || undefined,
      billingSource: billingSource || undefined,
      status: "failed",
      errorCode: "BUDGET_BLOCKED",
    }),
    [billingSource, characterId, from, to],
  );

  const blockedTrendQueryInput = useMemo<TokenUsageQuery>(
    () => ({
      ...blockedBaseQuery,
      grain,
    }),
    [blockedBaseQuery, grain],
  );

  const blockedBreakdownQueryInput = useMemo<TokenUsageQuery>(
    () => ({
      ...blockedBaseQuery,
      limit: 5,
    }),
    [blockedBaseQuery],
  );

  const blockedRecordsQueryInput = useMemo<TokenUsageQuery>(
    () => ({
      ...blockedBaseQuery,
      page: 1,
      pageSize: 8,
    }),
    [blockedBaseQuery],
  );

  const charactersQuery = useQuery({
    queryKey: ["admin-token-usage-characters"],
    queryFn: () => adminApi.getCharacters(),
  });

  const overviewQuery = useQuery({
    queryKey: ["admin-token-usage-overview", listQuery],
    queryFn: () => adminApi.getTokenUsageOverview(listQuery),
  });

  const trendQuery = useQuery({
    queryKey: ["admin-token-usage-trend", listQuery],
    queryFn: () => adminApi.getTokenUsageTrend(listQuery),
  });

  const breakdownQuery = useQuery({
    queryKey: ["admin-token-usage-breakdown", listQuery],
    queryFn: () => adminApi.getTokenUsageBreakdown(listQuery),
  });

  const recordsQuery = useQuery({
    queryKey: ["admin-token-usage-records", recordsQueryInput],
    queryFn: () => adminApi.getTokenUsageRecords(recordsQueryInput),
  });

  const blockedOverviewQuery = useQuery({
    queryKey: ["admin-token-usage-blocked-overview", blockedBaseQuery],
    queryFn: () => adminApi.getTokenUsageOverview(blockedBaseQuery),
  });

  const blockedTrendQuery = useQuery({
    queryKey: ["admin-token-usage-blocked-trend", blockedTrendQueryInput],
    queryFn: () => adminApi.getTokenUsageTrend(blockedTrendQueryInput),
  });

  const blockedBreakdownQuery = useQuery({
    queryKey: ["admin-token-usage-blocked-breakdown", blockedBreakdownQueryInput],
    queryFn: () => adminApi.getTokenUsageBreakdown(blockedBreakdownQueryInput),
  });

  const blockedRecordsQuery = useQuery({
    queryKey: ["admin-token-usage-blocked-records", blockedRecordsQueryInput],
    queryFn: () => adminApi.getTokenUsageRecords(blockedRecordsQueryInput),
  });

  const pricingQuery = useQuery({
    queryKey: ["admin-token-usage-pricing"],
    queryFn: () => adminApi.getTokenUsagePricing(),
  });

  const budgetQuery = useQuery({
    queryKey: ["admin-token-usage-budgets"],
    queryFn: () => adminApi.getTokenUsageBudgets(),
  });

  useEffect(() => {
    if (pricingQuery.data) {
      setPricingDraft(pricingQuery.data);
    }
  }, [pricingQuery.data]);

  useEffect(() => {
    if (budgetQuery.data) {
      setBudgetDraft(budgetQuery.data.config);
    }
  }, [budgetQuery.data]);

  const savePricingMutation = useMutation({
    mutationFn: async () => {
      if (!pricingDraft) {
        throw new Error("价格配置暂不可用。");
      }

      const items = pricingDraft.items
        .map((item) => ({
          model: item.model.trim(),
          inputPer1kTokens: Number(item.inputPer1kTokens) || 0,
          outputPer1kTokens: Number(item.outputPer1kTokens) || 0,
          enabled: item.enabled !== false,
          note: item.note?.trim() || undefined,
        }))
        .filter((item) => item.model);

      return adminApi.setTokenUsagePricing({
        currency: pricingDraft.currency,
        items,
      });
    },
    onSuccess: async (result) => {
      setPricingDraft(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-token-usage-pricing"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-token-usage-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-token-usage-trend"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-token-usage-breakdown"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-token-usage-records"] }),
      ]);
    },
  });

  const saveBudgetMutation = useMutation({
    mutationFn: async () => {
      if (!budgetDraft) {
        throw new Error("预算配置暂不可用。");
      }
      return adminApi.setTokenUsageBudgets({
        overall: {
          ...budgetDraft.overall,
          dailyLimit: normalizeNullableNumber(budgetDraft.overall.dailyLimit),
          monthlyLimit: normalizeNullableNumber(budgetDraft.overall.monthlyLimit),
        },
        characters: budgetDraft.characters
          .map((item) => ({
            ...item,
            characterId: item.characterId.trim(),
            dailyLimit: normalizeNullableNumber(item.dailyLimit),
            monthlyLimit: normalizeNullableNumber(item.monthlyLimit),
            note: item.note?.trim() || undefined,
          }))
          .filter((item) => item.characterId),
      });
    },
    onSuccess: async (result) => {
      setBudgetDraft(result.config);
      await queryClient.invalidateQueries({ queryKey: ["admin-token-usage-budgets"] });
    },
  });

  const loading =
    overviewQuery.isLoading ||
    trendQuery.isLoading ||
    breakdownQuery.isLoading ||
    recordsQuery.isLoading ||
    blockedOverviewQuery.isLoading ||
    blockedTrendQuery.isLoading ||
    blockedBreakdownQuery.isLoading ||
    blockedRecordsQuery.isLoading ||
    pricingQuery.isLoading ||
    budgetQuery.isLoading;

  const fatalError =
    (overviewQuery.error instanceof Error && overviewQuery.error) ||
    (trendQuery.error instanceof Error && trendQuery.error) ||
    (breakdownQuery.error instanceof Error && breakdownQuery.error) ||
    (recordsQuery.error instanceof Error && recordsQuery.error) ||
    (blockedOverviewQuery.error instanceof Error && blockedOverviewQuery.error) ||
    (blockedTrendQuery.error instanceof Error && blockedTrendQuery.error) ||
    (blockedBreakdownQuery.error instanceof Error && blockedBreakdownQuery.error) ||
    (blockedRecordsQuery.error instanceof Error && blockedRecordsQuery.error) ||
    (pricingQuery.error instanceof Error && pricingQuery.error) ||
    (budgetQuery.error instanceof Error && budgetQuery.error) ||
    null;

  const overview = overviewQuery.data;
  const trend = trendQuery.data ?? [];
  const breakdown = breakdownQuery.data;
  const records = recordsQuery.data;
  const blockedOverview = blockedOverviewQuery.data;
  const blockedTrend = blockedTrendQuery.data ?? [];
  const blockedBreakdown = blockedBreakdownQuery.data;
  const blockedRecords = blockedRecordsQuery.data;
  const budgetSummary = budgetQuery.data?.summary;
  const characters = charactersQuery.data ?? [];
  const currency = overview?.currency ?? pricingDraft?.currency ?? budgetSummary?.currency ?? "CNY";
  const hasConfiguredPricing = Boolean(
    pricingDraft?.items.some((item) => item.enabled && (item.inputPer1kTokens > 0 || item.outputPer1kTokens > 0)),
  );

  const maxTrendTokens = useMemo(
    () => Math.max(...trend.map((item) => item.totalTokens), 1),
    [trend],
  );

  const maxBlockedRequestCount = useMemo(
    () => Math.max(...blockedTrend.map((item) => item.requestCount), 1),
    [blockedTrend],
  );

  const availableCharacters = useMemo(() => {
    const used = new Set((budgetDraft?.characters ?? []).map((item) => item.characterId));
    return characters.filter((item) => !used.has(item.id));
  }, [budgetDraft?.characters, characters]);

  if (loading && !overview && !breakdown && !records && !budgetSummary && !blockedOverview) {
    return <LoadingBlock label="正在加载 Token 用量中心..." />;
  }

  if (fatalError) {
    return <ErrorBlock message={fatalError.message} />;
  }

  const overallBudgetStatus = budgetSummary?.overall ?? createInactiveBudgetStatus();
  const blockedRequestCount = blockedOverview?.requestCount ?? 0;
  const blockedLastRecord = blockedRecords?.items[0] ?? null;
  const blockedFailureShare = calculateRatio(blockedRequestCount, overview?.failedCount ?? 0);

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow="AI 用量"
        title="Token 用量与预算中心"
        description="这里会把实例里的 AI 请求沉淀成账本，支持看时间趋势、角色排行、费用估算，以及整体和单角色预算预警。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => applyPreset("7d", setFrom, setTo)}>
              近 7 天
            </Button>
            <Button variant="secondary" size="sm" onClick={() => applyPreset("30d", setFrom, setTo)}>
              近 30 天
            </Button>
            <Button variant="secondary" size="sm" onClick={() => applyPreset("month", setFrom, setTo)}>
              本月
            </Button>
          </div>
        }
        metrics={[
          { label: "总 Token", value: formatInteger(overview?.totalTokens ?? 0) },
          { label: "输入 Token", value: formatInteger(overview?.promptTokens ?? 0) },
          { label: "输出 Token", value: formatInteger(overview?.completionTokens ?? 0) },
          { label: "估算费用", value: formatCost(overview?.estimatedCost ?? 0, currency) },
        ]}
      />

      {!hasConfiguredPricing ? (
        <InlineNotice tone="warning">
          当前还没有配置模型单价，页面里的“估算费用”会先按 0 计算。补上价格后，新入账请求会开始写入价格快照。
        </InlineNotice>
      ) : null}

      {budgetSummary?.alerts.length ? (
        <InlineNotice tone="warning">
          当前有 {budgetSummary.alerts.length} 条预算预警，请优先关注整体预算和角色预算里标红的对象。
        </InlineNotice>
      ) : null}

      {blockedRequestCount > 0 ? (
        <InlineNotice tone="warning">
          褰撳墠绛涢€夋椂闂村唴宸叉湁 {formatInteger(blockedRequestCount)} 娆?AI 璇锋眰鍥犻绠楄秴闄愯闃绘柇锛屽彲鍦ㄤ笅鏂圭殑鈥滈绠楅樆鏂棩蹇椻€濋噷鐩存帴鏌ョ湅鍛戒腑瑙掕壊銆佸満鏅拰杩戞湡璁板綍銆?
        </InlineNotice>
      ) : null}

      {savePricingMutation.isError && savePricingMutation.error instanceof Error ? (
        <ErrorBlock message={savePricingMutation.error.message} />
      ) : null}

      {saveBudgetMutation.isError && saveBudgetMutation.error instanceof Error ? (
        <ErrorBlock message={saveBudgetMutation.error.message} />
      ) : null}

      <Card className="space-y-5 bg-[color:var(--surface-console)]">
        <AdminSectionHeader title="筛选条件" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <FilterField label="开始日期">
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={INPUT_CLASS_NAME} />
          </FilterField>
          <FilterField label="结束日期">
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={INPUT_CLASS_NAME} />
          </FilterField>
          <FilterField label="聚合粒度">
            <select value={grain} onChange={(event) => setGrain(event.target.value as "day" | "week" | "month")} className={INPUT_CLASS_NAME}>
              <option value="day">按天</option>
              <option value="week">按周</option>
              <option value="month">按月</option>
            </select>
          </FilterField>
          <FilterField label="角色">
            <select value={characterId} onChange={(event) => setCharacterId(event.target.value)} className={INPUT_CLASS_NAME}>
              <option value="">全部角色</option>
              {characters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="请求状态">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "" | TokenUsageStatus)}
              className={INPUT_CLASS_NAME}
            >
              <option value="">全部状态</option>
              <option value="success">仅成功</option>
              <option value="failed">仅失败</option>
            </select>
          </FilterField>
          <FilterField label="计费来源">
            <select
              value={billingSource}
              onChange={(event) => setBillingSource(event.target.value as "" | TokenUsageBillingSource)}
              className={INPUT_CLASS_NAME}
            >
              <option value="">全部来源</option>
              <option value="instance_default">实例默认 Key</option>
              <option value="owner_custom">世界主人 Key</option>
            </select>
          </FilterField>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="预算与预警"
            actions={
              budgetSummary ? (
                <span className="text-xs text-[color:var(--text-muted)]">
                  更新于 {formatDateTime(budgetSummary.generatedAt)}
                </span>
              ) : null
            }
          />

          <div className="mt-5 space-y-5">
            <BudgetStatusPanel
              title="整体预算"
              description="按今天和本月累计的真实账本用量来判断是否逼近阈值。"
              status={overallBudgetStatus}
              currency={currency}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <AdminMetaText>预警列表</AdminMetaText>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {budgetSummary?.alerts.length ?? 0} 条
                </span>
              </div>
              {budgetSummary?.alerts.length ? (
                <div className="grid gap-3">
                  {budgetSummary.alerts.map((alert, index) => (
                    <div
                      key={`${alert.scope}-${alert.period}-${alert.characterId ?? "overall"}-${index}`}
                      className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-[color:var(--text-primary)]">{alert.message}</div>
                          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                            已使用 {formatBudgetValue(alert.used, alert.metric, currency)} / 上限{" "}
                            {formatBudgetValue(alert.limit, alert.metric, currency)}
                          </div>
                        </div>
                        <BudgetStateBadge state={alert.level} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="当前没有触发预算预警。" />
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <AdminMetaText>按角色预算</AdminMetaText>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {(budgetSummary?.characters ?? []).length} 个角色
                </span>
              </div>
              {(budgetSummary?.characters ?? []).length ? (
                <div className="grid gap-3">
                  {(budgetSummary?.characters ?? []).map((item) => (
                    <CharacterBudgetPanel key={item.characterId} item={item} currency={currency} />
                  ))}
                </div>
              ) : (
                <EmptyState text="还没有配置任何角色预算。" />
              )}
            </div>
          </div>
        </Card>
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="预算配置"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addCharacterBudgetRule(setBudgetDraft, characters)}
                disabled={!availableCharacters.length}
              >
                新增角色预算
              </Button>
            }
          />

          <div className="mt-5 space-y-5">
            <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-[color:var(--text-primary)]">整体预算</div>
                  <div className="text-xs text-[color:var(--text-muted)]">支持按 token 或费用设置日预算、月预算和预警阈值。</div>
                </div>
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={budgetDraft?.overall.enabled === true}
                    onChange={(event) =>
                      setBudgetDraft((current) =>
                        current
                          ? {
                              ...current,
                              overall: { ...current.overall, enabled: event.target.checked },
                            }
                          : current,
                      )
                    }
                  />
                  启用
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <FilterField label="预算维度">
                  <select
                    value={budgetDraft?.overall.metric ?? "tokens"}
                    onChange={(event) =>
                      setBudgetDraft((current) =>
                        current
                          ? {
                              ...current,
                              overall: {
                                ...current.overall,
                                metric: event.target.value === "cost" ? "cost" : "tokens",
                              },
                            }
                          : current,
                      )
                    }
                    className={INPUT_CLASS_NAME}
                  >
                    <option value="tokens">按 Token</option>
                    <option value="cost">按费用</option>
                    </select>
                </FilterField>
                <FilterField label="执行方式">
                  <select
                    value={budgetDraft?.overall.enforcement ?? "monitor"}
                    onChange={(event) =>
                      setBudgetDraft((current) =>
                        current
                          ? {
                              ...current,
                              overall: {
                                ...current.overall,
                                enforcement:
                                  event.target.value === "block" ? "block" : "monitor",
                              },
                            }
                          : current,
                      )
                    }
                    className={INPUT_CLASS_NAME}
                  >
                    <option value="monitor">监控预警</option>
                    <option value="block">超限阻断</option>
                  </select>
                </FilterField>
                <FilterField label="预警阈值">
                  <select
                    value={String(budgetDraft?.overall.warningRatio ?? 0.8)}
                    onChange={(event) =>
                      setBudgetDraft((current) =>
                        current
                          ? {
                              ...current,
                              overall: {
                                ...current.overall,
                                warningRatio: Number(event.target.value) || 0.8,
                              },
                            }
                          : current,
                      )
                    }
                    className={INPUT_CLASS_NAME}
                  >
                    <option value="0.7">70%</option>
                    <option value="0.8">80%</option>
                    <option value="0.9">90%</option>
                  </select>
                </FilterField>
                <FilterField label="日预算上限">
                  <input
                    type="number"
                    min="0"
                    step={budgetDraft?.overall.metric === "cost" ? "0.01" : "1000"}
                    value={budgetDraft?.overall.dailyLimit ?? ""}
                    onChange={(event) =>
                      setBudgetDraft((current) =>
                        current
                          ? {
                              ...current,
                              overall: {
                                ...current.overall,
                                dailyLimit: event.target.value ? Number(event.target.value) : null,
                              },
                            }
                          : current,
                      )
                    }
                    placeholder={budgetDraft?.overall.metric === "cost" ? "例如 30" : "例如 500000"}
                    className={INPUT_CLASS_NAME}
                  />
                </FilterField>
                <FilterField label="月预算上限">
                  <input
                    type="number"
                    min="0"
                    step={budgetDraft?.overall.metric === "cost" ? "0.01" : "1000"}
                    value={budgetDraft?.overall.monthlyLimit ?? ""}
                    onChange={(event) =>
                      setBudgetDraft((current) =>
                        current
                          ? {
                              ...current,
                              overall: {
                                ...current.overall,
                                monthlyLimit: event.target.value ? Number(event.target.value) : null,
                              },
                            }
                          : current,
                      )
                    }
                    placeholder={budgetDraft?.overall.metric === "cost" ? "例如 500" : "例如 5000000"}
                    className={INPUT_CLASS_NAME}
                  />
                </FilterField>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <AdminMetaText>角色预算</AdminMetaText>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {(budgetDraft?.characters ?? []).length} 条
                </span>
              </div>

              {(budgetDraft?.characters ?? []).length ? (
                (budgetDraft?.characters ?? []).map((item, index) => (
                  <CharacterBudgetEditor
                    key={`${item.characterId || "character"}-${index}`}
                    characters={characters}
                    item={item}
                    index={index}
                    setBudgetDraft={setBudgetDraft}
                  />
                ))
              ) : (
                <EmptyState text="还没有角色预算配置，点击右上角可以新增。" />
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="primary" onClick={() => saveBudgetMutation.mutate()} disabled={saveBudgetMutation.isPending}>
                {saveBudgetMutation.isPending ? "保存中..." : "保存预算配置"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.85fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="Budget Block Log"
            actions={
              <span className="text-xs text-[color:var(--text-muted)]">
                {formatInteger(blockedRequestCount)} hits
              </span>
            }
          />

          {blockedRequestCount ? (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryTile label="Blocked Requests" value={formatInteger(blockedRequestCount)} />
                <SummaryTile label="Affected Characters" value={formatInteger(blockedOverview?.activeCharacterCount ?? 0)} />
                <SummaryTile label="Share Of Failed" value={formatPercent(blockedFailureShare)} />
                <SummaryTile
                  label="Last Hit"
                  value={blockedLastRecord ? formatDateTime(blockedLastRecord.occurredAt) : "--"}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <AdminMetaText>Block Trend</AdminMetaText>
                  <span className="text-xs text-[color:var(--text-muted)]">
                    Grouped by {grain === "month" ? "month" : grain === "week" ? "week" : "day"}
                  </span>
                </div>

                {blockedTrend.length ? (
                  <div className="space-y-3">
                    {blockedTrend.map((point) => (
                      <div key={point.bucketStart} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--text-secondary)]">
                          <span>{point.label}</span>
                          <span>{formatInteger(point.requestCount)} blocked</span>
                        </div>
                        <div className="h-3 rounded-full bg-[color:var(--surface-primary)]">
                          <div
                            className="h-3 rounded-full bg-[linear-gradient(90deg,rgba(244,63,94,0.92),rgba(249,115,22,0.92))]"
                            style={{ width: `${Math.max(8, (point.requestCount / maxBlockedRequestCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="No budget block trend data in the current range." />
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState text="No budget block records in the current range." />
            </div>
          )}
        </Card>

        <div className="grid gap-6">
          <RequestBreakdownCard
            title="Blocked Characters"
            items={blockedBreakdown?.byCharacter ?? []}
            emptyText="No character-level block records yet."
          />
          <RequestBreakdownCard
            title="Blocked Scenes"
            items={blockedBreakdown?.byScene ?? []}
            emptyText="No scene-level block records yet."
          />
        </div>
      </div>

      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader title="Recent Budget Blocks" />
        {blockedRecords?.items.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                <tr>
                  <th className="pb-3 pr-4 font-medium">Time</th>
                  <th className="pb-3 pr-4 font-medium">Target</th>
                  <th className="pb-3 pr-4 font-medium">Scene</th>
                  <th className="pb-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border-faint)] text-[color:var(--text-secondary)]">
                {blockedRecords.items.map((record) => (
                  <tr key={`blocked-${record.id}`}>
                    <td className="py-3 pr-4">{formatDateTime(record.occurredAt)}</td>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-[color:var(--text-primary)]">{record.targetLabel}</div>
                      <div className="text-xs text-[color:var(--text-muted)]">{record.characterName || record.scopeType}</div>
                    </td>
                    <td className="py-3 pr-4">{formatScene(record.scene)}</td>
                    <td className="py-3">
                      <div className="font-medium text-[color:var(--text-primary)]">{formatErrorCode(record.errorCode)}</div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {record.errorMessage || "Budget blocked"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState text="No recent budget block records yet." />
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="时间趋势"
            actions={
              <span className="text-xs text-[color:var(--text-muted)]">
                请求 {formatInteger(overview?.requestCount ?? 0)} 次
              </span>
            }
          />
          {trend.length ? (
            <div className="mt-5 space-y-3">
              {trend.map((point) => (
                <div key={point.bucketStart} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs text-[color:var(--text-secondary)]">
                    <span>{point.label}</span>
                    <span>
                      {formatInteger(point.totalTokens)} token / {formatCost(point.estimatedCost, currency)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-[color:var(--surface-primary)]">
                    <div
                      className="h-3 rounded-full bg-[linear-gradient(90deg,rgba(249,115,22,0.92),rgba(244,114,182,0.9))]"
                      style={{ width: `${Math.max(6, (point.totalTokens / maxTrendTokens) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="当前筛选条件下还没有可展示的趋势数据。" />
          )}
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader title="实例总览" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <SummaryTile label="成功请求" value={formatInteger(overview?.successCount ?? 0)} />
            <SummaryTile label="失败请求" value={formatInteger(overview?.failedCount ?? 0)} />
            <SummaryTile label="活跃角色" value={formatInteger(overview?.activeCharacterCount ?? 0)} />
            <SummaryTile
              label="平均单次 Token"
              value={formatInteger(calculateAverageTokens(overview?.totalTokens ?? 0, overview?.requestCount ?? 0))}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <BreakdownCard title="角色排行" items={breakdown?.byCharacter ?? []} currency={currency} emptyText="当前还没有角色维度的账本。" />
        <BreakdownCard title="场景排行" items={breakdown?.byScene ?? []} currency={currency} emptyText="当前还没有场景维度的账本。" />
        <BreakdownCard title="模型排行" items={breakdown?.byModel ?? []} currency={currency} emptyText="当前还没有模型维度的账本。" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader title="请求明细" />
          {records?.items.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">时间</th>
                    <th className="pb-3 pr-4 font-medium">对象</th>
                    <th className="pb-3 pr-4 font-medium">场景</th>
                    <th className="pb-3 pr-4 font-medium">模型</th>
                    <th className="pb-3 pr-4 font-medium">Token</th>
                    <th className="pb-3 pr-4 font-medium">费用</th>
                    <th className="pb-3 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-faint)] text-[color:var(--text-secondary)]">
                  {records.items.map((record) => (
                    <tr key={record.id}>
                      <td className="py-3 pr-4">{formatDateTime(record.occurredAt)}</td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-[color:var(--text-primary)]">{record.targetLabel}</div>
                        <div className="text-xs text-[color:var(--text-muted)]">{record.characterName || record.scopeType}</div>
                      </td>
                      <td className="py-3 pr-4">{formatScene(record.scene)}</td>
                      <td className="py-3 pr-4">{record.model || "未记录"}</td>
                      <td className="py-3 pr-4">
                        <div>{formatInteger(record.totalTokens)}</div>
                        <div className="text-xs text-[color:var(--text-muted)]">
                          In {formatInteger(record.promptTokens)} / Out {formatInteger(record.completionTokens)}
                        </div>
                      </td>
                      <td className="py-3 pr-4">{formatCost(record.estimatedCost, record.currency)}</td>
                      <td className="py-3">
                        <span
                          className={
                            record.status === "success"
                              ? "rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                              : "rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"
                          }
                        >
                          {record.status === "success" ? "成功" : "失败"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="当前筛选条件下还没有账本明细。" />
          )}
        </Card>

        <Card className="bg-[color:var(--surface-console)]">
          <AdminSectionHeader
            title="模型价格"
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPricingDraft((current) => ({
                    currency: current?.currency ?? "CNY",
                    items: [...(current?.items ?? []), emptyPricingItem()],
                  }))
                }
              >
                新增模型
              </Button>
            }
          />

          <div className="mt-5 space-y-3">
            <FilterField label="结算币种">
              <select
                value={pricingDraft?.currency ?? "CNY"}
                onChange={(event) =>
                  setPricingDraft((current) => ({
                    currency: event.target.value === "USD" ? "USD" : "CNY",
                    items: current?.items ?? [],
                  }))
                }
                className={INPUT_CLASS_NAME}
              >
                <option value="CNY">CNY</option>
                <option value="USD">USD</option>
              </select>
            </FilterField>

            {(pricingDraft?.items ?? []).length ? (
              (pricingDraft?.items ?? []).map((item, index) => (
                <div
                  key={`${item.model}-${index}`}
                  className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3"
                >
                  <div className="grid gap-3">
                    <input
                      value={item.model}
                      onChange={(event) => updatePricingItem(setPricingDraft, index, { model: event.target.value })}
                      placeholder="模型名，例如 deepseek-chat"
                      className={INPUT_CLASS_NAME}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={item.inputPer1kTokens}
                        onChange={(event) =>
                          updatePricingItem(setPricingDraft, index, {
                            inputPer1kTokens: Number(event.target.value) || 0,
                          })
                        }
                        placeholder="输入单价 / 1K token"
                        className={INPUT_CLASS_NAME}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={item.outputPer1kTokens}
                        onChange={(event) =>
                          updatePricingItem(setPricingDraft, index, {
                            outputPer1kTokens: Number(event.target.value) || 0,
                          })
                        }
                        placeholder="输出单价 / 1K token"
                        className={INPUT_CLASS_NAME}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={item.enabled !== false}
                          onChange={(event) =>
                            updatePricingItem(setPricingDraft, index, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                        启用该模型
                      </label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPricingDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  items: current.items.filter((_, itemIndex) => itemIndex !== index),
                                }
                              : current,
                          )
                        }
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState text="还没有配置任何模型价格。" />
            )}
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="primary" onClick={() => savePricingMutation.mutate()} disabled={savePricingMutation.isPending}>
              {savePricingMutation.isPending ? "保存中..." : "保存价格配置"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function BudgetStatusPanel({
  title,
  description,
  status,
  currency,
}: {
  title: string;
  description: string;
  status: TokenUsageBudgetStatus;
  currency: "CNY" | "USD";
}) {
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-[color:var(--text-primary)]">{title}</div>
          <div className="text-xs text-[color:var(--text-muted)]">{description}</div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            当前模式：{formatBudgetEnforcement(status.enforcement)}
          </div>
        </div>
        <BudgetStateBadge state={resolveBudgetState(status)} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BudgetPeriodCard label="今日" summary={status.daily} metric={status.metric} currency={currency} />
        <BudgetPeriodCard label="本月" summary={status.monthly} metric={status.metric} currency={currency} />
      </div>
    </div>
  );
}

function CharacterBudgetPanel({
  item,
  currency,
}: {
  item: TokenUsageCharacterBudgetStatus;
  currency: "CNY" | "USD";
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-[color:var(--text-primary)]">{item.characterName}</div>
          {item.note ? <div className="text-xs text-[color:var(--text-muted)]">{item.note}</div> : null}
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            当前模式：{formatBudgetEnforcement(item.budget.enforcement)}
          </div>
        </div>
        <BudgetStateBadge state={resolveBudgetState(item.budget)} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BudgetPeriodCard label="今日" summary={item.budget.daily} metric={item.budget.metric} currency={currency} compact />
        <BudgetPeriodCard label="本月" summary={item.budget.monthly} metric={item.budget.metric} currency={currency} compact />
      </div>
    </div>
  );
}

function BudgetPeriodCard({
  label,
  summary,
  metric,
  currency,
  compact = false,
}: {
  label: string;
  summary: TokenUsageBudgetPeriodSummary;
  metric: TokenUsageBudgetMetric;
  currency: "CNY" | "USD";
  compact?: boolean;
}) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-[color:var(--text-primary)]">{label}</div>
        <BudgetStateBadge state={summary.state} compact />
      </div>
      <div className={compact ? "mt-2 space-y-1.5" : "mt-3 space-y-2"}>
        <div className="text-xs text-[color:var(--text-muted)]">已使用 {formatBudgetValue(summary.used, metric, currency)}</div>
        <div className="text-xs text-[color:var(--text-muted)]">预算上限 {formatBudgetValue(summary.limit, metric, currency)}</div>
        <div className="text-xs text-[color:var(--text-muted)]">剩余额度 {formatBudgetValue(summary.remaining, metric, currency)}</div>
        <div className="text-xs text-[color:var(--text-muted)]">预算占比 {formatRatio(summary.ratio)}</div>
      </div>
    </div>
  );
}

function CharacterBudgetEditor({
  characters,
  item,
  index,
  setBudgetDraft,
}: {
  characters: Character[];
  item: TokenUsageCharacterBudgetRule;
  index: number;
  setBudgetDraft: Dispatch<SetStateAction<TokenUsageBudgetConfig | null>>;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium text-[color:var(--text-primary)]">角色预算 #{index + 1}</div>
          <div className="text-xs text-[color:var(--text-muted)]">可按 token 或费用给单个角色设置今天、本月预算上限。</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setBudgetDraft((current) =>
              current
                ? {
                    ...current,
                    characters: current.characters.filter((_, currentIndex) => currentIndex !== index),
                  }
                : current,
            )
          }
        >
          删除
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <FilterField label="角色">
          <select
            value={item.characterId}
            onChange={(event) => updateBudgetCharacter(setBudgetDraft, index, { characterId: event.target.value })}
            className={INPUT_CLASS_NAME}
          >
            <option value="">选择角色</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="预警阈值">
          <select
            value={String(item.warningRatio ?? 0.8)}
            onChange={(event) =>
              updateBudgetCharacter(setBudgetDraft, index, {
                warningRatio: Number(event.target.value) || 0.8,
              })
            }
            className={INPUT_CLASS_NAME}
          >
            <option value="0.7">70%</option>
            <option value="0.8">80%</option>
            <option value="0.9">90%</option>
          </select>
        </FilterField>
        <FilterField label="执行方式">
          <select
            value={item.enforcement ?? "monitor"}
            onChange={(event) =>
              updateBudgetCharacter(setBudgetDraft, index, {
                enforcement: event.target.value === "block" ? "block" : "monitor",
              })
            }
            className={INPUT_CLASS_NAME}
          >
            <option value="monitor">监控预警</option>
            <option value="block">超限阻断</option>
          </select>
        </FilterField>
        <FilterField label="预算维度">
          <select
            value={item.metric}
            onChange={(event) =>
              updateBudgetCharacter(setBudgetDraft, index, {
                metric: event.target.value === "cost" ? "cost" : "tokens",
              })
            }
            className={INPUT_CLASS_NAME}
          >
            <option value="tokens">按 Token</option>
            <option value="cost">按费用</option>
          </select>
        </FilterField>
        <FilterField label="备注">
          <input
            value={item.note ?? ""}
            onChange={(event) => updateBudgetCharacter(setBudgetDraft, index, { note: event.target.value })}
            placeholder="例如高频聊天角色"
            className={INPUT_CLASS_NAME}
          />
        </FilterField>
        <FilterField label="日预算上限">
          <input
            type="number"
            min="0"
            step={item.metric === "cost" ? "0.01" : "1000"}
            value={item.dailyLimit ?? ""}
            onChange={(event) =>
              updateBudgetCharacter(setBudgetDraft, index, {
                dailyLimit: event.target.value ? Number(event.target.value) : null,
              })
            }
            placeholder={item.metric === "cost" ? "例如 10" : "例如 100000"}
            className={INPUT_CLASS_NAME}
          />
        </FilterField>
        <FilterField label="月预算上限">
          <input
            type="number"
            min="0"
            step={item.metric === "cost" ? "0.01" : "1000"}
            value={item.monthlyLimit ?? ""}
            onChange={(event) =>
              updateBudgetCharacter(setBudgetDraft, index, {
                monthlyLimit: event.target.value ? Number(event.target.value) : null,
              })
            }
            placeholder={item.metric === "cost" ? "例如 200" : "例如 1000000"}
            className={INPUT_CLASS_NAME}
          />
        </FilterField>
      </div>

      <label className="mt-4 flex items-center gap-2 text-xs text-[color:var(--text-secondary)]">
        <input
          type="checkbox"
          checked={item.enabled !== false}
          onChange={(event) => updateBudgetCharacter(setBudgetDraft, index, { enabled: event.target.checked })}
        />
        启用该角色预算
      </label>
    </div>
  );
}

function BreakdownCard({
  title,
  items,
  currency,
  emptyText,
}: {
  title: string;
  items: TokenUsageBreakdownItem[];
  currency: "CNY" | "USD";
  emptyText: string;
}) {
  const maxTokens = Math.max(...items.map((item) => item.totalTokens), 1);

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title={title} />
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <div key={`${title}-${item.key}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-[color:var(--text-primary)]">{item.label}</div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {formatInteger(item.requestCount)} 次请求 / {formatCost(item.estimatedCost, currency)}
                  </div>
                </div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">{formatInteger(item.totalTokens)}</div>
              </div>
              <div className="h-2 rounded-full bg-[color:var(--surface-primary)]">
                <div
                  className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(249,115,22,0.92),rgba(251,191,36,0.92))]"
                  style={{ width: `${Math.max(8, (item.totalTokens / maxTokens) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text={emptyText} />
      )}
    </Card>
  );
}

function RequestBreakdownCard({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: TokenUsageBreakdownItem[];
  emptyText: string;
}) {
  const maxRequests = Math.max(...items.map((item) => item.requestCount), 1);

  return (
    <Card className="bg-[color:var(--surface-console)]">
      <AdminSectionHeader title={title} />
      {items.length ? (
        <div className="mt-5 space-y-3">
          {items.map((item) => (
            <div key={`${title}-${item.key}`} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-[color:var(--text-primary)]">{item.label}</div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {formatInteger(item.requestCount)} requests
                  </div>
                </div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {formatInteger(item.requestCount)}
                </div>
              </div>
              <div className="h-2 rounded-full bg-[color:var(--surface-primary)]">
                <div
                  className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(244,63,94,0.92),rgba(249,115,22,0.92))]"
                  style={{ width: `${Math.max(8, (item.requestCount / maxRequests) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text={emptyText} />
      )}
    </Card>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2">
      <AdminMetaText>{label}</AdminMetaText>
      {children}
    </label>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3">
      <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-xl font-semibold text-[color:var(--text-primary)]">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-sm text-[color:var(--text-muted)]">{text}</div>;
}

function BudgetStateBadge({
  state,
}: {
  state: TokenUsageBudgetState | "warning" | "exceeded";
  compact?: boolean;
}) {
  const normalizedState: TokenUsageBudgetState =
    state === "warning" || state === "exceeded" ? state : state;
  const className =
    normalizedState === "exceeded"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : normalizedState === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : normalizedState === "normal"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${className}`}>
      {formatBudgetState(normalizedState)}
    </span>
  );
}

function calculateAverageTokens(totalTokens: number, requestCount: number) {
  if (!requestCount) {
    return 0;
  }
  return Math.round(totalTokens / requestCount);
}

function calculateRatio(value: number, total: number) {
  if (!total) {
    return 0;
  }
  return value / total;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatErrorCode(value?: string | null) {
  if (value === "BUDGET_BLOCKED") {
    return "Budget blocked";
  }
  if (!value) {
    return "Unknown";
  }
  return value;
}

function formatBudgetState(state: TokenUsageBudgetState) {
  if (state === "exceeded") {
    return "超限";
  }
  if (state === "warning") {
    return "预警";
  }
  if (state === "normal") {
    return "正常";
  }
  return "未启用";
}

function formatBudgetEnforcement(value: TokenUsageBudgetEnforcement) {
  return value === "block" ? "超限阻断" : "监控预警";
}

function resolveBudgetState(status: TokenUsageBudgetStatus): TokenUsageBudgetState {
  const states = [status.daily.state, status.monthly.state];
  if (states.includes("exceeded")) {
    return "exceeded";
  }
  if (states.includes("warning")) {
    return "warning";
  }
  if (states.includes("normal")) {
    return "normal";
  }
  return "inactive";
}

function createInactiveBudgetStatus(): TokenUsageBudgetStatus {
  return {
    enabled: false,
    metric: "tokens",
    enforcement: "monitor",
    warningRatio: 0.8,
    daily: {
      period: "daily",
      limit: null,
      used: 0,
      remaining: null,
      ratio: null,
      state: "inactive",
    },
    monthly: {
      period: "monthly",
      limit: null,
      used: 0,
      remaining: null,
      ratio: null,
      state: "inactive",
    },
  };
}

function formatScene(scene: string) {
  const sceneMap: Record<string, string> = {
    chat_reply: "单聊回复",
    group_reply: "群聊回复",
    moment_post_generate: "朋友圈生成",
    moment_comment_generate: "朋友圈评论",
    feed_post_generate: "广场动态生成",
    feed_comment_generate: "广场评论生成",
    channel_post_generate: "视频号生成",
    social_greeting_generate: "社交问候",
    memory_compress: "记忆压缩",
    character_factory_extract: "角色工厂抽取",
    quick_character_generate: "快速生成角色",
    intent_classify: "意图分类",
  };

  return sceneMap[scene] ?? scene;
}

function applyPreset(
  preset: "7d" | "30d" | "month",
  setFrom: (value: string) => void,
  setTo: (value: string) => void,
) {
  setTo(formatDateInput(new Date()));
  if (preset === "month") {
    setFrom(monthStartInput());
    return;
  }
  setFrom(preset === "30d" ? shiftDate(-29) : shiftDate(-6));
}

function normalizeNullableNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Number(value);
}

function updatePricingItem(
  setPricingDraft: Dispatch<SetStateAction<TokenPricingCatalog | null>>,
  index: number,
  patch: Partial<TokenPricingCatalogItem>,
) {
  setPricingDraft((current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    };
  });
}

function addCharacterBudgetRule(
  setBudgetDraft: Dispatch<SetStateAction<TokenUsageBudgetConfig | null>>,
  characters: Character[],
) {
  setBudgetDraft((current) => {
    const next = current ?? emptyBudgetConfig();
    const used = new Set(next.characters.map((item) => item.characterId));
    const candidate = characters.find((item) => !used.has(item.id));
    if (!candidate) {
      return next;
    }
    return {
      ...next,
      characters: [...next.characters, emptyCharacterBudgetRule(candidate.id)],
    };
  });
}

function updateBudgetCharacter(
  setBudgetDraft: Dispatch<SetStateAction<TokenUsageBudgetConfig | null>>,
  index: number,
  patch: Partial<TokenUsageCharacterBudgetRule>,
) {
  setBudgetDraft((current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      characters: current.characters.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    };
  });
}

const INPUT_CLASS_NAME =
  "w-full rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]";
