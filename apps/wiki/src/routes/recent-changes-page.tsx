import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
} from "@yinjie/ui";
import { hasRole } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import { wikiApi, type WikiRevisionSummary } from "../lib/wiki-api";

export function RecentChangesPage() {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">最近修改</h1>
        {isPatroller && (
          <label className="ml-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyUnpatrolled}
              onChange={(e) => setOnlyUnpatrolled(e.target.checked)}
            />
            仅看待巡查
          </label>
        )}
      </div>
      {listQ.isLoading && <LoadingBlock />}
      {listQ.isError && (
        <ErrorBlock message={(listQ.error as Error).message} />
      )}
      {listQ.data && listQ.data.length === 0 && (
        <Card className="p-6 text-sm text-[var(--text-muted)]">
          暂无变更。
        </Card>
      )}
      <ul className="space-y-2">
        {listQ.data?.map((rev) => (
          <ChangeRow
            key={rev.id}
            rev={rev}
            isPatroller={isPatroller}
            onPatrol={() => patrolMut.mutate(rev.id)}
            patrolling={patrolMut.isPending}
          />
        ))}
      </ul>
    </div>
  );
}

function ChangeRow({
  rev,
  isPatroller,
  onPatrol,
  patrolling,
}: {
  rev: WikiRevisionSummary;
  isPatroller: boolean;
  onPatrol: () => void;
  patrolling: boolean;
}) {
  return (
    <Card className="p-3 flex items-start gap-3 text-sm">
      <div className="w-12 font-mono text-[var(--text-muted)] pt-0.5">
        v{rev.version}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/character/$characterId"
            params={{ characterId: rev.characterId }}
            className="font-medium hover:underline"
          >
            {rev.characterId}
          </Link>
          <StatusPill>{rev.status}</StatusPill>
          {rev.changeSource !== "edit" && (
            <StatusPill>{rev.changeSource}</StatusPill>
          )}
          {!rev.isPatrolled && rev.status === "approved" && (
            <span className="text-xs px-2 py-0.5 rounded bg-[rgba(254,243,199,0.6)] text-[#92400e]">
              待巡查
            </span>
          )}
          {rev.isMinor && (
            <span className="text-xs text-[var(--text-muted)]">小修改</span>
          )}
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1">
          {rev.editorUserId}（{rev.editorRoleAtTime}） ·{" "}
          {new Date(rev.createdAt).toLocaleString()}
        </div>
        {rev.editSummary && (
          <div className="mt-1">{rev.editSummary}</div>
        )}
        {rev.diffFromParent?.changed && (
          <div className="text-xs text-[var(--text-muted)] mt-1">
            字段：{rev.diffFromParent.changed.join(", ")}
          </div>
        )}
      </div>
      {isPatroller && !rev.isPatrolled && rev.status === "approved" && (
        <Button size="sm" disabled={patrolling} onClick={onPatrol}>
          标记已巡查
        </Button>
      )}
    </Card>
  );
}
