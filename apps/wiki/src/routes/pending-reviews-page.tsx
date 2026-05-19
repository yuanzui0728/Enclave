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
import { hasRole, roleLabel } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import { wikiApi, type PendingReviewItem } from "../lib/wiki-api";
import { useUsernameMap } from "../lib/use-username-map";
import { SnapshotDiff } from "../components/snapshot-diff";
import { PageShell } from "../components/page-shell";
import { FormRow } from "../components/form-row";
import { formatDateTime } from "../lib/format";
import {
  revisionKindLabel,
  revisionOperationLabel,
} from "../lib/revision-labels";

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
        <ErrorBlock role="alert" message={(pendingQ.error as Error).message} />
      )}
      {/* decideMut 失败时原写法无任何反馈：patroller 点"通过/要求修改/驳回"
          → 后端拒（如已被他人抢审 superseded、network 抖、conflict）→ 卡片
          维持原样，按钮回到 enabled，巡查员误以为提交成功，第二个待审项
          被卡死。补 InlineNotice 顶级展示后端报错原因；role=alert 让 SR 立即
          播报。 */}
      {decideMut.isError && (
        <InlineNotice tone="danger" role="alert">
          {(decideMut.error as Error).message}
        </InlineNotice>
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
              // decideMut 是整页共享的 mutation；原写法 loading=decideMut.isPending
              // 会让"任一卡片"决策中时整页 N 个卡片的 通过/要求修改/驳回 三个
              // 按钮都灰掉。巡查员经常连扫 10+ 张待审，每次都要等 invalidate 重新
              // refetch 才能点下一张，体感很卡。改成只灰当前卡片（variables.revisionId
              // 就是 item.revision.id），多卡并发 decide 也只盲掉那一张。
              loading={
                decideMut.isPending &&
                decideMut.variables?.revisionId === item.revision.id
              }
            />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

function LazyJsonDetails({
  summary,
  data,
}: {
  summary: string;
  data: unknown;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="text-xs"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-[color:var(--text-muted)]">
        {summary}
      </summary>
      {open && (
        <pre className="mt-2 overflow-auto max-h-[40vh] md:max-h-[60vh] rounded bg-[var(--bg-canvas)] p-3">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </details>
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
        {/* 原写法裸渲染 rev.operation / rev.revisionKind 后端英文枚举，待审
            队列中文界面里夹一行 "create recipe" 跟筛选下拉 "创建 / 逻辑"
            完全对不上号；改走和筛选下拉相同的本地化映射。 */}
        <StatusPill>{revisionOperationLabel(rev.operation)}</StatusPill>
        <StatusPill>{revisionKindLabel(rev.revisionKind)}</StatusPill>
        {isHigh && (
          <StatusPill>
            <Trans>高风险</Trans>
          </StatusPill>
        )}
        <span className="text-xs text-[color:var(--text-muted)] sm:ml-auto">
          {/* 同 recent-changes：editorRoleAtTime 是英文 enum，走 roleLabel 本地化 */}
          <Trans>
            由 {editorName}（{roleLabel(rev.editorRoleAtTime)}）提交于{" "}
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
        {/* JSON.stringify 是 O(N) 序列化 + ~5KB/snapshot；待审队列 14 条 ×
            2 个 details = 28 次穿堂风式跑 stringify，每次列表筛选 / mutation
            invalidate 后整页 ReviewCard 都重渲。原写法 details 关着也跑。
            用本地 open state 把 stringify 推到首次展开后。 */}
        <LazyJsonDetails
          summary={t(msg`查看完整快照`)}
          data={rev.contentSnapshot}
        />
        {rev.recipeSnapshot && (
          <LazyJsonDetails
            summary={t(msg`查看角色逻辑快照`)}
            data={rev.recipeSnapshot}
          />
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
          onClick={() => {
            // 驳回是不可撤销的终态：revision 落 status=rejected，提交者要
            // 重新走一整轮 6-section 表单。原写法点一下就直接发，跟旁边
            // 的"要求修改"（提交者可改后重新提交）视觉权重一样，鼠标抖
            // 一下就可能错点把别人的工作毙掉。高风险驳回更值得一道闸。
            const label =
              rev.contentSnapshot?.name || rev.characterId.slice(0, 16);
            const ok = window.confirm(
              t(
                msg`确认驳回「${label}」v${rev.version}？此操作不可撤销，提交者需要重新提交。建议在审核备注里说明驳回原因。`,
              ),
            );
            if (!ok) return;
            onDecide("reject", note || undefined);
          }}
        >
          <Trans>驳回</Trans>
        </Button>
      </div>
    </div>
  );
}
