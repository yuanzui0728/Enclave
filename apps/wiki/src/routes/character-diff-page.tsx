import { Trans } from "@lingui/react/macro";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorBlock, LoadingBlock, StatusPill } from "@yinjie/ui";
import { SnapshotDiff } from "../components/snapshot-diff";
import { wikiApi } from "../lib/wiki-api";
import { revisionOperationLabel } from "../lib/revision-labels";

export function CharacterDiffPage() {
  const search = useSearch({ from: "/character/$characterId/diff" });
  const { characterId } = useParams({ from: "/character/$characterId/diff" });
  const diffQ = useQuery({
    queryKey: ["wiki", "diff", characterId, search.from, search.to],
    queryFn: () => wikiApi.getDiff(characterId, search.from, search.to),
    enabled: Boolean(search.from && search.to),
  });

  if (!search.from || !search.to) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--text-muted)]">
          <Trans>缺少对比版本参数。</Trans>
        </p>
      </Card>
    );
  }
  if (diffQ.isLoading) return <LoadingBlock />;
  if (diffQ.isError)
    return <ErrorBlock role="alert" message={(diffQ.error as Error).message} />;

  const data = diffQ.data;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/character/$characterId"
          params={{ characterId: data.to.characterId }}
          className="text-sm underline text-[var(--text-muted)]"
        >
          <Trans>返回词条</Trans>
        </Link>
        <h1 className="text-lg font-semibold sm:text-xl">
          <Trans>v{data.from.version} 对比 v{data.to.version}</Trans>
        </h1>
        {/* 原写法裸渲染 data.to.operation 后端英文枚举（create/soft_delete/
            revert...）；diff 页面顶部标题已经是 "v3 对比 v4" 全中文，紧跟一个
            "soft_delete" 英文 pill 显得没翻译完。走和历史 tab 一致的本地化
            映射。 */}
        <StatusPill>{revisionOperationLabel(data.to.operation)}</StatusPill>
        {data.to.riskLevel === "high" && (
          <StatusPill>
            <Trans>高风险</Trans>
          </StatusPill>
        )}
      </div>
      <Card className="p-4 space-y-4">
        <SnapshotDiff
          before={data.from.contentSnapshot}
          after={data.to.contentSnapshot}
          changedFields={data.to.diffFromParent?.changed}
        />
        {(data.from.recipeSnapshot || data.to.recipeSnapshot) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
            <div>
              <h2 className="font-medium mb-2">
                <Trans>旧角色逻辑</Trans>
              </h2>
              <pre className="p-3 rounded bg-[var(--bg-canvas)] overflow-auto max-h-[40vh] md:max-h-[60vh]">
                {JSON.stringify(data.from.recipeSnapshot ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <h2 className="font-medium mb-2">
                <Trans>新角色逻辑</Trans>
              </h2>
              <pre className="p-3 rounded bg-[var(--bg-canvas)] overflow-auto max-h-[40vh] md:max-h-[60vh]">
                {JSON.stringify(data.to.recipeSnapshot ?? null, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
