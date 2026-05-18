import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TelemetryAppId, TelemetryRange } from "@yinjie/contracts";
import { ErrorBlock, LoadingBlock } from "@yinjie/ui";
import type { TopWorldsSortState } from "../components/telemetry/top-worlds-table";
import { TelemetryApiHealthTable } from "../components/telemetry/api-health-table";
import { TelemetryErrorsList } from "../components/telemetry/errors-list";
import {
  TelemetryFunnelChart,
  TelemetryFunnelEditor,
} from "../components/telemetry/funnel-chart";
import { MinimaxHourlyChart } from "../components/telemetry/minimax-hourly-chart";
import { TelemetryOverviewCards } from "../components/telemetry/overview-cards";
import { TelemetryLineChart } from "../components/telemetry/pv-uv-chart";
import { TelemetryRangePicker } from "../components/telemetry/range-picker";
import { TelemetryTopWorldsTable } from "../components/telemetry/top-worlds-table";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import { useCloudConsoleText } from "../lib/cloud-console-i18n";

type TabKey = "overview" | "funnel" | "api" | "errors" | "minimax";

export function TelemetryPage() {
  const t = useCloudConsoleText();
  const [tab, setTab] = useState<TabKey>("overview");
  const [range, setRange] = useState<TelemetryRange>("7d");
  const [appId, setAppId] = useState<TelemetryAppId | undefined>(undefined);
  const [worldId, setWorldId] = useState<string | undefined>(undefined);
  const [funnelSteps, setFunnelSteps] = useState(
    "page_view,login_success,pay_checkout_success",
  );

  // 拉一份当前 range 内有事件的世界列表，给 range-picker 的下拉填选项；
  // overview tab 顶部的 Top 世界排行也复用同一份数据来源（但走 top-worlds 接口）。
  const worldsForFilter = useQuery({
    queryKey: ["telemetry", "worlds-filter", range],
    queryFn: () => cloudAdminApi.listTelemetryWorlds(range),
  });

  const tabs = useMemo<Array<{ key: TabKey; label: string }>>(
    () => [
      { key: "overview", label: t("Overview") },
      { key: "funnel", label: t("Funnel") },
      { key: "api", label: t("API health") },
      { key: "errors", label: t("Errors") },
      { key: "minimax", label: t("MiniMax") },
    ],
    [t],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold text-(--text-primary)">{t("Telemetry")}</h1>
        <TelemetryRangePicker
          range={range}
          appId={appId}
          worldId={worldId}
          onRangeChange={setRange}
          onAppIdChange={setAppId}
          onWorldIdChange={setWorldId}
          worldOptions={worldsForFilter.data ?? []}
        />
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-(--border-faint)">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={
              tab === item.key
                ? "border-b-2 border-(--brand-primary) px-3 py-2 text-sm font-semibold text-(--brand-primary)"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-(--text-secondary) hover:text-(--text-primary)"
            }
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <OverviewTab range={range} appId={appId} worldId={worldId} />
      )}
      {tab === "funnel" && (
        <FunnelTab
          range={range}
          appId={appId}
          worldId={worldId}
          steps={funnelSteps}
          onStepsChange={setFunnelSteps}
        />
      )}
      {tab === "api" && (
        <ApiHealthTab range={range} appId={appId} worldId={worldId} />
      )}
      {tab === "errors" && (
        <ErrorsTab range={range} appId={appId} worldId={worldId} />
      )}
      {tab === "minimax" && <MinimaxTab range={range} worldId={worldId} />}
    </div>
  );
}

const TOP_WORLDS_PAGE_SIZE = 10;

function OverviewTab({
  range,
  appId,
  worldId,
}: {
  range: TelemetryRange;
  appId: TelemetryAppId | undefined;
  worldId: string | undefined;
}) {
  const t = useCloudConsoleText();
  const [worldsPage, setWorldsPage] = useState(1);
  const [worldsSort, setWorldsSort] = useState<TopWorldsSortState>({
    by: "eventCount",
    dir: "desc",
  });

  // range/worldId 切换时回到第 1 页，避免显示空页。
  // 排序切换不在此处理：放在 onSortChange handler 里和 setWorldsSort 一起 batch，
  // 否则会先用"新 sort + 旧 page"发一个被立即取消的请求，让表格多闪一下 loading。
  useEffect(() => {
    setWorldsPage(1);
  }, [range, worldId]);

  const overview = useQuery({
    queryKey: ["telemetry", "overview", range, appId ?? "all", worldId ?? "all"],
    queryFn: () => cloudAdminApi.getTelemetryOverview(range, appId, worldId),
  });
  const pvSeries = useQuery({
    queryKey: [
      "telemetry",
      "timeseries",
      "page_view",
      range,
      appId ?? "all",
      worldId ?? "all",
    ],
    queryFn: () =>
      cloudAdminApi.getTelemetryTimeseries({
        eventName: "page_view",
        range,
        groupBy: "appId",
        appId,
        worldId,
      }),
  });
  // Top 世界排行在 worldId 未选时才显示——选了具体世界就只剩它一行没意义。
  const topWorlds = useQuery({
    queryKey: [
      "telemetry",
      "top-worlds",
      range,
      worldsPage,
      TOP_WORLDS_PAGE_SIZE,
      worldsSort.by,
      worldsSort.dir,
    ],
    queryFn: () => {
      // 默认排序（eventCount desc）下不发 sort 参数——后端默认值与之一致，省去参数
      // 也让"重启前的旧 cloud-api"在 forbidNonWhitelisted 下不会 400。
      const isDefault =
        worldsSort.by === "eventCount" && worldsSort.dir === "desc";
      return cloudAdminApi.getTelemetryTopWorlds(range, {
        page: worldsPage,
        pageSize: TOP_WORLDS_PAGE_SIZE,
        sortBy: isDefault ? undefined : worldsSort.by,
        sortDir: isDefault ? undefined : worldsSort.dir,
      });
    },
    enabled: !worldId,
  });

  // 选了具体 app 时折线图只剩单条线，"(by app)" 后缀变成误导，去掉。
  const pvChartTitle = appId ? t("Page views") : t("Page views (by app)");

  return (
    <div className="space-y-4">
      {overview.isLoading ? (
        <LoadingBlock />
      ) : overview.error ? (
        <ErrorBlock title={t("Failed to load overview")} message={String(overview.error)} />
      ) : overview.data ? (
        <TelemetryOverviewCards data={overview.data} />
      ) : null}
      {pvSeries.isLoading ? (
        <LoadingBlock />
      ) : pvSeries.error ? (
        <ErrorBlock title={t("Failed to load line chart")} message={String(pvSeries.error)} />
      ) : pvSeries.data ? (
        <TelemetryLineChart
          title={pvChartTitle}
          points={pvSeries.data.points}
        />
      ) : null}
      {!worldId ? (
        topWorlds.isLoading ? (
          <LoadingBlock />
        ) : topWorlds.error ? (
          <ErrorBlock
            title={t("Failed to load world ranking")}
            message={String(topWorlds.error)}
          />
        ) : topWorlds.data ? (
          <TelemetryTopWorldsTable
            data={topWorlds.data}
            onPageChange={setWorldsPage}
            sort={worldsSort}
            onSortChange={(next) => {
              setWorldsSort(next);
              setWorldsPage(1);
            }}
          />
        ) : null
      ) : null}
    </div>
  );
}

function FunnelTab({
  range,
  appId,
  worldId,
  steps,
  onStepsChange,
}: {
  range: TelemetryRange;
  appId: TelemetryAppId | undefined;
  worldId: string | undefined;
  steps: string;
  onStepsChange: (s: string) => void;
}) {
  const t = useCloudConsoleText();
  const funnel = useQuery({
    queryKey: ["telemetry", "funnel", steps, range, appId ?? "all", worldId ?? "all"],
    queryFn: () =>
      cloudAdminApi.getTelemetryFunnel({ steps, range, appId, worldId }),
    enabled: steps.trim().length > 0,
  });
  return (
    <div className="space-y-4">
      <TelemetryFunnelEditor initialSteps={steps} onApply={onStepsChange} />
      {funnel.isLoading ? (
        <LoadingBlock />
      ) : funnel.error ? (
        <ErrorBlock title={t("Failed to load funnel")} message={String(funnel.error)} />
      ) : funnel.data ? (
        <TelemetryFunnelChart data={funnel.data} />
      ) : null}
    </div>
  );
}

function ApiHealthTab({
  range,
  appId,
  worldId,
}: {
  range: TelemetryRange;
  appId: TelemetryAppId | undefined;
  worldId: string | undefined;
}) {
  const t = useCloudConsoleText();
  const apiHealth = useQuery({
    queryKey: ["telemetry", "api-health", range, appId ?? "all", worldId ?? "all"],
    queryFn: () => cloudAdminApi.getTelemetryApiHealth(range, appId, worldId),
  });
  if (apiHealth.isLoading) return <LoadingBlock />;
  if (apiHealth.error)
    return <ErrorBlock title={t("Failed to load API health")} message={String(apiHealth.error)} />;
  if (!apiHealth.data) return null;
  return <TelemetryApiHealthTable data={apiHealth.data} />;
}

function ErrorsTab({
  range,
  appId,
  worldId,
}: {
  range: TelemetryRange;
  appId: TelemetryAppId | undefined;
  worldId: string | undefined;
}) {
  const t = useCloudConsoleText();
  const errors = useQuery({
    queryKey: ["telemetry", "errors", range, appId ?? "all", worldId ?? "all"],
    queryFn: () => cloudAdminApi.getTelemetryErrors(range, appId, worldId),
  });
  if (errors.isLoading) return <LoadingBlock />;
  if (errors.error)
    return <ErrorBlock title={t("Failed to load error list")} message={String(errors.error)} />;
  if (!errors.data) return null;
  return <TelemetryErrorsList data={errors.data} />;
}

function MinimaxTab({
  range,
  worldId,
}: {
  range: TelemetryRange;
  worldId: string | undefined;
}) {
  const t = useCloudConsoleText();
  const hourly = useQuery({
    queryKey: ["telemetry", "minimax-hourly", range, worldId ?? "all"],
    queryFn: () => cloudAdminApi.getTelemetryMinimaxHourly(range, worldId),
  });
  if (hourly.isLoading) return <LoadingBlock />;
  if (hourly.error)
    return (
      <ErrorBlock
        title={t("Failed to load MiniMax usage")}
        message={String(hourly.error)}
      />
    );
  if (!hourly.data) return null;
  return (
    <MinimaxHourlyChart
      title={t("MiniMax calls & rate-limit (hourly)")}
      callsLabel={t("Calls")}
      rpmLimitedLabel={t("RPM/Concurrency limited")}
      quotaLimitedLabel={t("Quota exhausted")}
      range={hourly.data.range}
      points={hourly.data.points}
    />
  );
}
