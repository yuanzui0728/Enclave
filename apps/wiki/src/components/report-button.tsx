import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, ErrorBlock, TextField } from "@yinjie/ui";
import { useAuth } from "../lib/use-auth";
import { wikiApi } from "../lib/wiki-api";

export function ReportButton({
  targetType,
  targetId,
  className,
}: {
  targetType: "wiki_revision" | "wiki_talk_post" | "wiki_page";
  targetId: string;
  className?: string;
}) {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const reportMut = useMutation({
    mutationFn: () =>
      wikiApi.reportTarget({
        targetType,
        targetId,
        reason: reason.trim(),
        details: details.trim() || undefined,
      }),
    onSuccess: () => {
      setOpen(false);
      setReason("");
      setDetails("");
    },
  });

  const submitReport = () => {
    if (reportMut.isPending || !reason.trim()) return;
    reportMut.mutate();
  };

  if (!user) return null;
  if (!open) {
    return (
      <button
        type="button"
        className={`inline-flex min-h-[32px] items-center rounded-md px-2 py-1 text-xs underline hover:text-[var(--state-danger-text)] ${className ?? ""}`}
        onClick={() => {
          reportMut.reset();
          setOpen(true);
        }}
      >
        <Trans>举报</Trans>
      </button>
    );
  }
  return (
    <div className="mt-2 p-2 border border-[var(--border-subtle)] rounded space-y-2 text-xs bg-white">
      <TextField
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t(msg`原因（必填，例：辱骂 / 虚假信息）`)}
        maxLength={200}
      />
      <TextField
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={t(msg`补充说明（可选）`)}
        maxLength={500}
      />
      {reportMut.isError && (
        <ErrorBlock message={(reportMut.error as Error).message} />
      )}
      {reportMut.isSuccess && (
        <div className="text-[var(--state-success-text,#0a7d4f)]">
          <Trans>已提交，管理员将处理。</Trans>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="danger"
          disabled={!reason.trim() || reportMut.isPending}
          onClick={submitReport}
        >
          {reportMut.isPending ? t(msg`提交中...`) : t(msg`提交举报`)}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          <Trans>取消</Trans>
        </Button>
      </div>
    </div>
  );
}
