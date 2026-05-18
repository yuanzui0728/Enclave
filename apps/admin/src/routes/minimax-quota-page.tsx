// i18n-ignore-start: internal admin diagnostics page — text labels not user-facing.
import { useQuery } from "@tanstack/react-query";
import { Button, Card, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { AdminPageHero, AdminSectionHeader } from "../components/admin-workbench";
import { adminApi, type MinimaxQuotaResponse } from "../lib/admin-api";

const MODEL_LABELS: Record<string, string> = {
  "MiniMax-Hailuo-2.3-Fast": "Hailuo 2.3 Fast (768P 6s 视频)",
  "MiniMax-Hailuo-2.3": "Hailuo 2.3 (768P 6s 视频)",
  "music-2.6": "Music 2.6 (主力音乐)",
  "music-2.5": "Music 2.5 (fallback)",
  "image-01": "Image-01 (图像 / 视频封面)",
  lyrics: "Lyrics 生成",
  "MiniMax-M2.7": "MiniMax M2.7 (Chat LLM)",
  "speech-02-hd": "Speech 02 HD (语音合成 · 高保真)",
};

function formatPct(used: number, limit: number): string {
  if (limit <= 0) return "—";
  return `${Math.round((used / limit) * 100)}%`;
}

function rowTone(remaining: number, limit: number): string {
  if (limit <= 0) return "text-[color:var(--text-muted)]";
  if (remaining <= 0) return "text-red-600 font-semibold";
  if (remaining <= 1) return "text-amber-600 font-semibold";
  return "text-[color:var(--text-primary)]";
}

export function MinimaxQuotaPage() {
  const { data, isLoading, error, refetch, isFetching } =
    useQuery<MinimaxQuotaResponse>({
      queryKey: ["minimax-quota"],
      queryFn: () => adminApi.getMinimaxQuota(),
      refetchInterval: 30_000,
    });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHero
        eyebrow="MiniMax"
        title="Token Plan 当日配额"
        description="每个能力按 Asia/Shanghai 计费日统计；自动每 30s 刷新。warnings 列表显示 remaining ≤ 1 的能力，需要留意是否会影响后续 cron 触发。"
        badges={data ? [`日期：${data.date}`] : undefined}
      />

      {isLoading ? (
        <LoadingBlock label="正在加载配额…" />
      ) : error ? (
        <ErrorBlock message={`加载失败：${(error as Error)?.message ?? "未知错误"}`}>
          <Button className="mt-3" onClick={() => void refetch()}>
            重试
          </Button>
        </ErrorBlock>
      ) : data ? (
        <>
          {data.warnings.length > 0 ? (
            <Card className="border-amber-300 bg-amber-50">
              <div className="text-sm font-semibold text-amber-700">
                ⚠ 接近耗尽 ({data.warnings.length})
              </div>
              <div className="mt-1 text-sm text-amber-700">
                {data.warnings
                  .map((m) => MODEL_LABELS[m] ?? m)
                  .join("、")}
              </div>
            </Card>
          ) : null}

          <Card>
            <AdminSectionHeader
              title="按能力分布"
              description={
                isFetching ? "刷新中…" : "used = reserved (在途) + committed (已完成)"
              }
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-wider text-[color:var(--text-muted)]">
                    <th className="py-2 pr-4">能力</th>
                    <th className="py-2 pr-4 text-right">已用</th>
                    <th className="py-2 pr-4 text-right">在途</th>
                    <th className="py-2 pr-4 text-right">已完成</th>
                    <th className="py-2 pr-4 text-right">配额</th>
                    <th className="py-2 pr-4 text-right">剩余</th>
                    <th className="py-2 pr-4 text-right">使用率</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.byModel).map(([model, snap]) => (
                    <tr
                      key={model}
                      className="border-t border-[color:var(--border-soft)]"
                    >
                      <td className="py-2 pr-4">
                        <div className="font-medium">
                          {MODEL_LABELS[model] ?? model}
                        </div>
                        <div className="text-[11px] text-[color:var(--text-muted)]">
                          {model}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {snap.used}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {snap.reserved}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {snap.committed}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {snap.limit}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right tabular-nums ${rowTone(snap.remaining, snap.limit)}`}
                      >
                        {snap.remaining}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-[color:var(--text-secondary)]">
                        {formatPct(snap.used, snap.limit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
// i18n-ignore-end
