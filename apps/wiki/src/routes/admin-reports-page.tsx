import { useState } from "react";
import type { MessageDescriptor } from "@lingui/core";
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
import { wikiApi, type ModerationReport } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { formatDateTime } from "../lib/format";
import { useUsernameMap } from "../lib/use-username-map";

export function AdminReportsPage() {
  const t = translateRuntimeMessage;
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "resolved" | "dismissed">(
    "open",
  );
  const reportsQ = useQuery({
    queryKey: ["wiki", "reports", status],
    queryFn: () => wikiApi.listReports(status),
  });
  const setStatusMut = useMutation({
    mutationFn: (input: { id: string; status: "resolved" | "dismissed" }) =>
      wikiApi.updateReportStatus(input.id, input.status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wiki", "reports"] }),
  });

  const tabs: [typeof status, MessageDescriptor][] = [
    ["open", msg`未处理`],
    ["resolved", msg`已处理`],
    ["dismissed", msg`已驳回`],
  ];

  return (
    <PageShell
      eyebrow={t(msg`管理`)}
      title={t(msg`举报队列`)}
      description={t(
        msg`社区举报的内容会先进入"未处理"状态。逐条审核后选择已处理或驳回。`,
      )}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {reportsQ.isFetching && (
            <span className="text-xs text-[color:var(--text-muted)]">
              <Trans>载入中…</Trans>
            </span>
          )}
          <div className="wiki-touch-scroll inline-flex max-w-full overflow-x-auto rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-1 shadow-[var(--shadow-soft)]">
            {tabs.map(([s, label]) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                disabled={reportsQ.isFetching && status !== s}
                aria-current={status === s ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  status === s
                    ? "bg-[image:var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)]"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card-hover)]"
                }`}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {reportsQ.isLoading && <LoadingBlock />}
      {reportsQ.isError && (
        <ErrorBlock message={(reportsQ.error as Error).message} />
      )}
      {reportsQ.data?.length === 0 && (
        <PanelEmpty message={t(msg`当前分类下暂无举报。`)} />
      )}
      <ReportList
        reports={reportsQ.data ?? []}
        onDecide={(id, s) => setStatusMut.mutate({ id, status: s })}
        disabled={setStatusMut.isPending}
      />
    </PageShell>
  );
}

function ReportList({
  reports,
  onDecide,
  disabled,
}: {
  reports: ModerationReport[];
  onDecide: (id: string, s: "resolved" | "dismissed") => void;
  disabled: boolean;
}) {
  const { resolve: resolveOwner } = useUsernameMap(
    reports.map((r) => r.ownerId),
  );
  return (
    <ul className="space-y-2">
      {reports.map((r) => (
        <li key={r.id}>
          <ReportCard
            report={r}
            ownerLabel={resolveOwner(r.ownerId)}
            onDecide={(s) => onDecide(r.id, s)}
            disabled={disabled}
          />
        </li>
      ))}
    </ul>
  );
}

function ReportCard({
  report,
  ownerLabel,
  onDecide,
  disabled,
}: {
  report: ModerationReport;
  ownerLabel: string;
  onDecide: (s: "resolved" | "dismissed") => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] transition-colors hover:bg-[color:var(--surface-card-hover)]">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill>{report.targetType}</StatusPill>
        <code className="text-xs">{report.targetId.slice(0, 12)}…</code>
        <StatusPill>{report.status}</StatusPill>
        <span className="ml-auto text-xs text-[color:var(--text-muted)]">
          <Trans>
            举报人 {ownerLabel} · {formatDateTime(report.createdAt)}
          </Trans>
        </span>
      </div>
      <div>{report.reason}</div>
      {report.details && (
        <div className="text-xs text-[color:var(--text-muted)]">
          {report.details}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {report.targetType === "wiki_page" && (
          <Link
            to="/character/$characterId"
            params={{ characterId: report.targetId }}
            className="text-xs underline"
          >
            <Trans>打开词条</Trans>
          </Link>
        )}
        {report.status === "open" && (
          <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
            <Button
              size="sm"
              variant="primary"
              className="flex-1 sm:flex-none"
              disabled={disabled}
              onClick={() => onDecide("resolved")}
            >
              <Trans>标记已处理</Trans>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 sm:flex-none"
              disabled={disabled}
              onClick={() => onDecide("dismissed")}
            >
              <Trans>驳回</Trans>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
