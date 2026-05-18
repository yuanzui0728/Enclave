import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import {
  WIKI_SYNC_CONTENT_FIELDS,
  type WikiSyncApplyItemRequest,
  type WikiSyncApplyItemResult,
  type WikiSyncApplyResponse,
  type WikiSyncContentField,
  type WikiSyncPreviewFilter,
  type WikiSyncPreviewItem,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, Card, ErrorBlock, SnapshotDiff, StatusPill } from "@yinjie/ui";
import {
  AdminCallout,
  AdminEmptyState,
  AdminErrorState,
  AdminPillSelectField,
  AdminSectionHeader,
  AdminSkeletonCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { formatAdminDateTime } from "../lib/format";

type SelectionState = {
  contentFields: Set<WikiSyncContentField>;
  recipePaths: Set<string>;
};

type SelectionMap = Record<string, SelectionState>;

const FIELD_LABEL_MESSAGES: Record<WikiSyncContentField, ReturnType<typeof msg>> = {
  name: msg`名称`,
  avatar: msg`头像`,
  bio: msg`简介`,
  personality: msg`性格`,
  expertDomains: msg`专长领域`,
  triggerScenes: msg`触发场景`,
  relationship: msg`关系描述`,
  relationshipType: msg`关系类型`,
};

function getFieldLabels(): Record<WikiSyncContentField, string> {
  return Object.fromEntries(
    Object.entries(FIELD_LABEL_MESSAGES).map(([k, v]) => [k, translateRuntimeMessage(v)]),
  ) as Record<WikiSyncContentField, string>;
}

const STATUS_LABEL_MESSAGES: Record<WikiSyncPreviewItem["status"], ReturnType<typeof msg>> = {
  in_sync: msg`已同步`,
  drift: msg`有更新`,
  wiki_only: msg`仅 Wiki`,
  live_only: msg`仅本地`,
  no_stable_revision: msg`无稳定版本`,
};

const STATUS_TONE: Record<
  WikiSyncPreviewItem["status"],
  "healthy" | "warning" | "muted"
> = {
  in_sync: "healthy",
  drift: "warning",
  wiki_only: "warning",
  live_only: "muted",
  no_stable_revision: "muted",
};

const APPLY_RESULT_LABEL_MESSAGES: Record<WikiSyncApplyItemResult["status"], ReturnType<typeof msg>> = {
  applied: msg`已应用`,
  no_changes: msg`无变化`,
  stale_revision: msg`版本已更新，请刷新对比`,
  live_missing: msg`本地角色不存在`,
  no_stable_revision: msg`无可同步版本`,
  error: msg`应用失败`,
};

function emptySelection(): SelectionState {
  return { contentFields: new Set(), recipePaths: new Set() };
}

function fmtValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 0);
  } catch {
    return String(value);
  }
}

export function CharactersWikiSyncSection({
  initialCharacterId,
  onClearInitialCharacter,
}: {
  initialCharacterId?: string;
  onClearInitialCharacter?: () => void;
}) {
  const t = translateRuntimeMessage;
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<WikiSyncPreviewFilter>("drift");
  const [characterIdFilter, setCharacterIdFilter] = useState<string>(
    initialCharacterId ?? "",
  );
  const [selection, setSelection] = useState<SelectionMap>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResults, setLastResults] = useState<WikiSyncApplyResponse | null>(
    null,
  );

  // when route param changes, sync the focus
  useEffect(() => {
    if (initialCharacterId !== undefined) {
      setCharacterIdFilter(initialCharacterId);
      if (initialCharacterId) {
        setExpanded((prev) => ({ ...prev, [initialCharacterId]: true }));
      }
    }
  }, [initialCharacterId]);

  const previewQuery = useQuery({
    queryKey: [
      "admin-wiki-sync-preview",
      baseUrl,
      filter,
      characterIdFilter || null,
    ],
    queryFn: () =>
      adminApi.getWikiSyncPreview({
        filter,
        characterId: characterIdFilter || undefined,
      }),
  });

  const items = useMemo(
    () => previewQuery.data?.items ?? [],
    [previewQuery.data?.items],
  );

  const applyMutation = useMutation({
    mutationFn: (items: WikiSyncApplyItemRequest[]) =>
      adminApi.applyWikiSync({ items }),
    onSuccess: async (resp) => {
      setLastResults(resp);
      setConfirmOpen(false);
      // clear successful selections
      const successful = new Set(
        resp.results
          .filter((r) => r.status === "applied")
          .map((r) => r.characterId),
      );
      if (successful.size > 0) {
        setSelection((prev) => {
          const next = { ...prev };
          for (const id of successful) {
            next[id] = emptySelection();
          }
          return next;
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-wiki-sync-preview", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters", baseUrl],
        }),
      ]);
    },
  });

  const importMutation = useMutation({
    mutationFn: (input: { characterId: string; expectedStableRevisionId: string }) =>
      adminApi.importMissingFromWiki(input),
    onSuccess: async (result) => {
      setLastResults({ results: [result] });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-wiki-sync-preview", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud", baseUrl],
        }),
      ]);
    },
  });

  // 计数和应用都只看当前 items（按当前 filter / characterIdFilter 拉到的可见行）。
  // 选中态本身按 characterId 保留，切回原 filter 时之前勾的字段不会丢；
  // 但顶部"已选 X 个角色 / Y 项字段"与「应用所选」必须严格对齐可见集合，
  // 否则用户在 drift 视图勾完切到 wiki_only 还会看到旧数字，容易误以为是当前视图。
  const visibleSelections = useMemo(
    () =>
      items
        .map((it) => ({ item: it, sel: selection[it.characterId] }))
        .filter(
          (entry): entry is { item: WikiSyncPreviewItem; sel: SelectionState } =>
            !!entry.sel &&
            entry.sel.contentFields.size + entry.sel.recipePaths.size > 0,
        ),
    [items, selection],
  );

  const totalSelectedFields = useMemo(
    () =>
      visibleSelections.reduce(
        (sum, { sel }) => sum + sel.contentFields.size + sel.recipePaths.size,
        0,
      ),
    [visibleSelections],
  );

  const totalSelectedRows = visibleSelections.length;

  // "清空所选"按钮兜底：哪怕当前视图看不到，只要内存里还有任何勾选都允许一键清理，
  // 避免切回原 filter 才发现遗留勾选时无法直接清空。
  const hasAnySelection = useMemo(
    () =>
      Object.values(selection).some(
        (s) => s.contentFields.size + s.recipePaths.size > 0,
      ),
    [selection],
  );

  function toggleContentField(
    item: WikiSyncPreviewItem,
    field: WikiSyncContentField,
  ) {
    setSelection((prev) => {
      const cur = prev[item.characterId] ?? emptySelection();
      const next = {
        contentFields: new Set(cur.contentFields),
        recipePaths: new Set(cur.recipePaths),
      };
      if (next.contentFields.has(field)) next.contentFields.delete(field);
      else next.contentFields.add(field);
      return { ...prev, [item.characterId]: next };
    });
  }

  function toggleRecipePath(item: WikiSyncPreviewItem, path: string) {
    setSelection((prev) => {
      const cur = prev[item.characterId] ?? emptySelection();
      const next = {
        contentFields: new Set(cur.contentFields),
        recipePaths: new Set(cur.recipePaths),
      };
      if (next.recipePaths.has(path)) next.recipePaths.delete(path);
      else next.recipePaths.add(path);
      return { ...prev, [item.characterId]: next };
    });
  }

  function toggleAllForRow(item: WikiSyncPreviewItem, checkAll: boolean) {
    setSelection((prev) => {
      const next: SelectionState = checkAll
        ? {
            contentFields: new Set(item.contentDiff.map((d) => d.field)),
            recipePaths: new Set(item.recipeDiff.map((d) => d.path)),
          }
        : emptySelection();
      return { ...prev, [item.characterId]: next };
    });
  }

  function selectAllDrift() {
    const next: SelectionMap = {};
    for (const it of items) {
      if (it.status === "drift") {
        next[it.characterId] = {
          contentFields: new Set(it.contentDiff.map((d) => d.field)),
          recipePaths: new Set(it.recipeDiff.map((d) => d.path)),
        };
      }
    }
    setSelection(next);
  }

  function clearAllSelection() {
    setSelection({});
  }

  function buildApplyPayloadForRow(
    item: WikiSyncPreviewItem,
    sel: SelectionState,
  ): WikiSyncApplyItemRequest | null {
    if (!item.stableRevisionId) return null;
    if (sel.contentFields.size === 0 && sel.recipePaths.size === 0) return null;
    return {
      characterId: item.characterId,
      contentFields: Array.from(sel.contentFields),
      recipePaths: Array.from(sel.recipePaths),
      expectedStableRevisionId: item.stableRevisionId,
    };
  }

  function applyOne(item: WikiSyncPreviewItem) {
    const sel = selection[item.characterId];
    if (!sel) return;
    const payload = buildApplyPayloadForRow(item, sel);
    if (!payload) return;
    applyMutation.mutate([payload]);
  }

  function applyAllSelected() {
    const payload: WikiSyncApplyItemRequest[] = [];
    for (const it of items) {
      const sel = selection[it.characterId];
      if (!sel) continue;
      const built = buildApplyPayloadForRow(it, sel);
      if (built) payload.push(built);
    }
    if (payload.length === 0) return;
    applyMutation.mutate(payload);
  }

  function importMissing(item: WikiSyncPreviewItem) {
    if (!item.stableRevisionId) return;
    importMutation.mutate({
      characterId: item.characterId,
      expectedStableRevisionId: item.stableRevisionId,
    });
  }

  const showCharacterFilter = Boolean(characterIdFilter);

  return (
    <div className="space-y-6">
      <Card className="bg-[color:var(--surface-console)]">
        <AdminSectionHeader
          title={t(msg`Wiki ↔ 角色 同步`)}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <AdminPillSelectField
                value={filter}
                onChange={(v) => setFilter(v as WikiSyncPreviewFilter)}
              >
                <option value="drift">{t(msg`仅有更新`)}</option>
                <option value="wiki_only">{t(msg`仅本地缺失`)}</option>
                <option value="all">{t(msg`全部`)}</option>
              </AdminPillSelectField>
              <Button
                variant="secondary"
                onClick={() => previewQuery.refetch()}
                disabled={previewQuery.isFetching}
              >
                {previewQuery.isFetching ? t(msg`刷新中…`) : t(msg`刷新对比`)}
              </Button>
            </div>
          }
        />
        <div className="mt-3 text-sm text-[color:var(--text-secondary)]">
          {t(msg`展示 wiki 稳定版本与线上角色之间的差异。每条字段都需要勾选后才会被覆盖到线上。`)}
        </div>
        {showCharacterFilter ? (
          <div className="mt-3 flex items-center gap-2">
            <StatusPill tone="muted">{t(msg`仅查看 ${characterIdFilter}`)}</StatusPill>
            <Button
              variant="ghost"
              onClick={() => {
                setCharacterIdFilter("");
                onClearInitialCharacter?.();
              }}
            >
              {t(msg`清除筛选`)}
            </Button>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={selectAllDrift}
            disabled={items.filter((it) => it.status === "drift").length === 0}
          >
            {t(msg`一键勾选所有有更新角色`)}
          </Button>
          <Button
            variant="ghost"
            onClick={clearAllSelection}
            disabled={!hasAnySelection}
          >
            {t(msg`清空所选`)}
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-[color:var(--text-muted)]">
              {t(msg`已选 ${totalSelectedRows} 个角色 · ${totalSelectedFields} 项字段`)}
            </span>
            <Button
              variant="primary"
              onClick={() => setConfirmOpen(true)}
              disabled={totalSelectedFields === 0 || applyMutation.isPending}
            >
              {t(msg`应用所选`)}
            </Button>
          </div>
        </div>

        {confirmOpen ? (
          <AdminCallout
            tone="warning"
            title={t(msg`确认将所选差异写入线上`)}
            description={t(msg`即将更新 ${totalSelectedRows} 个角色，共 ${totalSelectedFields} 个字段。每个角色会写一条 wiki 审计修订（changeSource=admin_sync_from_wiki）。`)}
            actions={
              <>
                <Button
                  variant="primary"
                  onClick={applyAllSelected}
                  disabled={applyMutation.isPending}
                >
                  {applyMutation.isPending ? t(msg`应用中…`) : t(msg`确认应用`)}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmOpen(false)}
                  disabled={applyMutation.isPending}
                >
                  {t(msg`取消`)}
                </Button>
              </>
            }
            className="mt-4"
          />
        ) : null}

        {applyMutation.error instanceof Error ? (
          <div className="mt-4">
            <ErrorBlock message={applyMutation.error.message} />
          </div>
        ) : null}
        {importMutation.error instanceof Error ? (
          <div className="mt-4">
            <ErrorBlock message={importMutation.error.message} />
          </div>
        ) : null}

        {lastResults && lastResults.results.length > 0 ? (
          <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-white/85 px-4 py-3 text-xs">
            <div className="mb-2 font-medium text-[color:var(--text-primary)]">
              {t(msg`上次操作结果`)}
            </div>
            <ul className="space-y-1">
              {lastResults.results.map((r) => (
                <li key={r.characterId} className="flex flex-wrap gap-x-3">
                  <span className="font-mono text-[color:var(--text-muted)]">
                    {r.characterId}
                  </span>
                  <span
                    className={
                      r.status === "applied"
                        ? "text-emerald-700"
                        : r.status === "no_changes"
                          ? "text-[color:var(--text-muted)]"
                          : "text-amber-700"
                    }
                  >
                    {translateRuntimeMessage(APPLY_RESULT_LABEL_MESSAGES[r.status])}
                  </span>
                  {r.appliedFields.length || r.appliedRecipePaths.length ? (
                    <span className="text-[color:var(--text-secondary)]">
                      {t(msg`内容 ${r.appliedFields.length} / recipe ${r.appliedRecipePaths.length}`)}
                    </span>
                  ) : null}
                  {r.errorMessage ? (
                    <span className="text-rose-700">{r.errorMessage}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {previewQuery.isLoading ? (
        <AdminSkeletonCard rows={6} />
      ) : previewQuery.error ? (
        <AdminErrorState
          title={t(msg`加载差异失败`)}
          detail={(previewQuery.error as Error).message}
          onRetry={() => previewQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <AdminEmptyState
          title={t(msg`目前没有需要同步的差异`)}
          description={t(msg`所有角色都与 wiki 稳定版一致，或当前筛选下没有匹配的条目。`)}
        />
      ) : (
        <div className="space-y-3">
          {items.every(
            (it) => it.status !== "drift" && it.status !== "wiki_only",
          ) ? (
            <AdminCallout
              tone="info"
              title={t(msg`当前没有可同步的角色`)}
              description={t(msg`下方列表显示的角色要么已与 wiki 一致，要么尚无 wiki 稳定版本。展开任意一行查看具体说明。如需同步，先到 wiki 提交一次能自动通过审核的修订。`)}
            />
          ) : null}
          {items.map((item) => (
            <WikiSyncRow
              key={item.characterId}
              item={item}
              expanded={expanded[item.characterId] ?? false}
              onToggleExpand={() =>
                setExpanded((prev) => ({
                  ...prev,
                  [item.characterId]: !prev[item.characterId],
                }))
              }
              selection={selection[item.characterId] ?? emptySelection()}
              onToggleField={(field) => toggleContentField(item, field)}
              onTogglePath={(path) => toggleRecipePath(item, path)}
              onSelectAllForRow={(check) => toggleAllForRow(item, check)}
              onApply={() => applyOne(item)}
              onImport={() => importMissing(item)}
              applyPending={applyMutation.isPending}
              importPending={importMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WikiSyncRow({
  item,
  expanded,
  onToggleExpand,
  selection,
  onToggleField,
  onTogglePath,
  onSelectAllForRow,
  onApply,
  onImport,
  applyPending,
  importPending,
}: {
  item: WikiSyncPreviewItem;
  expanded: boolean;
  onToggleExpand: () => void;
  selection: SelectionState;
  onToggleField: (field: WikiSyncContentField) => void;
  onTogglePath: (path: string) => void;
  onSelectAllForRow: (checkAll: boolean) => void;
  onApply: () => void;
  onImport: () => void;
  applyPending: boolean;
  importPending: boolean;
}) {
  const t = translateRuntimeMessage;
  const totalDiffs = item.contentDiff.length + item.recipeDiff.length;
  const totalSelected = selection.contentFields.size + selection.recipePaths.size;
  const allSelected = totalDiffs > 0 && totalSelected === totalDiffs;

  return (
    <Card className="bg-[color:var(--surface-card)]">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
          aria-label={expanded ? t(msg`收起`) : t(msg`展开`)}
        >
          <span
            className={
              expanded
                ? "rotate-180 transition-transform"
                : "transition-transform"
            }
          >
            ▾
          </span>
        </button>
        {item.avatar ? (
          <img
            src={item.avatar}
            alt=""
            className="h-9 w-9 rounded-full object-cover bg-[color:var(--surface-soft)]"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-[color:var(--surface-soft)]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold text-[color:var(--text-primary)]">
              {item.name}
            </div>
            <StatusPill tone={STATUS_TONE[item.status]}>
              {translateRuntimeMessage(STATUS_LABEL_MESSAGES[item.status])}
            </StatusPill>
            {item.status === "drift" ? (
              <span className="text-xs text-[color:var(--text-muted)]">
                {t(msg`内容差 ${item.contentDiff.length} / recipe 差 ${item.recipeDiff.length}`)}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            <span className="font-mono">{item.characterId}</span>
            {item.stableRevisionVersion ? (
              <>
                {" · wiki v"}
                {item.stableRevisionVersion}
              </>
            ) : null}
            {item.stableRevisionEditedAt ? (
              <>
                {" · "}
                {formatAdminDateTime(item.stableRevisionEditedAt)}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.status === "wiki_only" ? (
            <Button
              variant="primary"
              onClick={onImport}
              disabled={importPending || !item.stableRevisionId}
            >
              {importPending ? t(msg`导入中…`) : t(msg`导入到本地`)}
            </Button>
          ) : item.status === "drift" ? (
            <Button
              variant="primary"
              onClick={onApply}
              disabled={applyPending || totalSelected === 0}
            >
              {t(msg`应用此项 (${totalSelected})`)}
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-[color:var(--border-faint)] pt-4">
          {totalDiffs > 0 ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onSelectAllForRow(!allSelected)}
                  className="rounded-full border border-[color:var(--border-subtle)] px-3 py-1 hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]"
                >
                  {allSelected ? t(msg`本行全不选`) : t(msg`本行全选`)}
                </button>
                <span className="text-[color:var(--text-muted)]">
                  {t(msg`共 ${totalDiffs} 项差异，已勾选 ${totalSelected} 项`)}
                </span>
              </div>

              {item.contentDiff.length > 0 ? (
                <ContentDiffPanel
                  entries={item.contentDiff}
                  selectedFields={selection.contentFields}
                  onToggle={onToggleField}
                />
              ) : null}
              {item.recipeDiff.length > 0 ? (
                <RecipeDiffPanel
                  entries={item.recipeDiff}
                  selectedPaths={selection.recipePaths}
                  onToggle={onTogglePath}
                />
              ) : null}
            </>
          ) : (
            <RowEmptyHint status={item.status} />
          )}
        </div>
      ) : null}
    </Card>
  );
}

function RowEmptyHint({ status }: { status: WikiSyncPreviewItem["status"] }) {
  const t = translateRuntimeMessage;
  const tip = (() => {
    switch (status) {
      case "in_sync":
        return t(msg`线上角色与 wiki 稳定版本一致，无需同步。`);
      case "no_stable_revision":
        return t(msg`wiki 词条已存在，但还没有审核通过的稳定版本。需要先到 wiki 提交一次能够自动通过审核的修订（patroller+ 用户提交即可），稳定版本生成后这里才会出现差异。`);
      case "live_only":
        return t(msg`线上有这个角色，但 wiki 还没有对应的词条。可以到 wiki 创建一个词条；提交后再回来同步。`);
      case "wiki_only":
        return t(msg`wiki 有词条但本地没有对应角色。点击右上角「导入到本地」即可基于 wiki 稳定版本新建角色。`);
      case "drift":
        return "";
    }
  })();
  if (!tip) return null;
  return (
    <div className="rounded-[14px] bg-[color:var(--surface-soft)] px-3 py-2 text-xs leading-5 text-[color:var(--text-secondary)]">
      {tip}
    </div>
  );
}

function ContentDiffPanel({
  entries,
  selectedFields,
  onToggle,
}: {
  entries: WikiSyncPreviewItem["contentDiff"];
  selectedFields: Set<WikiSyncContentField>;
  onToggle: (field: WikiSyncContentField) => void;
}) {
  const t = translateRuntimeMessage;
  const FIELD_LABELS = useMemo(() => getFieldLabels(), []);
  const before = useMemo(() => {
    const obj: Record<string, unknown> = {};
    for (const e of entries) obj[e.field] = e.liveValue;
    return obj;
  }, [entries]);
  const after = useMemo(() => {
    const obj: Record<string, unknown> = {};
    for (const e of entries) obj[e.field] = e.wikiValue;
    return obj;
  }, [entries]);
  const changed = entries.map((e) => e.field as string);
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {t(msg`内容字段 (${entries.length})`)}
      </div>
      <SnapshotDiff
        before={before}
        after={after}
        changedFields={changed}
        fieldLabels={FIELD_LABELS}
        oldLabel={t(msg`旧`)}
        newLabel={t(msg`新`)}
        emptyLabel={t(msg`未检测到字段变化。`)}
        renderRowLead={(field) => (
          <input
            type="checkbox"
            checked={selectedFields.has(field as WikiSyncContentField)}
            onChange={() => onToggle(field as WikiSyncContentField)}
            aria-label={t(msg`选择字段 ${FIELD_LABELS[field as WikiSyncContentField] ?? field}`)}
          />
        )}
      />
    </div>
  );
}

function RecipeDiffPanel({
  entries,
  selectedPaths,
  onToggle,
}: {
  entries: WikiSyncPreviewItem["recipeDiff"];
  selectedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        {t(msg`Recipe 路径 (${entries.length})`)}
      </div>
      <div className="space-y-2">
        {entries.map((e) => (
          <div
            key={e.path}
            className="grid grid-cols-[1.5rem_10rem_1fr_1fr] gap-2 text-xs"
          >
            <div className="flex items-start pt-1">
              <input
                type="checkbox"
                checked={selectedPaths.has(e.path)}
                onChange={() => onToggle(e.path)}
                aria-label={t(msg`选择 recipe 路径 ${e.path}`)}
              />
            </div>
            <div className="font-mono text-[color:var(--text-muted)] pt-1 break-all">
              {e.path}
            </div>
            <div
              className="rounded border border-[var(--border-subtle)] bg-[rgba(254,226,226,0.35)] px-2 py-1 whitespace-pre-wrap break-words"
              title={fmtValue(e.liveValue)}
            >
              <span className="text-[10px] uppercase text-[var(--text-muted)] mr-1">
                {t(msg`旧`)}
              </span>
              {fmtValue(e.liveValue).slice(0, 200)}
            </div>
            <div
              className="rounded border border-[var(--border-subtle)] bg-[rgba(220,252,231,0.45)] px-2 py-1 whitespace-pre-wrap break-words"
              title={fmtValue(e.wikiValue)}
            >
              <span className="text-[10px] uppercase text-[var(--text-muted)] mr-1">
                {t(msg`新`)}
              </span>
              {fmtValue(e.wikiValue).slice(0, 200)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// re-export types for the parent route
export type { WikiSyncPreviewFilter };
// re-export the constant tuple for downstream consumers if needed
export { WIKI_SYNC_CONTENT_FIELDS };
