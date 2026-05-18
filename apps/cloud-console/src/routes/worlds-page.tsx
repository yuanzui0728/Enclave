import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type {
  CloudInstancePowerState,
  CloudWorldAdminBootstrap,
  CloudWorldAttentionItem,
  CloudWorldInstanceFleetItem,
} from "@yinjie/contracts";
import {
  compareByLocale,
  formatDateTime as formatLocaleDateTime,
  useAppLocale,
} from "@yinjie/i18n";
import {
  CloudAdminErrorBlock,
  showCloudAdminErrorNotice,
} from "../components/cloud-admin-error-block";
import { ConsoleConfirmDialog } from "../components/console-confirm-dialog";
import { useConsoleNotice } from "../components/console-notice";
import { Pager } from "../components/pager";
import { WorldLifecycleActionButtons } from "../components/world-lifecycle-action-buttons";
import { copyTextToClipboard } from "../lib/clipboard";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import { translateCloudConsoleTextForActiveLocale,
  useCloudConsoleText } from "../lib/cloud-console-i18n";
import {
  createRequestScopedNotice,
  showRequestScopedNotice,
} from "../lib/request-scoped-notice";
import {
  ATTENTION_FILTERS,
  buildWorldsPermalink,
  buildWorldsRouteSearch,
  HEALTH_FILTERS,
  POWER_STATE_FILTERS,
  UNASSIGNED_PROVIDER_FILTER,
  WORLD_STATUS_FILTERS,
  type AttentionFilter,
  type HealthFilter,
  type PowerStateFilter,
  type WorldsRouteSearch,
  type WorldStatusFilter,
} from "../lib/world-route-search";
import {
  WORLDS_PAGE_ACTIONS,
  createWorldActionConfirmationCopy,
  requiresWorldActionConfirmation,
  type ConfirmableWorldLifecycleAction,
  createWorldActionLabel,
  listAllowedWorldActions,
  performWorldLifecycleActionWithMeta,
  type WorldLifecycleAction,
} from "../lib/world-lifecycle-actions";

function formatDateTime(value?: string | null) {
  if (!value) {
    return translateCloudConsoleTextForActiveLocale("Not available");
  }

  return formatLocaleDateTime(new Date(value), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getHealthBucket(status?: string | null): HealthFilter {
  const normalized = status?.trim().toLowerCase();
  if (!normalized || normalized === "unknown") {
    return "unknown";
  }
  if (normalized === "healthy" || normalized === "ready") {
    return "healthy";
  }
  return "unhealthy";
}

function formatPowerStateLabel(value: CloudInstancePowerState) {
  switch (value) {
    case "provisioning":
      return translateCloudConsoleTextForActiveLocale("Provisioning");
    case "running":
      return translateCloudConsoleTextForActiveLocale("Running");
    case "stopped":
      return translateCloudConsoleTextForActiveLocale("Stopped");
    case "starting":
      return translateCloudConsoleTextForActiveLocale("Starting");
    case "stopping":
      return translateCloudConsoleTextForActiveLocale("Stopping");
    case "error":
      return translateCloudConsoleTextForActiveLocale("Error");
    case "absent":
    default:
      return translateCloudConsoleTextForActiveLocale("Absent");
  }
}

function getPowerStateTone(value: CloudInstancePowerState) {
  switch (value) {
    case "running":
      return "border-emerald-300/50 bg-emerald-50 text-emerald-700";
    case "starting":
    case "provisioning":
    case "stopping":
      return "border-sky-300/50 bg-sky-50 text-sky-700";
    case "error":
      return "border-rose-300/60 bg-rose-50 text-rose-700";
    case "stopped":
    case "absent":
    default:
      return "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]";
  }
}

function resolveProviderKey(item: CloudWorldInstanceFleetItem) {
  return item.instance?.providerKey?.trim() || item.world.providerKey?.trim() || "";
}

function resolveProviderLabel(
  item: CloudWorldInstanceFleetItem,
  labelByKey: Map<string, string>,
) {
  const providerKey = resolveProviderKey(item);
  if (!providerKey) {
    return translateCloudConsoleTextForActiveLocale("Unassigned");
  }
  return labelByKey.get(providerKey) ?? providerKey;
}

function resolvePowerState(item: CloudWorldInstanceFleetItem): CloudInstancePowerState {
  return item.instance?.powerState ?? "absent";
}

function matchesAttentionFilter(
  filter: AttentionFilter,
  attention: CloudWorldAttentionItem | null | undefined,
) {
  if (filter === "all") {
    return true;
  }
  if (filter === "healthy") {
    return !attention;
  }
  return attention?.severity === filter;
}

function includesNormalizedQuery(
  values: Array<string | null | undefined>,
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) =>
    typeof value === "string"
      ? value.toLowerCase().includes(normalizedQuery)
      : false,
  );
}

function matchesInstanceFleetQuery(
  item: CloudWorldInstanceFleetItem,
  query: string,
  providerLabelByKey: Map<string, string>,
) {
  return includesNormalizedQuery(
    [
      item.world.id,
      item.world.name,
      item.world.phone,
      item.world.email,
      item.world.ownerDisplayName,
      resolveProviderKey(item),
      resolveProviderLabel(item, providerLabelByKey),
      item.instance?.providerInstanceId,
      item.instance?.name,
      item.instance?.region,
      item.instance?.zone,
      item.instance?.privateIp,
      item.instance?.publicIp,
      item.instance?.powerState,
    ],
    query,
  );
}

type QuickActionConfirmState = {
  worldId: string;
  worldName: string;
  action: ConfirmableWorldLifecycleAction;
};

type WorldsSortField = "lastAccessedAt" | "lastUserMessageAt";
type WorldsSortDirection = "asc" | "desc";
type WorldsSortState = {
  field: WorldsSortField;
  direction: WorldsSortDirection;
} | null;

function compareNullableDateString(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: WorldsSortDirection,
): number {
  // 始终把 null/undefined 排在最后，避免"未登录过"的世界混进顶部抢眼位置
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  const leftMissing = Number.isNaN(leftTime);
  const rightMissing = Number.isNaN(rightTime);
  if (leftMissing && rightMissing) return 0;
  if (leftMissing) return 1;
  if (rightMissing) return -1;
  return direction === "asc" ? leftTime - rightTime : rightTime - leftTime;
}

export function WorldsPage() {
  const t = useCloudConsoleText();
  const { locale } = useAppLocale();
  const navigate = useNavigate({ from: "/worlds" });
  const filters = useSearch({ from: "/worlds" });
  const queryClient = useQueryClient();
  const { showNotice } = useConsoleNotice();
  const [confirmAction, setConfirmAction] =
    useState<QuickActionConfirmState | null>(null);
  const [page, setPage] = useState(1);
  const [sortState, setSortState] = useState<WorldsSortState>(null);
  const pageSize = 20;
  const statusFilter = filters.status;
  const providerFilter = filters.provider;
  const powerStateFilter = filters.powerState;
  const attentionFilter = filters.attention;
  const healthFilter = filters.health;
  const queryFilter = filters.query;

  function updateFilters(next: Partial<WorldsRouteSearch>) {
    // 任何 filter 变化都把页码拉回第 1 页，否则用户在第 5 页改筛选条件可能
    // 落到不相关的子集深处；useEffect 里的 clamp 只在 totalPages 缩到当前页之
    // 外时才会触发
    setPage(1);
    void navigate({
      replace: true,
      search: (previous) => buildWorldsRouteSearch({ ...previous, ...next }),
    });
  }

  async function copyWorldsPermalink() {
    const relativePermalink = buildWorldsPermalink(filters);
    const absolutePermalink =
      typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}${relativePermalink}`
        : relativePermalink;
    const copied = await copyTextToClipboard(absolutePermalink);

    showNotice(
      copied
        ? "Worlds permalink copied."
        : "Clipboard copy failed in this environment.",
      copied ? "success" : "danger",
    );
  }

  const instanceFleetQuery = useQuery({
    queryKey: ["cloud-console", "instances", statusFilter],
    queryFn: () =>
      cloudAdminApi.listInstances(
        statusFilter === "all" ? undefined : statusFilter,
      ),
  });
  const providersQuery = useQuery({
    queryKey: ["cloud-console", "providers"],
    queryFn: () => cloudAdminApi.listProviders(),
  });
  const driftSummaryQuery = useQuery({
    queryKey: ["cloud-console", "world-drift-summary"],
    queryFn: () => cloudAdminApi.getWorldDriftSummary(),
  });

  const attentionByWorldId = useMemo(
    () =>
      new Map(
        (driftSummaryQuery.data?.attentionItems ?? []).map(
          (item) => [item.worldId, item] as const,
        ),
      ),
    [driftSummaryQuery.data?.attentionItems],
  );
  const providerLabelByKey = useMemo(
    () =>
      new Map(
        (providersQuery.data ?? []).map((provider) => [
          provider.key,
          provider.label,
        ] as const),
      ),
    [providersQuery.data],
  );

  const providerOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const item of instanceFleetQuery.data ?? []) {
      const providerKey = resolveProviderKey(item);
      seen.add(providerKey || UNASSIGNED_PROVIDER_FILTER);
    }

    return [...seen]
      .sort((left, right) => {
        if (left === UNASSIGNED_PROVIDER_FILTER) {
          return 1;
        }
        if (right === UNASSIGNED_PROVIDER_FILTER) {
          return -1;
        }
        const leftLabel = providerLabelByKey.get(left) ?? left;
        const rightLabel = providerLabelByKey.get(right) ?? right;
        return compareByLocale(leftLabel, rightLabel);
      })
      .map((key) => ({
        key,
        label:
          key === UNASSIGNED_PROVIDER_FILTER
            ? t("Unassigned")
            : (providerLabelByKey.get(key) ?? key),
      }));
  }, [instanceFleetQuery.data, providerLabelByKey]);

  const filteredInstanceFleet = useMemo(() => {
    return (instanceFleetQuery.data ?? []).filter((item) => {
      const providerKey = resolveProviderKey(item);
      const powerState = resolvePowerState(item);
      const attention = attentionByWorldId.get(item.world.id);
      const healthBucket = getHealthBucket(item.world.healthStatus);

      if (providerFilter !== "all") {
        if (providerFilter === UNASSIGNED_PROVIDER_FILTER) {
          if (providerKey) {
            return false;
          }
        } else if (providerKey !== providerFilter) {
          return false;
        }
      }

      if (powerStateFilter !== "all" && powerState !== powerStateFilter) {
        return false;
      }

      if (!matchesAttentionFilter(attentionFilter, attention)) {
        return false;
      }

      if (healthFilter !== "all" && healthBucket !== healthFilter) {
        return false;
      }

      return matchesInstanceFleetQuery(item, queryFilter, providerLabelByKey);
    });
  }, [
    attentionByWorldId,
    attentionFilter,
    healthFilter,
    instanceFleetQuery.data,
    providerLabelByKey,
    powerStateFilter,
    providerFilter,
    queryFilter,
  ]);

  const fleetMetrics = useMemo(() => {
    const items = filteredInstanceFleet;
    return {
      total: items.length,
      running: items.filter((item) => resolvePowerState(item) === "running")
        .length,
      absent: items.filter((item) => resolvePowerState(item) === "absent")
        .length,
      attention: items.filter((item) => attentionByWorldId.has(item.world.id))
        .length,
    };
  }, [attentionByWorldId, filteredInstanceFleet]);

  const sortedInstanceFleet = useMemo(() => {
    if (!sortState) {
      return filteredInstanceFleet;
    }
    const next = [...filteredInstanceFleet];
    if (sortState.field === "lastAccessedAt") {
      next.sort((left, right) =>
        compareNullableDateString(
          left.world.lastAccessedAt,
          right.world.lastAccessedAt,
          sortState.direction,
        ),
      );
    } else if (sortState.field === "lastUserMessageAt") {
      next.sort((left, right) =>
        compareNullableDateString(
          left.world.lastUserMessageAt,
          right.world.lastUserMessageAt,
          sortState.direction,
        ),
      );
    }
    return next;
  }, [filteredInstanceFleet, sortState]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedInstanceFleet.length / pageSize),
  );
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedInstanceFleet = useMemo(
    () =>
      sortedInstanceFleet.slice(
        (safePage - 1) * pageSize,
        safePage * pageSize,
      ),
    [sortedInstanceFleet, safePage, pageSize],
  );

  function toggleSort(field: WorldsSortField) {
    setPage(1);
    setSortState((current) => {
      if (!current || current.field !== field) {
        return { field, direction: "desc" };
      }
      if (current.direction === "desc") {
        return { field, direction: "asc" };
      }
      return null;
    });
  }

  // 过滤条件变化导致总页数缩小到当前页之外时，把页码拉回最后一页，保持显示稳定
  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  // permalink 可能带过时的 provider key（provider 被改名/删除，或用户手写错
  // URL），下游 filter 直接相等比较会静默把全列表过滤为空。等 providerOptions
  // 加载完后若发现当前选中的 key 不在可选项里，悄悄回落到 "all"，URL 同步改写。
  useEffect(() => {
    if (providerFilter === "all") return;
    if (!instanceFleetQuery.data) return;
    const knownKeys = new Set(providerOptions.map((option) => option.key));
    if (!knownKeys.has(providerFilter)) {
      updateFilters({ provider: "all" });
    }
  }, [providerFilter, providerOptions, instanceFleetQuery.data]);

  const quickActionMutation = useMutation({
    mutationFn: (input: { worldId: string; action: WorldLifecycleAction }) =>
      performWorldLifecycleActionWithMeta(input.worldId, input.action),
    onSuccess: async (response, variables) => {
      setConfirmAction(null);
      showRequestScopedNotice(
        showNotice,
        createRequestScopedNotice(
          createWorldActionLabel(variables.action, response.data),
          "success",
          response.requestId,
        ),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "instances"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["cloud-console", "world-drift-summary"],
        }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "jobs"] }),
      ]);
    },
    onError: (error, variables) => {
      if (requiresWorldActionConfirmation(variables.action)) {
        setConfirmAction(null);
      }
      showCloudAdminErrorNotice(showNotice, error);
    },
  });

  const enterAdminMutation = useMutation({
    mutationFn: (worldId: string) =>
      cloudAdminApi.getWorldAdminBootstrap(worldId),
    onError: (error) => {
      showCloudAdminErrorNotice(showNotice, error);
    },
  });

  function buildAdminBootstrapUrl(bootstrap: CloudWorldAdminBootstrap): string {
    const payload = JSON.stringify({
      apiBaseUrl: bootstrap.apiBaseUrl,
      adminSecret: bootstrap.adminSecret,
      cloudWorldId: bootstrap.worldId,
      cloudEmail: bootstrap.email ?? undefined,
    });
    // btoa 只认 Latin-1；payload 含中文/emoji（email 带中文标签等）会抛
    // InvalidCharacterError。统一 UTF-8 bytes → base64url。
    const utf8Bytes = new TextEncoder().encode(payload);
    let binary = "";
    for (const byte of utf8Bytes) {
      binary += String.fromCharCode(byte);
    }
    const encoded = window
      .btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `${bootstrap.adminFrontendBaseUrl.replace(/\/+$/, "")}/#yinjie-bootstrap=${encoded}`;
  }

  function handleEnterAdminClick(worldId: string) {
    if (typeof window === "undefined") {
      return;
    }
    // 同步在 click handler 里占住 about:blank，避免 fetch 异步 resolve 后
    // user activation 窗口过期被 popup blocker 拦。OAuth 跳转走的也是这个套路。
    // noopener 会丢掉 window 引用，没法 redirect，所以这里不加；admin 是我们
    // 自家应用，opener 反向攻击面可控。
    const placeholder = window.open("about:blank", "_blank");
    enterAdminMutation.mutate(worldId, {
      onSuccess: (bootstrap) => {
        const url = buildAdminBootstrapUrl(bootstrap);
        if (placeholder && !placeholder.closed) {
          // replace 而不是赋 href，避免在新 tab 的历史里留下 about:blank 一栏，
          // 操作员点"后退"就会回到空白页。
          placeholder.location.replace(url);
          return;
        }
        // placeholder 被关或一开始就被拦，最后再试一次正常 open
        const retry = window.open(url, "_blank", "noopener,noreferrer");
        if (!retry) {
          showNotice(
            "Browser blocked the popup. Allow popups for this site and retry.",
            "danger",
          );
        }
      },
      onError: () => {
        placeholder?.close();
      },
    });
  }
  const activeConfirm = confirmAction
    ? createWorldActionConfirmationCopy(
        confirmAction.action,
        { name: confirmAction.worldName },
        locale,
      )
    : null;

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-[color:var(--text-primary)]">
              {t("Managed worlds")}
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              Each phone owns exactly one world. New users provision a fresh
              instance, while returning users wake their previous one.
            </div>
          </div>

          <button
            type="button"
            onClick={() => void copyWorldsPermalink()}
            className="rounded-full border border-[color:var(--border-faint)] px-4 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          >
            {t("Copy worlds permalink")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {WORLD_STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => updateFilters({ status })}
              className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                statusFilter === status
                  ? "border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] text-[color:var(--text-primary)]"
                  : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)]"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="text-sm text-[color:var(--text-secondary)]">
            <div className="mb-2">{t("Search worlds")}</div>
            <input
              aria-label={t("World search")}
              value={queryFilter}
              onChange={(event) =>
                updateFilters({ query: event.target.value })
              }
              placeholder={t(
                "world id, phone, email, name, or provider",
              )}
              className="w-full rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)]"
            />
          </label>

          <div className="grid min-w-[18rem] gap-2 sm:grid-cols-2">
            <select
              value={providerFilter}
              onChange={(event) =>
                updateFilters({ provider: event.target.value })
              }
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              <option value="all">provider: all</option>
              {providerOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  provider: {item.label}
                </option>
              ))}
            </select>

            <select
              value={powerStateFilter}
              onChange={(event) =>
                updateFilters({
                  powerState: event.target.value as PowerStateFilter,
                })
              }
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {POWER_STATE_FILTERS.map((item) => (
                <option key={item} value={item}>
                  power: {item}
                </option>
              ))}
            </select>

            <select
              value={attentionFilter}
              onChange={(event) =>
                updateFilters({
                  attention: event.target.value as AttentionFilter,
                })
              }
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {ATTENTION_FILTERS.map((item) => (
                <option key={item} value={item}>
                  attention: {item}
                </option>
              ))}
            </select>

            <select
              value={healthFilter}
              onChange={(event) =>
                updateFilters({
                  health: event.target.value as HealthFilter,
                })
              }
              className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-2 text-sm text-[color:var(--text-primary)]"
            >
              {HEALTH_FILTERS.map((item) => (
                <option key={item} value={item}>
                  health: {item}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              {t("Visible rows")}
            </div>
            <div className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
              {fleetMetrics.total}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              {t("Running now")}
            </div>
            <div className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
              {fleetMetrics.running}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              {t("No instance")}
            </div>
            <div className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
              {fleetMetrics.absent}
            </div>
          </div>
          <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              {t("Needs action")}
            </div>
            <div className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
              {fleetMetrics.attention}
            </div>
          </div>
        </div>

        {providersQuery.isError && providersQuery.error instanceof Error ? (
          <div className="mt-4">
            <CloudAdminErrorBlock error={providersQuery.error} />
          </div>
        ) : null}

        {driftSummaryQuery.isError &&
        driftSummaryQuery.error instanceof Error ? (
          <div className="mt-4">
            <CloudAdminErrorBlock error={driftSummaryQuery.error} />
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-2xl border border-[color:var(--border-faint)]">
          <table className="min-w-[64rem] border-collapse text-left text-sm">
            <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-3">{t("World")}</th>
                <th className="px-4 py-3">{t("Power")}</th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("lastAccessedAt")}
                    className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-[color:var(--text-primary)]"
                    aria-label={t("Sort by last login")}
                  >
                    <span>{t("Last login")}</span>
                    <span aria-hidden="true" className="text-[10px]">
                      {sortState?.field === "lastAccessedAt"
                        ? sortState.direction === "desc"
                          ? "▼"
                          : "▲"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleSort("lastUserMessageAt")}
                    className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-[color:var(--text-primary)]"
                    aria-label={t("Sort by last user message")}
                  >
                    <span>{t("Last user message")}</span>
                    <span aria-hidden="true" className="text-[10px]">
                      {sortState?.field === "lastUserMessageAt"
                        ? sortState.direction === "desc"
                          ? "▼"
                          : "▲"
                        : "↕"}
                    </span>
                  </button>
                </th>
                <th className="px-4 py-3">{t("Membership registered")}</th>
                <th className="px-4 py-3">{t("Membership expires")}</th>
                <th className="px-4 py-3">{t("Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pagedInstanceFleet.map((item) => {
                const powerState = resolvePowerState(item);

                return (
                  <tr
                    key={item.world.id}
                    className="border-t border-[color:var(--border-faint)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to="/worlds/$worldId"
                        params={{ worldId: item.world.id }}
                        className="text-[color:var(--text-primary)] hover:underline"
                      >
                        {item.world.name}
                      </Link>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {item.world.email ?? item.world.phone}
                      </div>
                      {item.world.email ? (
                        <div className="text-xs text-[color:var(--text-muted)]">
                          {item.world.phone}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] uppercase tracking-[0.18em] ${getPowerStateTone(powerState)}`}
                      >
                        {formatPowerStateLabel(powerState)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(item.world.lastAccessedAt)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(item.world.lastUserMessageAt)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(item.world.userCreatedAt)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                      {formatDateTime(item.world.subscriptionExpiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <WorldLifecycleActionButtons
                          actions={listAllowedWorldActions(
                            item.world.status,
                            WORLDS_PAGE_ACTIONS,
                          )}
                          world={item.world}
                          pendingAction={
                            quickActionMutation.isPending &&
                            quickActionMutation.variables?.worldId === item.world.id
                              ? quickActionMutation.variables.action
                              : null
                          }
                          disabled={quickActionMutation.isPending}
                          onAction={(action) => {
                            if (requiresWorldActionConfirmation(action)) {
                              setConfirmAction({
                                worldId: item.world.id,
                                worldName: item.world.name,
                                action,
                              });
                              return;
                            }

                            quickActionMutation.mutate({
                              worldId: item.world.id,
                              action,
                            });
                          }}
                        />
                        <button
                          type="button"
                          disabled={
                            !item.world.apiBaseUrl ||
                            (enterAdminMutation.isPending &&
                              enterAdminMutation.variables === item.world.id)
                          }
                          title={
                            !item.world.apiBaseUrl
                              ? t(
                                  "World is sleeping. Wake it up before entering admin.",
                                )
                              : undefined
                          }
                          onClick={() => handleEnterAdminClick(item.world.id)}
                          className="self-start rounded-lg border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] disabled:opacity-60"
                        >
                          {enterAdminMutation.isPending &&
                          enterAdminMutation.variables === item.world.id
                            ? t("Opening admin…")
                            : t("Enter admin")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {instanceFleetQuery.isError &&
          instanceFleetQuery.error instanceof Error ? (
            <div className="p-4">
              <CloudAdminErrorBlock error={instanceFleetQuery.error} />
            </div>
          ) : null}

          {instanceFleetQuery.isLoading ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">
              {t("Loading instances...")}
            </div>
          ) : null}

          {!instanceFleetQuery.isLoading &&
          !instanceFleetQuery.isError &&
          !filteredInstanceFleet.length ? (
            <div className="p-4 text-sm text-[color:var(--text-muted)]">
              {t("No instance rows match the current filter set.")}
            </div>
          ) : null}

          {filteredInstanceFleet.length > pageSize ? (
            <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              <div>
                {filteredInstanceFleet.length} {t("entries")}
              </div>
              <Pager
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          ) : null}
        </div>
      </section>

      <ConsoleConfirmDialog
        open={Boolean(activeConfirm && confirmAction)}
        title={activeConfirm?.title ?? ""}
        description={activeConfirm?.description ?? ""}
        confirmLabel={activeConfirm?.confirmLabel}
        pendingLabel={activeConfirm?.pendingLabel}
        danger={activeConfirm?.danger}
        pending={
          Boolean(confirmAction) &&
          quickActionMutation.isPending &&
          quickActionMutation.variables?.worldId === confirmAction?.worldId &&
          quickActionMutation.variables?.action === confirmAction?.action
        }
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) {
            return;
          }

          quickActionMutation.mutate({
            worldId: confirmAction.worldId,
            action: confirmAction.action,
          });
        }}
      />
    </div>
  );
}
