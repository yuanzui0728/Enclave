import { useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  ErrorBlock,
  LoadingBlock,
  PanelEmpty,
  StatusPill,
} from "@yinjie/ui";
import { hasRole, roleLabel } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import { wikiApi, type WikiRevisionSummary } from "../lib/wiki-api";
import { useUsernameMap } from "../lib/use-username-map";
import { PageShell } from "../components/page-shell";
import { formatDateTime } from "../lib/format";
import {
  revisionChangeSourceLabel,
  revisionKindLabel,
  revisionOperationLabel,
  revisionStatusLabel,
} from "../lib/revision-labels";

export function RecentChangesPage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const isPatroller = hasRole(user, "patroller");
  const [onlyUnpatrolled, setOnlyUnpatrolled] = useState(false);
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["wiki", "recent-changes", onlyUnpatrolled],
    queryFn: () => wikiApi.recentChanges({ onlyUnpatrolled }),
  });

  const patrolMut = useMutation({
    mutationFn: (revisionId: string) => wikiApi.patrol(revisionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki", "recent-changes"] });
    },
  });

  const { resolve: resolveUsername } = useUsernameMap(
    (listQ.data ?? []).map((r) => r.editorUserId),
  );

  return (
    <PageShell
      eyebrow={t(msg`动态`)}
      title={t(msg`最近修改`)}
      description={t(
        msg`所有词条的提交、生命周期变更与审核流转。巡查员可以勾选"仅看待巡查"筛掉已巡查项。`,
      )}
      actions={
        isPatroller ? (
          <label className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2 text-sm shadow-[var(--shadow-soft)]">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={onlyUnpatrolled}
              onChange={(e) => setOnlyUnpatrolled(e.target.checked)}
            />
            <Trans>仅看待巡查</Trans>
          </label>
        ) : null
      }
    >
      {listQ.isLoading && <LoadingBlock />}
      {listQ.isError && (
        <ErrorBlock role="alert" message={(listQ.error as Error).message} />
      )}
      {listQ.data && listQ.data.length === 0 && (
        <PanelEmpty
          message={
            onlyUnpatrolled
              ? t(msg`所有变更都已巡查 ✅。取消勾选可看完整列表。`)
              : t(msg`暂无变更。`)
          }
        />
      )}
      {listQ.data && listQ.data.length > 0 && (
        <ul className="space-y-2">
          {listQ.data.map((rev) => (
            <ChangeRow
              key={rev.id}
              rev={rev}
              editorName={resolveUsername(rev.editorUserId)}
              isPatroller={isPatroller}
              onPatrol={() => patrolMut.mutate(rev.id)}
              // patrolMut 是整页共享的 mutation 实例；原写法 patrolling=
              // patrolMut.isPending 会让"任一行"在跑时所有行的"标记已巡查"按
              // 钮全灰。巡查员实战时多半是连点 N 条已扫过的小修改，每次都要等
              // 上一条 invalidate refetch 才能点下一条。改成只 disable 当前行
              // （variables 就是 rev.id），多行并发 mutate 也只盲掉那一行。
              patrolling={
                patrolMut.isPending && patrolMut.variables === rev.id
              }
            />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function ChangeRow({
  rev,
  editorName,
  isPatroller,
  onPatrol,
  patrolling,
}: {
  rev: WikiRevisionSummary;
  editorName: string;
  isPatroller: boolean;
  onPatrol: () => void;
  patrolling: boolean;
}) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] transition-colors hover:bg-[color:var(--surface-card-hover)]">
      <div className="w-12 shrink-0 pt-0.5 font-mono text-xs text-[color:var(--text-muted)]">
        v{rev.version}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/character/$characterId"
            params={{ characterId: rev.characterId }}
            className="truncate font-medium text-[color:var(--text-primary)] hover:underline"
          >
            {rev.contentSnapshot?.name || rev.characterId}
          </Link>
          {/* 原写法 <StatusPill>{rev.status}</StatusPill> 等 4 处裸渲染后端
              英文枚举（"approved" / "create" / "recipe" / "system"），跟同行
              的 "高风险" "待巡查" 中文标签夹在一起读起来像 i18n 漏译。统一
              走 revisionLabels.ts 的本地化映射。 */}
          <StatusPill>{revisionStatusLabel(rev.status)}</StatusPill>
          <StatusPill>{revisionOperationLabel(rev.operation)}</StatusPill>
          {rev.revisionKind !== "content" && (
            <StatusPill>{revisionKindLabel(rev.revisionKind)}</StatusPill>
          )}
          {rev.riskLevel === "high" && (
            <StatusPill>
              <Trans>高风险</Trans>
            </StatusPill>
          )}
          {rev.changeSource !== "edit" && (
            <StatusPill>
              {revisionChangeSourceLabel(rev.changeSource)}
            </StatusPill>
          )}
          {!rev.isPatrolled && rev.status === "approved" && (
            <span className="rounded-full bg-[color:var(--state-warning-bg)] px-2 py-0.5 text-xs text-[color:var(--state-warning-text)]">
              <Trans>待巡查</Trans>
            </span>
          )}
          {rev.isMinor && (
            <span className="text-xs text-[color:var(--text-muted)]">
              <Trans>小修改</Trans>
            </span>
          )}
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          {/* editorRoleAtTime 后端给的是英文枚举（patroller / admin /
              autoconfirmed / newcomer）。原写法直接渲染，中文用户看到
              "（patroller）"夹在中文里像漏译。走 roleLabel 本地化。 */}
          <Trans>
            {editorName}（{roleLabel(rev.editorRoleAtTime)}） ·{" "}
            {formatDateTime(rev.createdAt)}
          </Trans>
        </div>
        {rev.editSummary && (
          <div className="break-words text-sm leading-6">{rev.editSummary}</div>
        )}
        {rev.diffFromParent?.changed && (
          <div className="break-words text-xs text-[color:var(--text-muted)]">
            <Trans>字段：{rev.diffFromParent.changed.join(", ")}</Trans>
          </div>
        )}
      </div>
      {isPatroller && !rev.isPatrolled && rev.status === "approved" && (
        <Button
          size="sm"
          variant="primary"
          className="shrink-0"
          disabled={patrolling}
          onClick={onPatrol}
        >
          <Trans>标记已巡查</Trans>
        </Button>
      )}
    </li>
  );
}
