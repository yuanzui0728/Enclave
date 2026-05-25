import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import type {
  AdminBehaviorOverview,
  AdminBehaviorRecord,
  AdminBehaviorRecordListQuery,
  BehaviorSurface,
  BehaviorType,
} from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminPageHero,
  AdminPillSelectField,
  AdminSection,
  AdminSkeletonCard,
  AdminToggle,
  AdminToolbar,
  AdminValueCard,
} from "../components/admin-workbench";
import { behaviorRecordsAdminApi } from "../lib/behavior-records-api";
import { formatAdminDateTime as formatLocalizedDateTime } from "../lib/format";
import { translateRuntimeMessage } from "@yinjie/i18n";

const SURFACE_LABELS: Record<BehaviorSurface, ReturnType<typeof msg>> = {
  moments: msg`朋友圈`,
  feed: msg`广场`,
  channels: msg`视频号`,
};

const BEHAVIOR_LABELS: Record<BehaviorType, ReturnType<typeof msg>> = {
  comment: msg`评论`,
  like: msg`点赞`,
  share: msg`分享`,
  forward_to_chat: msg`转发`,
  favorite: msg`收藏`,
  view: msg`浏览`,
  follow: msg`关注`,
  not_interested: msg`不感兴趣`,
  comment_like: msg`评论点赞`,
};

const SURFACE_OPTIONS: Array<{
  value: BehaviorSurface | "all";
  label: ReturnType<typeof msg>;
}> = [
  { value: "all", label: msg`全部场景` },
  { value: "moments", label: SURFACE_LABELS.moments },
  { value: "feed", label: SURFACE_LABELS.feed },
  { value: "channels", label: SURFACE_LABELS.channels },
];

const BEHAVIOR_OPTIONS: Array<{
  value: BehaviorType | "all";
  label: ReturnType<typeof msg>;
}> = [
  { value: "all", label: msg`全部行为` },
  { value: "comment", label: BEHAVIOR_LABELS.comment },
  { value: "like", label: BEHAVIOR_LABELS.like },
  { value: "forward_to_chat", label: BEHAVIOR_LABELS.forward_to_chat },
  { value: "share", label: BEHAVIOR_LABELS.share },
  { value: "favorite", label: BEHAVIOR_LABELS.favorite },
  { value: "view", label: BEHAVIOR_LABELS.view },
  { value: "follow", label: BEHAVIOR_LABELS.follow },
  { value: "not_interested", label: BEHAVIOR_LABELS.not_interested },
  { value: "comment_like", label: BEHAVIOR_LABELS.comment_like },
];

const LIST_PAGE_SIZE_OPTIONS = [24, 50, 100];

function surfaceTone(surface: BehaviorSurface | string): string {
  switch (surface) {
    case "moments":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "feed":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "channels":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]";
  }
}

// 与后端 buildTrendPoints 的 formatLocalDayKey 同口径：按本地日分组，保证
// 时间线日期分隔头与行内本地时间、概览趋势图的"日"一致（不要用 ISO 串 UTC 截断）。
function formatLocalDayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function BehaviorRecordsPage() {
  const t = translateRuntimeMessage;
  const [surface, setSurface] = useState<BehaviorSurface | "all">("all");
  const [behaviorType, setBehaviorType] = useState<BehaviorType | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeHiddenComments, setIncludeHiddenComments] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [exporting, setExporting] = useState(false);

  const applyFilterChange = (mutate: () => void) => {
    mutate();
    setPage(1);
  };

  const listQuery = useMemo<AdminBehaviorRecordListQuery>(
    () => ({
      surface: surface === "all" ? undefined : surface,
      behaviorType: behaviorType === "all" ? undefined : behaviorType,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      includeHiddenComments: includeHiddenComments || undefined,
      page,
      pageSize,
    }),
    [surface, behaviorType, dateFrom, dateTo, includeHiddenComments, page, pageSize],
  );

  const overviewQuery = useQuery({
    queryKey: ["behavior-records", "overview"],
    queryFn: () => behaviorRecordsAdminApi.getOverview(),
  });

  const recordsQuery = useQuery({
    queryKey: ["behavior-records", "list", listQuery],
    queryFn: () => behaviorRecordsAdminApi.listRecords(listQuery),
    placeholderData: keepPreviousData,
  });

  const overview = overviewQuery.data;
  const overviewMetrics = useMemo(
    () => buildOverviewMetrics(overview, t),
    [overview, t],
  );

  const records = useMemo(
    () => recordsQuery.data?.items ?? [],
    [recordsQuery.data?.items],
  );
  const groups = useMemo(() => groupByDay(records), [records]);
  const listLoading = recordsQuery.isLoading && !recordsQuery.data;

  async function handleExport(format: "markdown" | "json") {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await behaviorRecordsAdminApi.exportRecords({
        format,
        surface: surface === "all" ? undefined : surface,
        behaviorType: behaviorType === "all" ? undefined : behaviorType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        includeHiddenComments: includeHiddenComments || undefined,
      });
      const blob = new Blob([result.content], { type: result.contentType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* 错误已在请求层抛出，导出失败不阻塞页面 */
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow={t(msg`角色与内容`)}
        title={t(msg`用户行为`)}
        description={t(
          msg`回看世界主人在朋友圈、广场、视频号的真实互动行为——评论、点赞、转发、收藏、浏览、关注，支持按场景与行为类型筛选、分析与导出。`,
        )}
        metrics={overviewMetrics}
      />

      {overviewQuery.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`概览加载失败`)}
          detail={overviewQuery.error.message}
          onRetry={() => overviewQuery.refetch()}
        />
      ) : overview ? (
        <BehaviorOverviewPanels overview={overview} t={t} />
      ) : null}

      <AdminToolbar
        filters={
          <>
            <AdminPillSelectField
              value={surface}
              onChange={(value) =>
                applyFilterChange(() =>
                  setSurface(value as BehaviorSurface | "all"),
                )
              }
            >
              {SURFACE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </AdminPillSelectField>
            <AdminPillSelectField
              value={behaviorType}
              onChange={(value) =>
                applyFilterChange(() =>
                  setBehaviorType(value as BehaviorType | "all"),
                )
              }
            >
              {BEHAVIOR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </AdminPillSelectField>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) =>
                applyFilterChange(() => setDateFrom(event.target.value))
              }
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-3 py-1.5 text-sm text-[color:var(--text-secondary)]"
            />
            <span className="text-xs text-[color:var(--text-muted)]">
              {t(msg`至`)}
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) =>
                applyFilterChange(() => setDateTo(event.target.value))
              }
              className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-3 py-1.5 text-sm text-[color:var(--text-secondary)]"
            />
            <AdminToggle
              label={t(msg`含隐藏评论`)}
              checked={includeHiddenComments}
              onChange={(checked) =>
                applyFilterChange(() => setIncludeHiddenComments(checked))
              }
            />
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={exporting}
              onClick={() => handleExport("markdown")}
            >
              {t(msg`导出 Markdown`)}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={exporting}
              onClick={() => handleExport("json")}
            >
              {t(msg`导出 JSON`)}
            </Button>
          </>
        }
      />

      <AdminSection
        title={t(msg`行为时间线`)}
        eyebrow={t(msg`明细`)}
        tone="card"
      >
        {listLoading ? (
          <AdminSkeletonCard rows={6} />
        ) : recordsQuery.error instanceof Error ? (
          <AdminErrorState
            title={t(msg`行为记录加载失败`)}
            detail={recordsQuery.error.message}
            onRetry={() => recordsQuery.refetch()}
          />
        ) : records.length ? (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.date} className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-[color:var(--text-muted)]">
                    {group.date}
                  </span>
                  <span className="h-px flex-1 bg-[color:var(--border-faint)]" />
                  <span className="text-xs text-[color:var(--text-muted)]">
                    {t(msg`${group.records.length} 条`)}
                  </span>
                </div>
                {group.records.map((record) => (
                  <BehaviorRecordRow key={record.id} record={record} t={t} />
                ))}
              </div>
            ))}

            {recordsQuery.data ? (
              <Pager
                page={recordsQuery.data.page}
                totalPages={recordsQuery.data.totalPages}
                total={recordsQuery.data.total}
                pageSize={pageSize}
                pageSizeOptions={LIST_PAGE_SIZE_OPTIONS}
                onPageSizeChange={(size) =>
                  applyFilterChange(() => setPageSize(size))
                }
                onChange={(next) => setPage(next)}
                disabled={recordsQuery.isFetching}
              />
            ) : null}
          </div>
        ) : (
          <AdminEmptyState
            title={t(msg`暂无行为记录`)}
            description={t(
              msg`当前筛选条件下没有命中世界主人的互动行为，换个场景或时间范围再看看。`,
            )}
          />
        )}
      </AdminSection>
    </div>
  );
}

function BehaviorOverviewPanels({
  overview,
  t,
}: {
  overview: AdminBehaviorOverview;
  t: typeof translateRuntimeMessage;
}) {
  const typeBuckets = overview.countsByType.filter((bucket) => bucket.count > 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AdminSection title={t(msg`按行为类型`)} eyebrow={t(msg`分布`)} tone="console">
        {typeBuckets.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {typeBuckets.map((bucket) => (
              <AdminValueCard
                key={bucket.key}
                label={t(BEHAVIOR_LABELS[bucket.key as BehaviorType])}
                value={
                  <span className="text-lg font-semibold text-[color:var(--text-primary)]">
                    {bucket.count}
                  </span>
                }
              />
            ))}
          </div>
        ) : (
          <div className="text-sm text-[color:var(--text-muted)]">
            {t(msg`暂无数据`)}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--text-secondary)]">
          {overview.countsBySurface.map((bucket) => (
            <span
              key={bucket.key}
              className={`rounded-full border px-2.5 py-1 ${surfaceTone(
                bucket.key as BehaviorSurface,
              )}`}
            >
              {t(SURFACE_LABELS[bucket.key as BehaviorSurface])} · {bucket.count}
            </span>
          ))}
        </div>
        <div className="mt-3 text-xs text-[color:var(--text-muted)]">
          {t(
            msg`近 7 天活跃 ${overview.activeDays7d} 天 · 近 30 天活跃 ${overview.activeDays30d} 天`,
          )}
          {overview.mostActiveWeekday
            ? ` · ${t(msg`最活跃 ${overview.mostActiveWeekday}`)}`
            : ""}
          {overview.mostActiveDay
            ? ` · ${t(msg`峰值日 ${overview.mostActiveDay}`)}`
            : ""}
        </div>
      </AdminSection>

      <AdminSection
        title={t(msg`高频互动对象`)}
        eyebrow={t(msg`Top`)}
        tone="console"
      >
        {overview.topAuthors.length ? (
          <div className="space-y-2">
            {overview.topAuthors.map((author) => (
              <div
                key={author.authorId ?? author.authorName}
                className="flex items-center justify-between gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-white/70 px-3 py-2"
              >
                <div className="min-w-0 truncate text-sm text-[color:var(--text-primary)]">
                  {author.authorName}
                  {author.authorType === "user" ? (
                    <span className="ml-1.5 text-xs text-[color:var(--text-muted)]">
                      {t(msg`(用户)`)}
                    </span>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm font-semibold text-[color:var(--text-secondary)]">
                  {author.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-[color:var(--text-muted)]">
            {t(msg`暂无数据`)}
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function BehaviorRecordRow({
  record,
  t,
}: {
  record: AdminBehaviorRecord;
  t: typeof translateRuntimeMessage;
}) {
  const payloadChips = describePayload(record, t);
  return (
    <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[12px] font-medium ${surfaceTone(
            record.surface,
          )}`}
        >
          {t(SURFACE_LABELS[record.surface])}
        </span>
        <span className="rounded-full border border-[color:var(--border-subtle)] bg-white px-2 py-0.5 text-[12px] font-medium text-[color:var(--text-secondary)]">
          {t(BEHAVIOR_LABELS[record.behaviorType])}
        </span>
        {record.targetAuthorName ? (
          <span className="text-xs text-[color:var(--text-muted)]">
            {record.behaviorType === "follow"
              ? t(msg`关注 ${record.targetAuthorName}`)
              : t(msg`对 ${record.targetAuthorName}`)}
          </span>
        ) : null}
        {record.postMissing ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[12px] text-amber-700">
            {t(msg`帖子已删除`)}
          </span>
        ) : null}
        <span className="ml-auto text-xs text-[color:var(--text-muted)]">
          {formatLocalizedDateTime(record.createdAt)}
        </span>
      </div>

      {record.text ? (
        <div className="mt-2 text-sm leading-6 text-[color:var(--text-primary)]">
          {record.text}
        </div>
      ) : null}

      {record.targetPostExcerpt ? (
        <div className="mt-1.5 line-clamp-2 rounded-[12px] border border-[color:var(--border-faint)] bg-white/60 px-3 py-2 text-xs leading-5 text-[color:var(--text-secondary)]">
          {record.targetPostExcerpt}
        </div>
      ) : null}

      {payloadChips.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {payloadChips.map((chip, index) => (
            <span
              key={index}
              className="rounded-full border border-[color:var(--border-faint)] bg-white/70 px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]"
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function describePayload(
  record: AdminBehaviorRecord,
  t: typeof translateRuntimeMessage,
): string[] {
  const payload = record.payload;
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const chips: string[] = [];
  if (record.behaviorType === "share" && typeof payload.channel === "string") {
    chips.push(t(msg`渠道 ${payload.channel}`));
  }
  if (record.behaviorType === "view") {
    if (typeof payload.progressSeconds === "number") {
      chips.push(t(msg`进度 ${Math.round(payload.progressSeconds)}s`));
    }
    if (payload.completed === true) {
      chips.push(t(msg`已看完`));
    }
  }
  if (record.behaviorType === "follow" && payload.muted === true) {
    chips.push(t(msg`已静音`));
  }
  if (
    record.behaviorType === "comment" &&
    typeof payload.replyToCommentId === "string"
  ) {
    chips.push(t(msg`回复`));
  }
  return chips;
}

type BehaviorDayGroup = {
  date: string;
  records: AdminBehaviorRecord[];
};

function groupByDay(records: AdminBehaviorRecord[]): BehaviorDayGroup[] {
  const groups: BehaviorDayGroup[] = [];
  let current: BehaviorDayGroup | null = null;
  for (const record of records) {
    const date = formatLocalDayKey(new Date(record.createdAt));
    if (!current || current.date !== date) {
      current = { date, records: [] };
      groups.push(current);
    }
    current.records.push(record);
  }
  return groups;
}

function buildOverviewMetrics(
  overview: AdminBehaviorOverview | undefined,
  t: typeof translateRuntimeMessage,
): Array<{ label: string; value: string }> {
  if (!overview) {
    return [];
  }
  return [
    { label: t(msg`总行为数`), value: String(overview.totalBehaviorCount) },
    { label: t(msg`近 7 天`), value: String(overview.behaviorCount7d) },
    { label: t(msg`近 30 天`), value: String(overview.behaviorCount30d) },
    {
      label: t(msg`世界主人`),
      value: overview.owner.username || overview.owner.id.slice(0, 8),
    },
  ];
}

function Pager({
  page,
  totalPages,
  total,
  onChange,
  disabled,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  disabled?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}) {
  const t = translateRuntimeMessage;
  const [jump, setJump] = useState("");
  const safeTotalPages = Math.max(1, totalPages);
  const clamp = (value: number) => Math.min(Math.max(1, value), safeTotalPages);

  function submitJump() {
    const parsed = Number(jump.trim());
    if (Number.isFinite(parsed) && parsed >= 1) {
      onChange(clamp(Math.floor(parsed)));
    }
    setJump("");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <span className="text-xs text-[color:var(--text-muted)]">
        {t(msg`共 ${total} 条 · 第 ${page} / ${safeTotalPages} 页`)}
      </span>
      <div className="flex items-center gap-2">
        {pageSizeOptions && onPageSizeChange ? (
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-2.5 py-1 text-xs text-[color:var(--text-secondary)]"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {t(msg`${option} / 页`)}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(clamp(page - 1))}
          disabled={disabled || page <= 1}
        >
          {t(msg`上一页`)}
        </Button>
        <input
          value={jump}
          onChange={(event) => setJump(event.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitJump();
            }
          }}
          onBlur={() => jump && submitJump()}
          placeholder={t(msg`跳页`)}
          inputMode="numeric"
          className="w-14 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-2.5 py-1 text-center text-xs text-[color:var(--text-primary)] placeholder:text-[color:var(--text-muted)]"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange(clamp(page + 1))}
          disabled={disabled || page >= safeTotalPages}
        >
          {t(msg`下一页`)}
        </Button>
      </div>
    </div>
  );
}
