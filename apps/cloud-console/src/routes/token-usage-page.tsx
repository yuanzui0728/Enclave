import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  CloudTokenPricingItem,
  CloudTokenUsageBudgetItem,
  CloudTokenUsageWorldRow,
  TokenUsageBudgetEnforcement,
  TokenUsageBudgetMetric,
  TokenUsageTrendPoint,
} from "@yinjie/contracts";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { useConsoleNotice } from "../components/console-notice";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import { useCloudConsoleText } from "../lib/cloud-console-i18n";

const SECTION =
  "rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]";
const FIELD =
  "w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]";
const BUTTON =
  "rounded-2xl border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-2 text-sm font-semibold text-[color:var(--brand-primary)] transition hover:border-[color:var(--border-strong)]";
const SECONDARY_BUTTON =
  "rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-4 py-2 text-sm font-medium text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]";

type RangePreset = "7d" | "30d" | "90d";
type TabKey = "overview" | "worlds" | "budget" | "pricing";

function presetToRange(preset: RangePreset): { from: string; to: string } {
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const today = new Date();
  const from = new Date(today.getTime() - (days - 1) * 86_400_000);
  return { from: isoDate(from), to: isoDate(today) };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatCost(value: number, currency: string): string {
  return `${currency} ${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

export function TokenUsagePage() {
  const t = useCloudConsoleText();
  const [tab, setTab] = useState<TabKey>("overview");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const range = useMemo(() => presetToRange(preset), [preset]);

  return (
    <div className="space-y-6">
      <section className={SECTION}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
              {t("Cloud monetization")}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[color:var(--text-primary)]">
              {t("Token Usage")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[color:var(--text-secondary)]">
              {t(
                "Track LLM token consumption and cost across worlds, with platform-level budgets and pricing.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["7d", "30d", "90d"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={
                  preset === option ? BUTTON : SECONDARY_BUTTON
                }
                onClick={() => setPreset(option)}
              >
                {option === "7d"
                  ? t("Last 7 days")
                  : option === "30d"
                    ? t("Last 30 days")
                    : t("Last 90 days")}
              </button>
            ))}
          </div>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2">
        {(
          [
            { key: "overview", label: t("Overview") },
            { key: "worlds", label: t("Worlds") },
            { key: "budget", label: t("Budget") },
            { key: "pricing", label: t("Pricing") },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? BUTTON : SECONDARY_BUTTON}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab range={range} />}
      {tab === "worlds" && <WorldsTab range={range} />}
      {tab === "budget" && <BudgetTab />}
      {tab === "pricing" && <PricingTab />}
    </div>
  );
}

function OverviewTab({ range }: { range: { from: string; to: string } }) {
  const t = useCloudConsoleText();
  const overviewQuery = useQuery({
    queryKey: ["token-usage", "overview", range.from, range.to],
    queryFn: () => cloudAdminApi.getCloudTokenUsageOverview(range),
  });
  const trendsQuery = useQuery({
    queryKey: ["token-usage", "trends", range.from, range.to],
    queryFn: () => cloudAdminApi.getCloudTokenUsageTrends(range),
  });

  if (overviewQuery.error) {
    return <CloudAdminErrorBlock error={overviewQuery.error} />;
  }

  const overview = overviewQuery.data;
  const trends = trendsQuery.data ?? [];
  const currency = overview?.currency ?? "CNY";
  const failureRate =
    overview && overview.requestCount > 0
      ? overview.failedCount / overview.requestCount
      : null;

  return (
    <div className="space-y-6">
      <section className={SECTION}>
        <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
          {overviewQuery.isLoading || !overview ? (
            Array.from({ length: 2 }).map((_, idx) => (
              <div
                key={idx}
                className="h-28 animate-pulse rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)]"
              />
            ))
          ) : (
            <>
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-4">
                <div className="text-xs text-[color:var(--text-muted)]">
                  {t("Estimated cost")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                  {formatCost(overview.estimatedCost, currency)}
                </div>
                <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                  {t("Total tokens")}: {formatNumber(overview.totalTokens)}
                  {" · "}
                  {t("Request count")}: {formatNumber(overview.requestCount)}
                  {" · "}
                  {t("Active worlds")}:{" "}
                  {formatNumber(overview.activeWorldCount)}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {t("Failed requests")}
                  </div>
                  <div className="text-xs text-[color:var(--text-muted)]">
                    {t("Failure rate")}: {formatPercent(failureRate)}
                  </div>
                </div>
                <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                  {formatNumber(overview.failedCount)}
                </div>
                <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                  {t("Successful requests")}:{" "}
                  {formatNumber(overview.successCount)}
                  {" · "}
                  {t("Active characters")}:{" "}
                  {formatNumber(overview.activeCharacterCount)}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className={SECTION}>
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          {t("Daily trends")}
        </div>
        <div className="mt-3" style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={trendDataForChart(trends)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
              <YAxis
                yAxisId="tokens"
                stroke="#64748b"
                fontSize={11}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="cost"
                orientation="right"
                stroke="#64748b"
                fontSize={11}
              />
              <Tooltip
                formatter={(value, name) => {
                  const num = Number(value);
                  if (!Number.isFinite(num)) return String(value);
                  if (name === t("Estimated cost")) {
                    return formatCost(num, currency);
                  }
                  return formatNumber(num);
                }}
              />
              <Legend />
              <Line
                yAxisId="tokens"
                type="monotone"
                dataKey="totalTokens"
                name={t("Total tokens")}
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="cost"
                type="monotone"
                dataKey="estimatedCost"
                name={t("Estimated cost")}
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function trendDataForChart(points: TokenUsageTrendPoint[]) {
  return points.map((point) => ({
    date: point.label || point.bucketStart,
    totalTokens: point.totalTokens,
    estimatedCost: Math.round(point.estimatedCost * 100) / 100,
  }));
}

function WorldsTab({ range }: { range: { from: string; to: string } }) {
  const t = useCloudConsoleText();
  const [sort, setSort] = useState<
    "tokens" | "cost" | "requests" | "failureRate"
  >("tokens");
  const [search, setSearch] = useState("");

  const worldsQuery = useQuery({
    queryKey: ["token-usage", "worlds", range.from, range.to, sort, search],
    queryFn: () =>
      cloudAdminApi.listCloudTokenUsageWorlds({
        from: range.from,
        to: range.to,
        sort,
        dir: "desc",
        page: 1,
        pageSize: 100,
        search: search || undefined,
      }),
  });

  if (worldsQuery.error) {
    return <CloudAdminErrorBlock error={worldsQuery.error} />;
  }

  const items = worldsQuery.data?.items ?? [];

  return (
    <section className={SECTION}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          {t("Worlds")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className={`${FIELD} w-56`}
            placeholder={t("Search worlds")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className={FIELD}
            value={sort}
            onChange={(event) =>
              setSort(event.target.value as typeof sort)
            }
          >
            <option value="tokens">{t("Sort by tokens")}</option>
            <option value="cost">{t("Sort by cost")}</option>
            <option value="requests">{t("Sort by requests")}</option>
            <option value="failureRate">{t("Sort by failure rate")}</option>
          </select>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--border-subtle)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface-input)] text-left text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-2">{t("World")}</th>
              <th className="px-4 py-2 text-right">{t("Total tokens")}</th>
              <th className="px-4 py-2 text-right">{t("Estimated cost")}</th>
              <th className="px-4 py-2 text-right">{t("Request count")}</th>
              <th className="px-4 py-2 text-right">{t("Failure rate")}</th>
              <th className="px-4 py-2 text-right">{t("Active characters")}</th>
            </tr>
          </thead>
          <tbody>
            {worldsQuery.isLoading ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-[color:var(--text-muted)]"
                  colSpan={6}
                >
                  {t("Loading…")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-6 text-center text-[color:var(--text-muted)]"
                  colSpan={6}
                >
                  {t("No data for the selected range yet.")}
                </td>
              </tr>
            ) : (
              items.map((row) => <WorldRow key={row.worldId} row={row} />)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorldRow({ row }: { row: CloudTokenUsageWorldRow }) {
  return (
    <tr className="border-t border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-input)]">
      <td className="px-4 py-2">
        <Link
          to="/token-usage/$worldId"
          params={{ worldId: row.worldId }}
          className="text-[color:var(--brand-primary)] hover:underline"
        >
          {row.worldName ?? row.worldSlug ?? row.worldId}
        </Link>
        <div className="text-xs text-[color:var(--text-muted)]">
          {row.worldSlug ?? row.worldId}
        </div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {formatNumber(row.totalTokens)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {formatCost(row.estimatedCost, row.currency)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {formatNumber(row.requestCount)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {formatPercent(row.failureRate)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {formatNumber(row.activeCharacterCount)}
      </td>
    </tr>
  );
}

function BudgetTab() {
  const t = useCloudConsoleText();
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const budgetsQuery = useQuery({
    queryKey: ["token-usage", "budgets"],
    queryFn: () => cloudAdminApi.getCloudTokenUsageBudgets(),
  });

  const upsertMutation = useMutation({
    mutationFn: cloudAdminApi.upsertCloudTokenUsageBudget,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["token-usage", "budgets"],
      });
      showNotice(t("Budget saved."));
    },
    onError: (error: unknown) => showCloudAdminErrorNotice(showNotice, error),
  });

  const deleteMutation = useMutation({
    mutationFn: (worldId: string) =>
      cloudAdminApi.deleteCloudTokenUsageBudget(worldId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["token-usage", "budgets"],
      });
      showNotice(t("Budget removed."));
    },
    onError: (error: unknown) => showCloudAdminErrorNotice(showNotice, error),
  });

  if (budgetsQuery.error) {
    return <CloudAdminErrorBlock error={budgetsQuery.error} />;
  }

  const data = budgetsQuery.data;

  return (
    <div className="space-y-6">
      <section className={SECTION}>
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          {t("Platform-default budget")}
        </div>
        <p className="mt-1 text-xs text-[color:var(--text-muted)]">
          {t(
            "Applied as the default platform budget; per-world overrides take precedence.",
          )}
        </p>
        <BudgetEditor
          initial={data?.global ?? null}
          worldIdLocked={null}
          onSubmit={(rule) =>
            upsertMutation.mutate({ worldId: null, rule })
          }
          submitting={upsertMutation.isPending}
        />
      </section>

      <section className={SECTION}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {t("Per-world overrides")}
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {(data?.worlds ?? []).map((item) => (
            <div
              key={item.worldId ?? "unknown"}
              className="rounded-2xl border border-[color:var(--border-subtle)] p-3"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {t("World")}: {item.worldId}
                </div>
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => {
                    if (item.worldId) {
                      deleteMutation.mutate(item.worldId);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  {t("Remove")}
                </button>
              </div>
              <BudgetEditor
                initial={item}
                worldIdLocked={item.worldId}
                onSubmit={(rule) =>
                  upsertMutation.mutate({ worldId: item.worldId, rule })
                }
                submitting={upsertMutation.isPending}
              />
            </div>
          ))}
          <div className="rounded-2xl border border-dashed border-[color:var(--border-subtle)] p-3">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              {t("Add per-world override")}
            </div>
            <BudgetEditor
              initial={null}
              worldIdLocked={null}
              requireWorldId
              onSubmit={(rule, worldId) =>
                upsertMutation.mutate({ worldId: worldId ?? null, rule })
              }
              submitting={upsertMutation.isPending}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function BudgetEditor(props: {
  initial: CloudTokenUsageBudgetItem | null;
  worldIdLocked: string | null;
  requireWorldId?: boolean;
  onSubmit: (
    rule: {
      enabled: boolean;
      metric: TokenUsageBudgetMetric;
      enforcement: TokenUsageBudgetEnforcement;
      downgradeModel: string | null;
      dailyLimit: number | null;
      monthlyLimit: number | null;
      warningRatio: number;
      note: string | null;
    },
    worldId?: string | null,
  ) => void;
  submitting: boolean;
}) {
  const t = useCloudConsoleText();
  const initial = props.initial;
  const [worldId, setWorldId] = useState<string>(
    props.worldIdLocked ?? "",
  );
  const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? false);
  const [metric, setMetric] = useState<TokenUsageBudgetMetric>(
    initial?.metric ?? "tokens",
  );
  const [enforcement, setEnforcement] = useState<TokenUsageBudgetEnforcement>(
    initial?.enforcement ?? "monitor",
  );
  const [downgradeModel, setDowngradeModel] = useState<string>(
    initial?.downgradeModel ?? "",
  );
  const [dailyLimit, setDailyLimit] = useState<string>(
    initial?.dailyLimit?.toString() ?? "",
  );
  const [monthlyLimit, setMonthlyLimit] = useState<string>(
    initial?.monthlyLimit?.toString() ?? "",
  );
  const [warningRatio, setWarningRatio] = useState<string>(
    String(initial?.warningRatio ?? 0.8),
  );
  const [note, setNote] = useState<string>(initial?.note ?? "");

  const handleSubmit = () => {
    const rule = {
      enabled,
      metric,
      enforcement,
      downgradeModel: downgradeModel.trim() || null,
      dailyLimit: dailyLimit.trim() ? Number(dailyLimit) : null,
      monthlyLimit: monthlyLimit.trim() ? Number(monthlyLimit) : null,
      warningRatio: Number(warningRatio) || 0.8,
      note: note.trim() || null,
    };
    if (props.requireWorldId) {
      props.onSubmit(rule, worldId.trim() || null);
    } else {
      props.onSubmit(rule);
    }
  };

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      {props.requireWorldId && (
        <label className="block">
          <span className="text-xs text-[color:var(--text-muted)]">
            {t("World ID")}
          </span>
          <input
            className={FIELD}
            value={worldId}
            onChange={(event) => setWorldId(event.target.value)}
            placeholder={t("World ID")}
          />
        </label>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span className="text-sm">{t("Enabled")}</span>
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Metric")}
        </span>
        <select
          className={FIELD}
          value={metric}
          onChange={(event) =>
            setMetric(event.target.value as TokenUsageBudgetMetric)
          }
        >
          <option value="tokens">{t("Tokens")}</option>
          <option value="cost">{t("Cost")}</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Enforcement")}
        </span>
        <select
          className={FIELD}
          value={enforcement}
          onChange={(event) =>
            setEnforcement(event.target.value as TokenUsageBudgetEnforcement)
          }
        >
          <option value="monitor">{t("Monitor")}</option>
          <option value="downgrade">{t("Downgrade model")}</option>
          <option value="block">{t("Block")}</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Downgrade model")}
        </span>
        <input
          className={FIELD}
          value={downgradeModel}
          onChange={(event) => setDowngradeModel(event.target.value)}
          placeholder={t("Optional")}
        />
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Daily limit")}
        </span>
        <input
          className={FIELD}
          type="number"
          value={dailyLimit}
          onChange={(event) => setDailyLimit(event.target.value)}
          placeholder={t("Optional")}
        />
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Monthly limit")}
        </span>
        <input
          className={FIELD}
          type="number"
          value={monthlyLimit}
          onChange={(event) => setMonthlyLimit(event.target.value)}
          placeholder={t("Optional")}
        />
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Warning ratio (0-1)")}
        </span>
        <input
          className={FIELD}
          type="number"
          step="0.05"
          min={0}
          max={1}
          value={warningRatio}
          onChange={(event) => setWarningRatio(event.target.value)}
        />
      </label>
      <label className="block md:col-span-2">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Note")}
        </span>
        <input
          className={FIELD}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("Optional")}
        />
      </label>
      <div className="md:col-span-2">
        <button
          type="button"
          className={BUTTON}
          onClick={handleSubmit}
          disabled={props.submitting}
        >
          {t("Save")}
        </button>
      </div>
    </div>
  );
}

function PricingTab() {
  const t = useCloudConsoleText();
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const catalogQuery = useQuery({
    queryKey: ["token-usage", "pricing"],
    queryFn: () => cloudAdminApi.getCloudTokenPricingCatalog(),
  });

  const upsertMutation = useMutation({
    mutationFn: cloudAdminApi.upsertCloudTokenPricing,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["token-usage", "pricing"],
      });
      showNotice(t("Pricing saved."));
    },
    onError: (error: unknown) => showCloudAdminErrorNotice(showNotice, error),
  });

  const deleteMutation = useMutation({
    mutationFn: ({
      currency,
      model,
    }: {
      currency: "CNY" | "USD";
      model: string;
    }) => cloudAdminApi.deleteCloudTokenPricing(currency, model),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["token-usage", "pricing"],
      });
      showNotice(t("Pricing removed."));
    },
    onError: (error: unknown) => showCloudAdminErrorNotice(showNotice, error),
  });

  const syncMutation = useMutation({
    mutationFn: cloudAdminApi.syncCloudTokenPricingFromN1n,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: ["token-usage", "pricing"],
      });
      void queryClient.invalidateQueries({ queryKey: ["token-usage"] });
      showNotice(
        t("Synced {count} models, recomputed {days} days of cost.")
          .replace("{count}", String(data.upserted))
          .replace("{days}", String(data.recomputedDays)),
      );
    },
    onError: (error: unknown) => showCloudAdminErrorNotice(showNotice, error),
  });

  const items = catalogQuery.data?.items;
  const groupedItems = useMemo(() => {
    const groups: Record<"CNY" | "USD", CloudTokenPricingItem[]> = {
      CNY: [],
      USD: [],
    };
    for (const item of items ?? []) {
      groups[item.currency]?.push(item);
    }
    return groups;
  }, [items]);

  if (catalogQuery.error) {
    return <CloudAdminErrorBlock error={catalogQuery.error} />;
  }

  const totalItems = (items ?? []).length;

  return (
    <div className="space-y-6">
      <section className={SECTION}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {t("Pricing catalog")}
          </div>
          <button
            type="button"
            className={BUTTON}
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending
              ? t("Syncing…")
              : t("Sync from n1n.ai")}
          </button>
        </div>
        {catalogQuery.isLoading ? (
          <div className="mt-3 rounded-2xl border border-[color:var(--border-subtle)] px-4 py-6 text-center text-sm text-[color:var(--text-muted)]">
            {t("Loading…")}
          </div>
        ) : totalItems === 0 ? (
          <div className="mt-3 rounded-2xl border border-[color:var(--border-subtle)] px-4 py-6 text-center text-sm text-[color:var(--text-muted)]">
            {t("No pricing entries yet.")}
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {(["CNY", "USD"] as const).map((cur) =>
              groupedItems[cur].length === 0 ? null : (
                <PricingCatalogGroup
                  key={cur}
                  currency={cur}
                  items={groupedItems[cur]}
                  onDelete={(model) =>
                    deleteMutation.mutate({ currency: cur, model })
                  }
                />
              ),
            )}
          </div>
        )}
      </section>

      <section className={SECTION}>
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">
          {t("Add or update pricing")}
        </div>
        <PricingEditor
          onSubmit={(payload) => upsertMutation.mutate(payload)}
          submitting={upsertMutation.isPending}
        />
      </section>
    </div>
  );
}

function PricingCatalogGroup({
  currency,
  items,
  onDelete,
}: {
  currency: "CNY" | "USD";
  items: CloudTokenPricingItem[];
  onDelete: (model: string) => void;
}) {
  const t = useCloudConsoleText();
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
        {currency}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[color:var(--border-subtle)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--surface-input)] text-left text-xs uppercase tracking-wide text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-2">{t("Model")}</th>
              <th className="px-4 py-2 text-right">
                {t("Input / 1k tokens")}
              </th>
              <th className="px-4 py-2 text-right">
                {t("Output / 1k tokens")}
              </th>
              <th className="px-4 py-2">{t("Note")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <PricingRow
                key={`${item.currency}-${item.model}`}
                item={item}
                onDelete={() => onDelete(item.model)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PricingRow({
  item,
  onDelete,
}: {
  item: CloudTokenPricingItem;
  onDelete: () => void;
}) {
  const t = useCloudConsoleText();
  return (
    <tr className="border-t border-[color:var(--border-subtle)]">
      <td className="px-4 py-2">
        <div className="font-mono text-xs text-[color:var(--text-primary)]">
          {item.model}
        </div>
        {!item.enabled && (
          <div className="mt-0.5 inline-block rounded-full bg-[color:var(--surface-input)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
            {t("Disabled")}
          </div>
        )}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {item.inputPer1kTokens.toFixed(4)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {item.outputPer1kTokens.toFixed(4)}
      </td>
      <td className="px-4 py-2 text-xs text-[color:var(--text-muted)]">
        {item.note ?? "-"}
      </td>
      <td className="px-4 py-2 text-right">
        <button type="button" className={SECONDARY_BUTTON} onClick={onDelete}>
          {t("Remove")}
        </button>
      </td>
    </tr>
  );
}

function PricingEditor(props: {
  onSubmit: (payload: {
    currency: "CNY" | "USD";
    model: string;
    inputPer1kTokens: number;
    outputPer1kTokens: number;
    enabled: boolean;
    note: string | null;
  }) => void;
  submitting: boolean;
}) {
  const t = useCloudConsoleText();
  const [currency, setCurrency] = useState<"CNY" | "USD">("USD");
  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState("");

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Currency")}
        </span>
        <select
          className={FIELD}
          value={currency}
          onChange={(event) =>
            setCurrency(event.target.value as "CNY" | "USD")
          }
        >
          <option value="CNY">CNY</option>
          <option value="USD">USD</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Model")}
        </span>
        <input
          className={FIELD}
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="claude-haiku-4-5" // i18n-ignore-line: model name placeholder
        />
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Input / 1k tokens")}
        </span>
        <input
          className={FIELD}
          type="number"
          step="0.0001"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Output / 1k tokens")}
        </span>
        <input
          className={FIELD}
          type="number"
          step="0.0001"
          value={output}
          onChange={(event) => setOutput(event.target.value)}
        />
      </label>
      <label className="flex items-end gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span className="text-sm">{t("Enabled")}</span>
      </label>
      <label className="block">
        <span className="text-xs text-[color:var(--text-muted)]">
          {t("Note")}
        </span>
        <input
          className={FIELD}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("Optional")}
        />
      </label>
      <div className="md:col-span-2">
        <button
          type="button"
          className={BUTTON}
          disabled={
            props.submitting ||
            !model.trim() ||
            !input.trim() ||
            !output.trim()
          }
          onClick={() =>
            props.onSubmit({
              currency,
              model: model.trim(),
              inputPer1kTokens: Number(input) || 0,
              outputPer1kTokens: Number(output) || 0,
              enabled,
              note: note.trim() || null,
            })
          }
        >
          {t("Save")}
        </button>
      </div>
    </div>
  );
}
