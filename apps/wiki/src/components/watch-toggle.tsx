import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { useAuth } from "../lib/use-auth";
import { wikiApi } from "../lib/wiki-api";

export function WatchToggle({ characterId }: { characterId: string }) {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const qc = useQueryClient();
  const statusQ = useQuery({
    queryKey: ["wiki", "watchlist", "status", characterId],
    queryFn: () => wikiApi.isWatching(characterId),
    enabled: !!user,
  });
  const statusKey = ["wiki", "watchlist", "status", characterId];
  const watchMut = useMutation({
    mutationFn: () =>
      statusQ.data?.watching
        ? wikiApi.unwatch(characterId)
        : wikiApi.watch(characterId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: statusKey });
      const prev = qc.getQueryData<{ watching: boolean }>(statusKey);
      qc.setQueryData<{ watching: boolean }>(statusKey, {
        watching: !(prev?.watching ?? false),
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(statusKey, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: statusKey });
      void qc.invalidateQueries({ queryKey: ["wiki", "watchlist"] });
    },
  });
  if (!user) return null;
  const watching = statusQ.data?.watching;
  // 这是一颗在两个状态之间切换的 toggle button（观察 / 已观察），WAI-ARIA 的
  // 标准状态属性是 aria-pressed。原写法只靠 "★/☆" 字形 + 中文文案传达状态，
  // SR 听不到布尔状态（NVDA 还会把 ☆ 念成 "white star outline"，黑白底色噪声
  // 直接塞进按钮可访问名），换 locale 后差别变得更难分辨。
  // 同时把星号 glyph 标 aria-hidden，让 SR 只读 "观察" / "已观察"。
  return (
    <Button
      size="sm"
      variant={watching ? "secondary" : "ghost"}
      aria-pressed={watching ?? false}
      disabled={watchMut.isPending || statusQ.isLoading}
      onClick={() => watchMut.mutate()}
    >
      <span aria-hidden="true">{watching ? "★ " : "☆ "}</span>
      {watching ? t(msg`已观察`) : t(msg`观察`)}
    </Button>
  );
}
