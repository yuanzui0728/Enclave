import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  PanelEmpty,
} from "@yinjie/ui";
import { wikiApi } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { useUsernameMap } from "../lib/use-username-map";

export function AdminStatsPage() {
  const t = translateRuntimeMessage;
  const dailyQ = useQuery({
    queryKey: ["wiki", "stats", "daily"],
    queryFn: () => wikiApi.wikiStatsDaily(),
  });
  const topQ = useQuery({
    queryKey: ["wiki", "stats", "top-reverted"],
    queryFn: () => wikiApi.wikiStatsTopReverted(20),
  });
  const filterQ = useQuery({
    queryKey: ["wiki", "stats", "filters"],
    queryFn: () => wikiApi.wikiStatsAbuseFilters(),
  });
  const { resolve: resolveUsername } = useUsernameMap(
    (topQ.data ?? []).map((u) => u.userId),
  );

  return (
    <PageShell
      eyebrow={t(msg`管理`)}
      title={t(msg`治理仪表盘`)}
      description={t(
        msg`日度新建/审核数据、被回滚最多的用户、过滤器近 7 天命中量。`,
      )}
    >
      {dailyQ.isLoading && <LoadingBlock />}
      {dailyQ.isError && (
        <ErrorBlock message={(dailyQ.error as Error).message} />
      )}
      {dailyQ.data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <MetricCard
            label={t(msg`今日新建词条`)}
            value={dailyQ.data.todayCreates}
          />
          <MetricCard
            label={t(msg`近 7 天新建词条`)}
            value={dailyQ.data.weekCreates}
          />
          <MetricCard
            label={t(msg`待审队列长度`)}
            value={dailyQ.data.pendingQueueLength}
          />
          <MetricCard
            label={t(msg`今日通过审核`)}
            value={dailyQ.data.todayApproved}
          />
          <MetricCard
            label={t(msg`今日驳回`)}
            value={dailyQ.data.todayRejected}
          />
          <MetricCard
            label={t(msg`今日反破坏命中`)}
            value={dailyQ.data.abuseHitsToday}
          />
          <MetricCard
            label={t(msg`本周新晋自动确认`)}
            value={dailyQ.data.autoconfirmedThisWeek}
          />
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          <Trans>被回滚最多的用户（top 20）</Trans>
        </h2>
        {topQ.isLoading && <LoadingBlock />}
        {topQ.data?.length === 0 && (
          <PanelEmpty message={t(msg`无记录`)} />
        )}
        <ul className="space-y-1.5">
          {topQ.data?.map((u) => (
            <li
              key={u.userId}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-sm shadow-[var(--shadow-soft)]"
            >
              <span className="text-xs">{resolveUsername(u.userId)}</span>
              <span className="text-xs text-[color:var(--text-muted)]">
                edits {u.editCount} · approved {u.approvedEditCount}
              </span>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                  u.revertedCount > 0
                    ? "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]"
                    : "bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]"
                }`}
              >
                reverted {u.revertedCount}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">
          <Trans>过滤器命中（近 7 天）</Trans>
        </h2>
        {filterQ.isLoading && <LoadingBlock />}
        {filterQ.data?.length === 0 && (
          <PanelEmpty message={t(msg`无记录`)} />
        )}
        <ul className="space-y-1.5">
          {filterQ.data?.map(({ filter, recentHits }) => (
            <li
              key={filter.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-sm shadow-[var(--shadow-soft)]"
            >
              <span className="font-medium">{filter.name}</span>
              <span className="text-xs text-[color:var(--text-muted)]">
                action: {filter.action}
              </span>
              <span className="ml-auto">
                <Trans>近 7 天 {recentHits} 命中</Trans>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
