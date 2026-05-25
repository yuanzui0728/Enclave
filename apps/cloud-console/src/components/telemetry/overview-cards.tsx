import type { TelemetryOverviewResponse } from "@yinjie/contracts";
import { useCloudConsoleText } from "../../lib/cloud-console-i18n";

export function TelemetryOverviewCards({ data }: { data: TelemetryOverviewResponse }) {
  const t = useCloudConsoleText();
  const cards = [
    // 真人维度优先：先放"活跃真人 / 真人行为"，再放原有 PV/UV/会话指标。
    { label: t("Active real users"), value: data.activeUserCount },
    { label: t("Human actions"), value: data.humanActionCount },
    { label: t("Page views PV"), value: data.pvCount },
    { label: t("Unique visitors UV"), value: data.uvCount },
    { label: t("Sessions"), value: data.sessionCount },
    {
      label: t("Average session duration"),
      value: formatDuration(data.avgSessionDurationMs),
    },
  ];

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {cards.map((c) => (
        <li
          key={c.label}
          className="rounded-2xl border border-(--border-subtle) bg-(--surface-card) px-5 py-5 shadow-sm"
        >
          <div className="text-xs font-medium uppercase tracking-wider text-(--text-muted)">
            {c.label}
          </div>
          <div className="mt-2 text-3xl font-bold text-(--text-primary)">
            {c.value}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return `${minutes}m${rem ? ` ${rem}s` : ""}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
