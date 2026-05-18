import { useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  AppSection,
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  PanelEmpty,
  StatusPill,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import {
  wikiApi,
  type AbuseFilter,
  type AbuseFilterAction,
  type AbuseFilterScope,
} from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { FormRow } from "../components/form-row";
import { formatDateTime } from "../lib/format";
import { useUsernameMap } from "../lib/use-username-map";

export function AdminAbuseFiltersPage() {
  const t = translateRuntimeMessage;
  const qc = useQueryClient();
  const filtersQ = useQuery({
    queryKey: ["wiki", "abuse-filters"],
    queryFn: () => wikiApi.listAbuseFilters(),
  });
  const hitsQ = useQuery({
    queryKey: ["wiki", "abuse-filter-hits"],
    queryFn: () => wikiApi.listAbuseFilterHits({ limit: 50 }),
  });
  const { resolve: resolveUsername } = useUsernameMap(
    (hitsQ.data ?? []).map((h) => h.userId),
  );
  const toggleMut = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      wikiApi.updateAbuseFilter(input.id, { enabled: input.enabled }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["wiki", "abuse-filters"] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => wikiApi.deleteAbuseFilter(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["wiki", "abuse-filters"] }),
  });
  const createMut = useMutation({
    mutationFn: wikiApi.createAbuseFilter,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["wiki", "abuse-filters"] }),
  });

  return (
    <PageShell
      eyebrow={t(msg`管理`)}
      title={t(msg`反破坏过滤器`)}
      description={t(
        msg`每次 wiki 写入都会按规则匹配；命中后可触发记录、警告、强制人工审核或直接拦截。`,
      )}
    >
      <CreateFilterForm
        onCreate={(input) => createMut.mutate(input)}
        loading={createMut.isPending}
        error={
          createMut.isError ? (createMut.error as Error).message : null
        }
      />

      {filtersQ.isLoading && <LoadingBlock />}
      {filtersQ.isError && (
        <ErrorBlock message={(filtersQ.error as Error).message} />
      )}
      <ul className="space-y-2">
        {filtersQ.data?.map((f) => (
          <li key={f.id}>
            <FilterCard
              filter={f}
              onToggle={(enabled) =>
                toggleMut.mutate({ id: f.id, enabled })
              }
              onDelete={() => {
                if (window.confirm(t(msg`删除规则 ${f.name}？`))) {
                  deleteMut.mutate(f.id);
                }
              }}
            />
          </li>
        ))}
        {filtersQ.data?.length === 0 && (
          <PanelEmpty
            message={t(
              msg`暂无过滤规则。可使用上方"+ 新建过滤器"快速添加一条；模块启动也会自动种入预置规则。`,
            )}
          />
        )}
      </ul>

      <section className="space-y-3 pt-4">
        <h2 className="text-base font-semibold">
          <Trans>最近命中（50 条）</Trans>
        </h2>
        {hitsQ.isLoading && <LoadingBlock />}
        {hitsQ.data?.length === 0 && (
          <PanelEmpty message={t(msg`尚无命中记录。`)} />
        )}
        <ul className="space-y-1.5">
          {hitsQ.data?.map((h) => (
            <li
              key={h.id}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-sm shadow-[var(--shadow-soft)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ActionPill action={h.actionTaken} />
                <span className="text-xs">{resolveUsername(h.userId)}</span>
                <span className="text-xs text-[color:var(--text-muted)]">
                  {formatDateTime(h.createdAt)}
                </span>
                {h.characterId && (
                  <span className="text-xs">
                    on <span className="font-mono">{h.characterId}</span>
                  </span>
                )}
                <span className="ml-auto text-xs text-[color:var(--text-muted)]">
                  {h.operation}
                </span>
              </div>
              <div className="mt-1 break-all text-xs text-[color:var(--text-muted)]">
                {h.matchedText}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}

function FilterCard({
  filter,
  onToggle,
  onDelete,
}: {
  filter: AbuseFilter;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const t = translateRuntimeMessage;
  return (
    <div
      className={`space-y-2 rounded-2xl border bg-[color:var(--surface-card)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] ${
        filter.enabled
          ? "border-[color:var(--border-faint)]"
          : "border-[color:var(--border-faint)] opacity-70"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[color:var(--text-primary)]">
          {filter.name}
        </span>
        <ActionPill action={filter.action} />
        <SeverityPill severity={filter.severity} />
        <span className="text-xs text-[color:var(--text-muted)]">
          scope: {filter.scope}
        </span>
        {!filter.enabled && (
          <StatusPill>
            <Trans>已停用</Trans>
          </StatusPill>
        )}
        <span className="ml-auto text-xs text-[color:var(--text-muted)]">
          <Trans>命中 {filter.hitCount} 次</Trans>
          {filter.lastHitAt
            ? ` · ${t(msg`最近 ${formatDateTime(filter.lastHitAt)}`)}`
            : ""}
        </span>
      </div>
      {filter.description && (
        <p className="text-[color:var(--text-secondary)]">
          {filter.description}
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-[color:var(--text-muted)]">
          DSL pattern
        </summary>
        <pre className="mt-1 overflow-x-auto rounded bg-[rgba(0,0,0,0.04)] p-2">
          {JSON.stringify(filter.pattern, null, 2)}
        </pre>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={filter.enabled ? "secondary" : "primary"}
          className="flex-1 sm:flex-none"
          onClick={() => onToggle(!filter.enabled)}
        >
          {filter.enabled ? t(msg`停用`) : t(msg`启用`)}
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="flex-1 sm:flex-none"
          onClick={onDelete}
        >
          <Trans>删除</Trans>
        </Button>
      </div>
    </div>
  );
}

function ActionPill({ action }: { action: AbuseFilterAction }) {
  const t = translateRuntimeMessage;
  const label =
    action === "block"
      ? t(msg`拦截`)
      : action === "tag_high_risk"
        ? t(msg`标高风险`)
        : action === "warn"
          ? t(msg`警告`)
          : t(msg`记录`);
  const tone =
    action === "block"
      ? "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]"
      : action === "tag_high_risk"
        ? "bg-[color:var(--state-warning-bg)] text-[color:var(--state-warning-text)]"
        : action === "warn"
          ? "bg-[color:var(--state-info-bg)] text-[color:var(--state-info-text)]"
          : "bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function SeverityPill({
  severity,
}: {
  severity: "low" | "medium" | "high";
}) {
  const tone =
    severity === "high"
      ? "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]"
      : severity === "medium"
        ? "bg-[color:var(--state-warning-bg)] text-[color:var(--state-warning-text)]"
        : "bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>
      {severity}
    </span>
  );
}

const DEFAULT_PATTERN_JSON = JSON.stringify(
  // i18n-ignore-next-line: example regex shown to admins illustrating CJK match.
  { type: "regex", regex: "spam|垃圾", flags: "i" },
  null,
  2,
);

type CreateFilterInput = Parameters<typeof wikiApi.createAbuseFilter>[0];

function CreateFilterForm({
  onCreate,
  loading,
  error,
}: {
  onCreate: (input: CreateFilterInput) => void;
  loading: boolean;
  error: string | null;
}) {
  const t = translateRuntimeMessage;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<AbuseFilterScope>("all");
  const [action, setAction] = useState<AbuseFilterAction>("log");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">(
    "medium",
  );
  const [enabled, setEnabled] = useState(true);
  const [patternText, setPatternText] = useState(DEFAULT_PATTERN_JSON);

  const patternError = useMemo(() => {
    try {
      const parsed = JSON.parse(patternText);
      if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
        return t(msg`pattern 必须是含有 type 字段的 JSON 对象`);
      }
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [patternText, t]);

  function reset() {
    setName("");
    setDescription("");
    setScope("all");
    setAction("log");
    setSeverity("medium");
    setEnabled(true);
    setPatternText(DEFAULT_PATTERN_JSON);
  }

  function submit() {
    if (patternError) return;
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      description: description.trim() || undefined,
      enabled,
      scope,
      action,
      severity,
      pattern: JSON.parse(patternText) as CreateFilterInput["pattern"],
    });
    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <Card className="flex flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-[color:var(--text-muted)]">
          <Trans>新建过滤规则：name + pattern + 命中后动作。</Trans>
        </span>
        <Button
          size="sm"
          variant="primary"
          className="w-full sm:w-auto"
          onClick={() => setOpen(true)}
        >
          <Trans>+ 新建过滤器</Trans>
        </Button>
      </Card>
    );
  }

  return (
    <AppSection className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold">
          <Trans>新建过滤器</Trans>
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          <Trans>关闭</Trans>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormRow label={t(msg`规则名称`)} required>
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(msg`例如：明显广告关键字`)}
          />
        </FormRow>
        <FormRow label={t(msg`描述`)}>
          <TextField
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t(msg`简短说明命中条件与目的`)}
          />
        </FormRow>
        <FormRow label={t(msg`扫描范围 (scope)`)}>
          <select
            className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            value={scope}
            onChange={(e) => setScope(e.target.value as AbuseFilterScope)}
          >
            <option value="all">{t(msg`全部 (all)`)}</option>
            <option value="content">{t(msg`仅档案 (content)`)}</option>
            <option value="recipe">{t(msg`仅角色逻辑 (recipe)`)}</option>
          </select>
        </FormRow>
        <FormRow label={t(msg`命中后动作 (action)`)}>
          <select
            className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            value={action}
            onChange={(e) =>
              setAction(e.target.value as AbuseFilterAction)
            }
          >
            <option value="log">{t(msg`记录 (log)`)}</option>
            <option value="warn">{t(msg`警告 (warn)`)}</option>
            <option value="tag_high_risk">
              {t(msg`标高风险 (tag_high_risk)`)}
            </option>
            <option value="block">{t(msg`拦截 (block)`)}</option>
          </select>
        </FormRow>
        <FormRow label={t(msg`严重等级`)}>
          <select
            className="w-full rounded-xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none"
            value={severity}
            onChange={(e) =>
              setSeverity(e.target.value as "low" | "medium" | "high")
            }
          >
            <option value="low">{t(msg`低`)}</option>
            <option value="medium">{t(msg`中`)}</option>
            <option value="high">{t(msg`高`)}</option>
          </select>
        </FormRow>
        <FormRow label={t(msg`启用`)}>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <Trans>创建后立即生效</Trans>
          </label>
        </FormRow>
      </div>
      <FormRow
        label={t(msg`Pattern (JSON)`)}
        hint={t(
          msg`支持 regex / shrink / frequency / link_flood / keyword_list 等类型，必须含 type 字段`,
        )}
      >
        <TextAreaField
          rows={6}
          value={patternText}
          onChange={(e) => setPatternText(e.target.value)}
        />
        {patternError && (
          <div className="mt-1 text-xs text-[color:var(--state-danger-text)]">
            {patternError}
          </div>
        )}
      </FormRow>
      {error && <InlineNotice tone="danger">{error}</InlineNotice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          disabled={loading || !name.trim() || patternError !== null}
          onClick={submit}
        >
          {loading ? t(msg`提交中...`) : t(msg`提交并启用`)}
        </Button>
      </div>
    </AppSection>
  );
}
