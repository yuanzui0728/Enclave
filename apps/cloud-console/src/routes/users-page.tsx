import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type {
  CloudUserStatus,
  SubscriptionStatus,
} from "@yinjie/contracts";
import { formatDateTime, useAppLocale } from "@yinjie/i18n";
import { ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import {
  formatCloudConsolePageOfTotal,
  useCloudConsoleText,
} from "../lib/cloud-console-i18n";
import { useIpRegion } from "../lib/ip-region";
import { SurfaceCard } from "../components/ui";
import { DistributionPieCard } from "../components/users/distribution-pie-card";

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTime(date, { dateStyle: "medium", timeStyle: "short" });
}

// 搜索框防抖：输入框每个字符都直接进 queryKey 会让 listCloudUsers 每敲一下就打一次
// 后端（实测敲 6 个字符 = 6 次请求）。这里把"输入值"与"实际用于查询的值"解耦，
// 停止输入 350ms 后才更新查询值，把一串击键收敛成一次请求。
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

const FILTER_CONTROL_CLASS =
  "rounded-2xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm";

type SortField = "expires" | "registered" | "lastLogin" | "lastChatMessage";
type SortDirection = "asc" | "desc";

function IpRegionCell({ ip }: { ip: string | null }) {
  const region = useIpRegion(ip);
  if (!ip) return <span>-</span>;
  if (region.isLoading) {
    return (
      <span
        className="text-[color:var(--text-muted)]"
        title={ip}
      >
        …
      </span>
    );
  }
  if (region.isError || !region.data) {
    // 解析失败时退回展示原始 IP，避免空白
    return <span title={ip}>{ip}</span>;
  }
  return (
    <span
      className="cursor-help text-[color:var(--text-secondary)]"
      title={ip}
    >
      {region.data.display}
    </span>
  );
}

function SortableHeader({
  label,
  field,
  activeField,
  direction,
  onToggle,
}: {
  label: string;
  field: SortField;
  activeField: SortField | null;
  direction: SortDirection;
  onToggle: (field: SortField) => void;
}) {
  const isActive = activeField === field;
  // 三档 (asc/desc/inactive) 用同一 family 的字符 + 固定宽度容器，避免 ↕/▲/▼
  // 切换时撑动列宽
  const indicator = isActive ? (direction === "asc" ? "▲" : "▼") : "▼";
  return (
    <button
      type="button"
      onClick={() => onToggle(field)}
      className={`inline-flex items-center gap-1 font-medium ${
        isActive
          ? "text-[color:var(--text-primary)]"
          : "text-[color:var(--text-muted)]"
      } hover:text-[color:var(--text-primary)]`}
    >
      <span>{label}</span>
      <span
        className={`inline-block w-3 text-center text-[10px] leading-none ${
          isActive ? "opacity-100" : "opacity-30"
        }`}
      >
        {indicator}
      </span>
    </button>
  );
}

export function UsersPage() {
  const t = useCloudConsoleText();
  const { locale } = useAppLocale();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CloudUserStatus | "">("");
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatus | "">("");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [includeTestAccounts, setIncludeTestAccounts] = useState(false);

  // 后端搜索时也 trim，前端这里 normalize 一遍避免 " 138" / "138 " 走出两条 cache key。
  // 再套一层 350ms 防抖，避免连续击键逐字触发后端查询。
  const normalizedQuery = useDebouncedValue(query.trim(), 350);
  // 搜索词（防抖后）变化时回到第 1 页：否则在第 5 页改搜索会看到"新词的第 5 页"。
  // 放在 effect 里跟随 debounced 值，而不是放在 onChange 里跟随每次击键——
  // 后者会在防抖窗口内用旧搜索词 + page=1 多打一次无谓请求。
  useEffect(() => {
    setPage(1);
  }, [normalizedQuery]);
  const usersQuery = useQuery({
    queryKey: [
      "cloud-console",
      "saas-users",
      normalizedQuery,
      status,
      subscriptionStatus,
      page,
      includeTestAccounts,
      sortField,
      sortDirection,
    ],
    queryFn: () =>
      cloudAdminApi.listCloudUsers({
        query: normalizedQuery || undefined,
        status: status || undefined,
        subscriptionStatus: subscriptionStatus || undefined,
        page,
        pageSize: 20,
        includeTestAccounts: includeTestAccounts || undefined,
        // 全局排序：后端在 LIMIT 之前 ORDER BY，避免"只排当前页 20 条"。
        // sortField=null 时不传 → 后端走默认 registered/desc。
        orderBy: sortField ?? undefined,
        orderDir: sortField ? sortDirection : undefined,
      }),
    // 翻页 / 改筛选时保留上一页数据，避免表格整段卸载闪一下 LoadingBlock 再回来。
    placeholderData: keepPreviousData,
  });

  const items = usersQuery.data?.items ?? [];

  // 顶部统计卡片：口径固定为生产用户，跟当前列表筛选器解耦——ops 切搜索 /
  // 状态 / 订阅状态都不会影响这两个数字。staleTime 拉到 30s，避免每次切筛选
  // 都重 fetch。
  const statsQuery = useQuery({
    queryKey: ["cloud-console", "saas-users", "stats"],
    queryFn: () => cloudAdminApi.getCloudUserStats(),
    staleTime: 30_000,
  });

  // 地区 / 设备分布饼图：聚合口径剔除测试号，与 stats 卡保持一致。staleTime
  // 30s 与上面 stats 同步，避免每次切表格筛选都触发 ip-region/distribution 重算。
  const distributionQuery = useQuery({
    queryKey: ["cloud-console", "saas-users", "distribution"],
    queryFn: () => cloudAdminApi.getCloudUserDistribution(),
    staleTime: 30_000,
  });

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    // 切换排序字段 / 方向时回到第 1 页，否则用户在第 5 页点排序看到的是新排序
    // 下"第 5 页那 20 条"，而不是想象中的"按新字段重新排好的最前面 20 条"。
    setPage(1);
  }

  const statsItems: { label: string; value: string }[] = [
    {
      label: t("Real users"),
      value: statsQuery.data ? String(statsQuery.data.totalUsers) : "—",
    },
    {
      label: t("Member users"),
      value: statsQuery.data ? String(statsQuery.data.memberUsers) : "—",
    },
  ];

  // 设备维度饼图永远三档；后端返回的 raw label 是 'mobile' / 'desktop' /
  // 'unknown'，前端做本地化映射。
  const deviceLabelFormatter = (raw: string) => {
    if (raw === "mobile") return t("Mobile");
    if (raw === "desktop") return t("Desktop");
    return t("Unknown");
  };

  return (
    <SurfaceCard className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {statsItems.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-[color:var(--border-faint)] bg-white px-4 py-3"
          >
            <div className="text-xs text-[color:var(--text-muted)]">
              {stat.label}
            </div>
            <div className="mt-1 text-2xl font-semibold text-[color:var(--text-primary)] tabular-nums">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DistributionPieCard
          title={t("Region distribution")}
          data={distributionQuery.data?.byRegion}
          isLoading={distributionQuery.isLoading}
          emptyLabel={t("No data yet.")}
          loadingLabel={t("Loading…")}
        />
        <DistributionPieCard
          title={t("Device distribution")}
          data={distributionQuery.data?.byDevice}
          isLoading={distributionQuery.isLoading}
          emptyLabel={t("No data yet.")}
          loadingLabel={t("Loading…")}
          formatLabel={deviceLabelFormatter}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <input
          value={query}
          onChange={(event) => {
            // page 回到 1 交给跟随 debounced 值的 effect 处理。
            setQuery(event.target.value);
          }}
          placeholder={t("Search phone or email")}
          className={FILTER_CONTROL_CLASS}
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as CloudUserStatus | "");
            setPage(1);
          }}
          className={FILTER_CONTROL_CLASS}
        >
          <option value="">{t("All account states")}</option>
          <option value="active">{t("active")}</option>
          <option value="banned">{t("banned")}</option>
          <option value="archived">{t("archived")}</option>
        </select>
        <select
          value={subscriptionStatus}
          onChange={(event) => {
            setSubscriptionStatus(event.target.value as SubscriptionStatus | "");
            setPage(1);
          }}
          className={FILTER_CONTROL_CLASS}
        >
          <option value="">{t("All subscription states")}</option>
          <option value="active">{t("active")}</option>
          <option value="expired">{t("expired")}</option>
          <option value="none">{t("none")}</option>
        </select>
        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white px-3 py-2 text-sm text-[color:var(--text-secondary)]">
          {formatCloudConsolePageOfTotal(
            usersQuery.data?.page ?? page,
            usersQuery.data?.totalPages ?? 1,
            locale,
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
        <input
          type="checkbox"
          checked={includeTestAccounts}
          onChange={(event) => {
            setIncludeTestAccounts(event.target.checked);
            setPage(1);
          }}
        />
        <span>{t("Include test accounts (smoke / e2e / Twilio)")}</span>
      </label>

      {usersQuery.isLoading ? (
        <LoadingBlock label={t("Loading SaaS users...")} />
      ) : null}
      {usersQuery.isError ? (
        <ErrorBlock
          message={
            usersQuery.error instanceof Error
              ? usersQuery.error.message
              : t("Failed to load users.")
          }
        />
      ) : null}

      {usersQuery.data ? (
        <div
          className="overflow-x-auto rounded-[24px] border border-[color:var(--border-faint)] bg-white transition-opacity"
          // 保留上一页数据时用淡出提示"正在取新数据"，替代过去整段卸载的闪烁。
          style={{ opacity: usersQuery.isFetching ? 0.55 : 1 }}
          aria-busy={usersQuery.isFetching}
        >
          {/* table-fixed + 显式宽度：避免排序切换、IP 异步解析导致列宽抖动 */}
          <table className="w-full table-fixed divide-y divide-[color:var(--border-faint)] text-sm">
            <colgroup>
              <col className="w-[15%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="bg-[#f8faf8] text-left text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">{t("Email")}</th>
                <th className="px-4 py-3 font-medium">
                  <SortableHeader
                    label={t("Expires")}
                    field="expires"
                    activeField={sortField}
                    direction={sortDirection}
                    onToggle={toggleSort}
                  />
                </th>
                <th className="px-4 py-3 font-medium">
                  <SortableHeader
                    label={t("Registered")}
                    field="registered"
                    activeField={sortField}
                    direction={sortDirection}
                    onToggle={toggleSort}
                  />
                </th>
                <th className="px-4 py-3 font-medium">{t("Registration IP")}</th>
                <th className="px-4 py-3 font-medium">
                  <SortableHeader
                    label={t("Last login")}
                    field="lastLogin"
                    activeField={sortField}
                    direction={sortDirection}
                    onToggle={toggleSort}
                  />
                </th>
                <th className="px-4 py-3 font-medium">{t("Last login IP")}</th>
                <th className="px-4 py-3 font-medium">{t("Device")}</th>
                <th className="px-4 py-3 font-medium">
                  <SortableHeader
                    label={t("Last chat")}
                    field="lastChatMessage"
                    activeField={sortField}
                    direction={sortDirection}
                    onToggle={toggleSort}
                  />
                </th>
                <th className="px-4 py-3 font-medium">{t("Inviter")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-faint)]">
              {items.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="truncate px-4 py-3">
                    <Link
                      to="/users/$userId"
                      params={{ userId: user.id }}
                      className="font-medium text-[color:var(--brand-primary)]"
                      title={user.email ?? user.displayName ?? undefined}
                    >
                      {user.email || user.displayName || t("(no email)")}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {formatTimestamp(user.subscriptionExpiresAt)}
                  </td>
                  <td className="px-4 py-3">{formatTimestamp(user.createdAt)}</td>
                  <td className="truncate px-4 py-3">
                    <IpRegionCell ip={user.registrationIp} />
                  </td>
                  <td className="px-4 py-3">{formatTimestamp(user.lastLoginAt)}</td>
                  <td className="truncate px-4 py-3">
                    <IpRegionCell ip={user.lastLoginIp} />
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                    {user.lastLoginDeviceType === "mobile"
                      ? t("Mobile")
                      : user.lastLoginDeviceType === "desktop"
                        ? t("Desktop")
                        : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {formatTimestamp(user.lastChatMessageAt)}
                  </td>
                  <td className="truncate px-4 py-3">
                    {user.inviterPhone || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {usersQuery.data && !usersQuery.data.items.length ? (
        <InlineNotice tone="muted">
          {t("No cloud users matched the current filters.")}
        </InlineNotice>
      ) : null}

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-2xl border border-[color:var(--border-subtle)] bg-white px-4 py-2 text-sm"
          onClick={() => setPage((current) => Math.max(current - 1, 1))}
          disabled={page <= 1}
        >
          {t("Previous")}
        </button>
        <button
          type="button"
          className="rounded-2xl border border-[color:var(--border-subtle)] bg-white px-4 py-2 text-sm"
          onClick={() => setPage((current) => current + 1)}
          disabled={Boolean(usersQuery.data && page >= usersQuery.data.totalPages)}
        >
          {t("Next")}
        </button>
      </div>
    </SurfaceCard>
  );
}
