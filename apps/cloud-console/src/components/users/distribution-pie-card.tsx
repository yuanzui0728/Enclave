import type { CloudUserDistributionBucket } from "@yinjie/contracts";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// 调色板复用 pv-uv-chart 同款 5 色 + 补 5 色，10 项轮换循环。
const PALETTE = [
  "#f97316",
  "#0ea5e9",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#eab308",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
  "#84cc16",
];

export function DistributionPieCard(props: {
  title: string;
  data: CloudUserDistributionBucket[] | undefined;
  emptyLabel: string;
  loadingLabel: string;
  isLoading?: boolean;
  formatLabel?: (raw: string) => string;
  height?: number;
}) {
  const data = (props.data ?? [])
    .filter((b) => b.count > 0)
    .map((b) => ({
      label: props.formatLabel ? props.formatLabel(b.label) : b.label,
      value: b.count,
    }));
  const total = data.reduce((acc, d) => acc + d.value, 0);
  // 首次加载时 props.data 是 undefined，与「真的没数据」要区分开——后者
  // 显示 emptyLabel，前者显示 loadingLabel 避免误导运营「分布图是空的」。
  const isLoading = props.isLoading && !props.data;

  return (
    <div className="rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-sm font-semibold text-(--text-primary)">
          {props.title}
        </div>
        {total > 0 ? (
          <div className="text-xs tabular-nums text-(--text-muted)">
            {total}
          </div>
        ) : null}
      </div>
      {isLoading ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-(--text-muted)">
          {props.loadingLabel}
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-sm text-(--text-muted)">
          {props.emptyLabel}
        </div>
      ) : (
        <div style={{ width: "100%", height: props.height ?? 240 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                cx="40%"
                cy="50%"
                outerRadius="80%"
                stroke="#fff"
                strokeWidth={1}
              >
                {data.map((_, idx) => (
                  <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => {
                  const pct =
                    total > 0
                      ? ` (${((value / total) * 100).toFixed(1)}%)`
                      : "";
                  return [`${value}${pct}`, name];
                }}
              />
              <Legend
                layout="vertical"
                verticalAlign="middle"
                align="right"
                iconSize={10}
                wrapperStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
