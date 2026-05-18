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
      <table className="min-w-full divide-y divide-(--border-faint) text-sm">
        <thead className="bg-(--surface-soft)">
          <tr>
            <Th>{t("World")}</Th>
            <Th
              align="right"
              sortKey="eventCount"
              activeKey={sort.by}
              activeDir={sort.dir}
              onSort={handleSort}
            >
              {t("Events")}
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
                colSpan={4}
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
                <Td align="right" className="font-semibold text-(--text-primary)">
                  {row.eventCount.toLocaleString()}
                </Td>
                <Td align="right">{row.uniqueUsers.toLocaleString()}</Td>
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
}: {
  children: React.ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
