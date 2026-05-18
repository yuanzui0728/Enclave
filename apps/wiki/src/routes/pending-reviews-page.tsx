import { useState } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  PanelEmpty,
  StatusPill,
  TextField,
} from "@yinjie/ui";
import { hasRole } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import { wikiApi, type PendingReviewItem } from "../lib/wiki-api";
import { useUsernameMap } from "../lib/use-username-map";
import { SnapshotDiff } from "../components/snapshot-diff";
import { PageShell } from "../components/page-shell";
import { FormRow } from "../components/form-row";
import { formatDateTime } from "../lib/format";

export function PendingReviewsPage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [operation, setOperation] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [revisionKind, setRevisionKind] = useState("");
  const pendingQ = useQuery({
    queryKey: ["wiki", "pending-reviews", operation, riskLevel, revisionKind],
    queryFn: () =>
      wikiApi.listPending({
        operation: operation || undefined,
        riskLevel: riskLevel || undefined,
        revisionKind: revisionKind || undefined,
      }),
    enabled: hasRole(user, "patroller"),
  });

  const decideMut = useMutation({
    mutationFn: (input: {
      revisionId: string;
      decision: "approve" | "reject" | "request_changes";
      note?: string;
    }) => wikiApi.decide(input.revisionId, input.decision, input.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki", "pending-reviews"] });
      void qc.invalidateQueries({ queryKey: ["wiki", "recent-changes"] });
      void qc.invalidateQueries({ queryKey: ["wiki", "characters"] });
    },
  });

  // 必须放在条件 return 之前，否则用户登入/登出时本组件下一次渲染会调用更少/更多
  // hooks，触发 React "Rendered fewer/more hooks than during the previous render"。
  const items = pendingQ.data ?? [];
  const { resolve: resolveUsername } = useUsernameMap(
    items.map((it) => it.revision.editorUserId),
  );

  if (!user) {
    return (
      <PageShell eyebrow={t(msg`审核`)} title={t(msg`待审编辑`)}>
        <Card className="p-6 text-sm">
          <Trans>
            请先{" "}
            <Link to="/login" className="font-medium underline">
              登录
            </Link>{" "}
            后再访问待审编辑队列。
          </Trans>
        </Card>
      </PageShell>
    );
  }
  if (!hasRole(user, "patroller")) {
    return (
      <PageShell eyebrow={t(msg`审核`)} title={t(msg`待审编辑`)}>
        <InlineNotice tone="warning">
          <Trans>仅巡查员及以上可访问待审编辑队列。</Trans>
        </InlineNotice>
      </PageShell>
    );
  }
  return (
    <PageShell
      eyebrow={t(msg`审核`)}
      title={
        items.length > 0
          ? t(msg`待审编辑（${items.length}）`)
          : t(msg`待审编辑`)
      }
      description={t(
        msg`所有等待巡查的提交。可按操作类型、修订类型、风险等级筛选；快速通过 / 要求修改 / 驳回。`,
      )}
    >
      <div className="grid grid-cols-1 gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-3 text-sm shadow-[var(--shadow-soft)] sm:flex sm:flex-wrap sm:items-center">
        <FilterSelect
          label={t(msg`操作`)}
          value={operation}
          onChange={setOperation}
          options={[
            ["", msg`全部`],
            ["create", msg`创建`],
            ["edit", msg`编辑`],
            ["soft_delete", msg`删除`],
            ["restore", msg`恢复`],
          ]}
        />
        <FilterSelect
          label={t(msg`类型`)}
          value={revisionKind}
          onChange={setRevisionKind}
          options={[
            ["", msg`全部`],
            ["content", msg`档案`],
            ["recipe", msg`逻辑`],
            ["lifecycle", msg`生命周期`],
          ]}
        />
        <FilterSelect
          label={t(msg`风险`)}
          value={riskLevel}
          onChange={setRiskLevel}
          options={[
            ["", msg`全部`],
            ["low", msg`低风险`],
            ["high", msg`高风险`],
          ]}
        />
      </div>
      {pendingQ.isLoading && <LoadingBlock />}
      {pendingQ.isError && (
        <ErrorBlock message={(pendingQ.error as Error).message} />
      )}
      {!pendingQ.isLoading && items.length === 0 && (
        <PanelEmpty
          message={
            operation || riskLevel || revisionKind
              ? t(msg`没有符合筛选条件的待审项。试试清空筛选。`)
              : t(msg`待审队列为空，喘口气吧 ☕。`)
          }
        />
      )}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.submission.id}>
            <ReviewCard
              item={item}
              editorName={resolveUsername(item.revision.editorUserId)}
              onDecide={(decision, note) =>
                decideMut.mutate({
                  revisionId: item.revision.id,
                  decision,
                  note,
                })
              }
              loading={decideMut.isPending}
            />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: [string, MessageDescriptor][];
}) {
  const t = translateRuntimeMessage;
  return (
    <label className="flex w-full items-center gap-2 sm:w-auto">
      <span className="w-12 shrink-0 text-xs text-[color:var(--text-muted)] sm:w-auto">
        {label}
      </span>
      <select
        className="w-full rounded-full border border-[color:var(--border-subtle)] bg-white px-3 py-1.5 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none sm:w-auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {t(l)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ReviewCard({
  item,
  editorName,
  onDecide,
  loading,
}: {
  item: PendingReviewItem;
  editorName: string;
  onDecide: (
    decision: "approve" | "reject" | "request_changes",
    note?: string,
  ) => void;
  loading: boolean;
}) {
  const t = translateRuntimeMessage;
  const [note, setNote] = useState("");
  const rev = item.revision;
  const isHigh = rev.riskLevel === "high";
  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)] ${
        isHigh
          ? "border-[color:var(--border-danger)]"
          : "border-[color:var(--border-faint)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border-faint)] px-4 py-3 text-sm">
        <Link
          to="/character/$characterId"
          params={{ characterId: rev.characterId }}
          className="font-medium text-[color:var(--text-primary)] hover:underline"
        >
          {rev.contentSnapshot?.name || rev.characterId}
        </Link>
        <StatusPill>v{rev.version}</StatusPill>
        <StatusPill>{rev.operation}</StatusPill>
        <StatusPill>{rev.revisionKind}</StatusPill>
        {isHigh && (
          <StatusPill>
            <Trans>高风险</Trans>
          </StatusPill>
        )}
        <span className="text-xs text-[color:var(--text-muted)] sm:ml-auto">
          <Trans>
            由 {editorName}（{rev.editorRoleAtTime}）提交于{" "}
            {formatDateTime(rev.createdAt)}
          </Trans>
        </span>
      </div>
      <div className="space-y-3 px-4 py-4 text-sm">
        {rev.editSummary && (
          <div>
            <span className="text-xs text-[color:var(--text-muted)]">
              <Trans>摘要</Trans>
            </span>
            <div className="mt-0.5 leading-6">{rev.editSummary}</div>
          </div>
        )}
        <div className="text-xs text-[color:var(--text-muted)]">
          <Trans>
            改动字段：{rev.diffFromParent?.changed?.join(", ") ?? "—"}
          </Trans>
        </div>
        <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] p-3">
          <SnapshotDiff
            before={null}
            after={rev.contentSnapshot}
            changedFields={rev.diffFromParent?.changed}
          />
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-[color:var(--text-muted)]">
            <Trans>查看完整快照</Trans>
          </summary>
          <pre className="mt-2 overflow-auto max-h-[40vh] md:max-h-[60vh] rounded bg-[var(--bg-canvas)] p-3">
            {JSON.stringify(rev.contentSnapshot, null, 2)}
          </pre>
        </details>
        {rev.recipeSnapshot && (
          <details className="text-xs">
            <summary className="cursor-pointer text-[color:var(--text-muted)]">
              <Trans>查看角色逻辑快照</Trans>
            </summary>
            <pre className="mt-2 overflow-auto max-h-[40vh] md:max-h-[60vh] rounded bg-[var(--bg-canvas)] p-3">
              {JSON.stringify(rev.recipeSnapshot, null, 2)}
            </pre>
          </details>
        )}
        <FormRow
          label={t(msg`审核备注（可选）`)}
          hint={t(msg`留给提交者的反馈。要求修改 / 驳回时建议填写`)}
        >
          <TextField
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(msg`例如：请补充背景说明`)}
          />
        </FormRow>
      </div>
      <div className="grid grid-cols-1 gap-2 border-t border-[color:var(--border-faint)] bg-[color:var(--surface-card-hover)] px-4 py-3 sm:flex sm:flex-wrap sm:items-center">
        <Button
          variant="primary"
          size="sm"
          className="w-full sm:w-auto"
          disabled={loading}
          onClick={() => onDecide("approve", note || undefined)}
        >
          <Trans>✓ 通过</Trans>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto"
          disabled={loading}
          onClick={() => onDecide("request_changes", note || undefined)}
        >
          <Trans>要求修改</Trans>
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="w-full sm:w-auto"
          disabled={loading}
          onClick={() => onDecide("reject", note || undefined)}
        >
          <Trans>驳回</Trans>
        </Button>
      </div>
    </div>
  );
}
