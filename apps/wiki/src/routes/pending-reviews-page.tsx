import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
  TextField,
} from "@yinjie/ui";
import { hasRole } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import { wikiApi, type PendingReviewItem } from "../lib/wiki-api";

export function PendingReviewsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pendingQ = useQuery({
    queryKey: ["wiki", "pending-reviews"],
    queryFn: () => wikiApi.listPending(),
    enabled: hasRole(user, "patroller"),
  });

  const decideMut = useMutation({
    mutationFn: (input: {
      revisionId: string;
      decision: "approve" | "reject";
      note?: string;
    }) => wikiApi.decide(input.revisionId, input.decision, input.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["wiki", "pending-reviews"] });
    },
  });

  if (!user) {
    return (
      <Card className="p-6">
        <p>请先登录。</p>
      </Card>
    );
  }
  if (!hasRole(user, "patroller")) {
    return (
      <Card className="p-6">
        <p>仅巡查员及以上可访问待审编辑队列。</p>
      </Card>
    );
  }
  if (pendingQ.isLoading) return <LoadingBlock />;
  if (pendingQ.isError)
    return <ErrorBlock message={(pendingQ.error as Error).message} />;
  const items = pendingQ.data ?? [];
  if (items.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--text-muted)]">待审队列为空。</p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">待审编辑（{items.length}）</h1>
      {items.map((item) => (
        <ReviewCard
          key={item.submission.id}
          item={item}
          onDecide={(decision, note) =>
            decideMut.mutate({
              revisionId: item.revision.id,
              decision,
              note,
            })
          }
          loading={decideMut.isPending}
        />
      ))}
    </div>
  );
}

function ReviewCard({
  item,
  onDecide,
  loading,
}: {
  item: PendingReviewItem;
  onDecide: (decision: "approve" | "reject", note?: string) => void;
  loading: boolean;
}) {
  const [note, setNote] = useState("");
  const rev = item.revision;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Link
          to="/character/$characterId"
          params={{ characterId: rev.characterId }}
          className="font-medium hover:underline"
        >
          {rev.characterId}
        </Link>
        <StatusPill>v{rev.version}</StatusPill>
        <span className="text-[var(--text-muted)]">
          由 {rev.editorUserId}（{rev.editorRoleAtTime}）提交于
          {new Date(rev.createdAt).toLocaleString()}
        </span>
      </div>
      {rev.editSummary && (
        <div className="text-sm">摘要：{rev.editSummary}</div>
      )}
      <div className="text-xs text-[var(--text-muted)]">
        改动字段：{rev.diffFromParent?.changed?.join(", ") ?? "—"}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--text-muted)]">
          查看完整快照
        </summary>
        <pre className="mt-2 p-3 bg-[var(--bg-canvas)] rounded text-xs overflow-x-auto">
          {JSON.stringify(rev.contentSnapshot, null, 2)}
        </pre>
      </details>
      <label className="block">
        <span className="text-sm mb-1 block">审核备注（可选）</span>
        <TextField
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="留给提交者的反馈"
        />
      </label>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={loading}
          onClick={() => onDecide("approve", note || undefined)}
        >
          通过
        </Button>
        <Button
          variant="danger"
          disabled={loading}
          onClick={() => onDecide("reject", note || undefined)}
        >
          驳回
        </Button>
      </div>
    </Card>
  );
}
