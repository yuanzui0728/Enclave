import { useNavigate } from "@tanstack/react-router";
import type {
  TelemetryTopWorldsResponse,
  TelemetryTopWorldsSortDir,
  TelemetryTopWorldsSortKey,
} from "@yinjie/contracts";
import { useCloudConsoleText } from "../../lib/cloud-console-i18n";
import { Pager } from "../pager";

export interface TopWorldsSortState {
  by: TelemetryTopWorldsSortKey;
  dir: TelemetryTopWorldsSortDir;
}

type Tr = (key: string) => string;

// 把 ISO 时间格式化成相对时间（刚刚 / N分钟前 / N小时前 / N天前）。
// null（从未有真人发言）显示 —。占位符 {n} 在运行时 .replace 注入，沿用本文件
// 既有的 "{start}-{end} of {total}" 模板风格，避免给 i18n 字典塞数字。
function formatRelative(iso: string | null, t: Tr): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t("just now");
  if (min < 60) return t("{n}m ago").replace("{n}", String(min));
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("{n}h ago").replace("{n}", String(hr));
  const d = Math.floor(hr / 24);
  return t("{n}d ago").replace("{n}", String(d));
}

// 7 天内算"仍活跃"，染绿；超过则视作沉寂，染灰。
function isRecent(iso: string | null): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < 7 * 24 * 60 * 60 * 1000;
}

export function TelemetryTopWorldsTable({
  data,
  onPageChange,
  sort,
  onSortChange,
}: {
  data: TelemetryTopWorldsResponse;
  onPageChange?: (nextPage: number) => void;
  sort: TopWorldsSortState;
  onSortChange: (next: TopWorldsSortState) => void;
}) {
  const t = useCloudConsoleText();
  const navigate = useNavigate();
  const { rows, total, page, pageSize } = data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  // 完全没数据 → 显示空状态卡片，无需 Pager。
  // rows=[] but total>0 → 用户停留在被压缩掉的页号上（例如 total 缩到不够本页时），
  // 不能 early-return，否则 Pager 也消失，用户回不去第 1 页。
  if (total === 0) {
    return (
      <div className="rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-8 text-center text-sm text-(--text-muted)">
        {t("No world activity in the current range.")}
      </div>
    );
  }

  const handleSort = (key: TelemetryTopWorldsSortKey) => {
    if (sort.by === key) {
      onSortChange({ by: key, dir: sort.dir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ by: key, dir: "desc" });
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-(--border-subtle) bg-(--surface-card)">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-(--border-faint) text-sm">
          <thead className="bg-(--surface-soft)">
            <tr>
              <Th>{t("World")}</Th>
              <Th
                align="right"
                sortKey="humanActionCount"
                activeKey={sort.by}
                activeDir={sort.dir}
                onSort={handleSort}
              >
                {t("Human actions")}
              </Th>
              <Th
                align="right"
                sortKey="uniqueUsers"
                activeKey={sort.by}
                activeDir={sort.dir}
                onSort={handleSort}
              >
                {t("Active users")}
              </Th>
              <Th align="right">{t("Visitors")}</Th>
              <Th
                align="right"
                sortKey="sessionCount"
                activeKey={sort.by}
                activeDir={sort.dir}
                onSort={handleSort}
              >
                {t("Sessions")}
              </Th>
              <Th
                align="right"
                sortKey="activeDays"
                activeKey={sort.by}
                activeDir={sort.dir}
                onSort={handleSort}
              >
                {t("Active days")}
              </Th>
              <Th align="right">{t("Last user activity")}</Th>
              <Th
                align="right"
                sortKey="errorCount"
                activeKey={sort.by}
                activeDir={sort.dir}
                onSort={handleSort}
              >
                {t("Errors")}
              </Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--border-faint)">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-xs text-(--text-muted)"
                >
                  {t("This page is empty. Use the pager to jump back.")}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const goToWorld = () =>
                navigate({
                  to: "/worlds/$worldId",
                  params: { worldId: row.worldId },
                });
              // 行为细分（发消息 / 发帖）放进 humanActions 单元格 title，悬停可见。
              const actionBreakdown = t("{chat} chats · {posts} posts")
                .replace("{chat}", String(row.chatMessageCount))
                .replace("{posts}", String(row.postCount));
              const recent = isRecent(row.lastUserMessageAt);
              return (
                <tr
                  key={row.worldId}
                  role="link"
                  tabIndex={0}
                  onClick={() => {
                    // 拖选文字 / 双击选词时不要顺手跳转，否则运营复制单元格里的数字会被甩走。
                    if (
                      typeof window !== "undefined" &&
                      (window.getSelection()?.toString().trim().length ?? 0) > 0
                    ) {
                      return;
                    }
                    goToWorld();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToWorld();
                    }
                  }}
                  className="cursor-pointer transition hover:bg-(--surface-soft) focus:bg-(--surface-soft) focus:outline-none"
                >
                  <Td className="font-medium text-(--text-primary)">
                    {row.ownerEmail ??
                      row.ownerPhone ??
                      row.worldName ??
                      row.worldId.slice(0, 8)}
                  </Td>
                  <Td
                    align="right"
                    className="font-semibold text-(--text-primary)"
                    title={actionBreakdown}
                  >
                    {row.humanActionCount.toLocaleString()}
                  </Td>
                  <Td align="right">{row.uniqueUsers.toLocaleString()}</Td>
                  <Td align="right" className="text-(--text-secondary)">
                    {row.uniqueAnons.toLocaleString()}
                  </Td>
                  <Td align="right">{row.sessionCount.toLocaleString()}</Td>
                  <Td align="right">{row.activeDays.toLocaleString()}</Td>
                  <Td
                    align="right"
                    className={
                      recent
                        ? "text-emerald-600"
                        : "text-(--text-muted)"
                    }
                    title={row.lastUserMessageAt ?? ""}
                  >
                    {formatRelative(row.lastUserMessageAt, t)}
                  </Td>
                  <Td
                    align="right"
                    className={
                      row.errorCount > 0
                        ? "bg-rose-50 font-semibold text-rose-600"
                        : "text-(--text-secondary)"
                    }
                  >
                    {row.errorCount.toLocaleString()}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--border-faint) px-4 py-2 text-xs text-(--text-secondary)">
        <div>
          {rows.length > 0
            ? t("{start}-{end} of {total}")
                .replace("{start}", String(rangeStart))
                .replace("{end}", String(rangeEnd))
                .replace("{total}", String(total))
            : /* rows=[] but total>0：算出来的 rangeStart 会越过 total（例如
                 "41-20 of 20"），此时只显示总条数，避免给运营看错乱数字。 */
              t("{total} total").replace("{total}", String(total))}
        </div>
        {onPageChange ? (
          <Pager
            page={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        ) : null}
      </div>
    </div>
  );
}

function Th({
  children,
  align,
  sortKey,
  activeKey,
  activeDir,
  onSort,
}: {
  children: React.ReactNode;
  align?: "right";
  sortKey?: TelemetryTopWorldsSortKey;
  activeKey?: TelemetryTopWorldsSortKey;
  activeDir?: TelemetryTopWorldsSortDir;
  onSort?: (key: TelemetryTopWorldsSortKey) => void;
}) {
  const alignClass = align === "right" ? "text-right" : "text-left";
  if (!sortKey || !onSort) {
    return (
      <th
        scope="col"
        className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider text-(--text-muted) ${alignClass}`}
      >
        {children}
      </th>
    );
  }
  const isActive = activeKey === sortKey;
  const arrow = isActive ? (activeDir === "asc" ? "↑" : "↓") : "";
  return (
    <th
      scope="col"
      aria-sort={
        isActive ? (activeDir === "asc" ? "ascending" : "descending") : "none"
      }
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${alignClass} ${isActive ? "text-(--text-primary)" : "text-(--text-muted)"}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"} cursor-pointer rounded px-1 py-0.5 hover:bg-(--surface-card)/60 hover:text-(--text-primary)`}
      >
        <span>{children}</span>
        <span className="w-3 text-right">{arrow}</span>
      </button>
    </th>
  );
}

function Td({
  children,
  align,
  className,
  title,
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
