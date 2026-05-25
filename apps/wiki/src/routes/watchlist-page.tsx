import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  PanelEmpty,
  StatusPill,
} from "@yinjie/ui";
import { useAuth } from "../lib/use-auth";
import { wikiApi, type WatchlistEntry } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { formatDate, formatDateTime } from "../lib/format";

// 观察列表条目的行内管理：调整"编辑/讨论"通知开关 + 取消关注。
// 此前 /watchlist 是纯只读列表，取消关注只能逐个点进角色页 ⭐，且后端早已支持的
// notifyOnEdit/notifyOnTalk 两个开关在 UI 上根本无入口（永远停在默认 true）。
const WATCHLIST_KEY = ["wiki", "watchlist"] as const;

function WatchlistRow({ entry }: { entry: WatchlistEntry }) {
  const t = translateRuntimeMessage;
  const qc = useQueryClient();

  const flagsMut = useMutation({
    mutationFn: (flags: { notifyOnEdit?: boolean; notifyOnTalk?: boolean }) =>
      wikiApi.setWatchFlags(entry.characterId, flags),
    onMutate: async (flags) => {
      await qc.cancelQueries({ queryKey: WATCHLIST_KEY });
      const prev = qc.getQueryData<WatchlistEntry[]>(WATCHLIST_KEY);
      qc.setQueryData<WatchlistEntry[]>(WATCHLIST_KEY, (old) =>
        (old ?? []).map((e) =>
          e.characterId === entry.characterId ? { ...e, ...flags } : e,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WATCHLIST_KEY, ctx.prev);
    },
    // WATCHLIST_KEY 是前缀，同时令 list / feed / status 各 query 失效重取
    // （通知开关变化会影响 feed 内容）。
    onSettled: () => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const unwatchMut = useMutation({
    mutationFn: () => wikiApi.unwatch(entry.characterId),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: WATCHLIST_KEY });
      const prev = qc.getQueryData<WatchlistEntry[]>(WATCHLIST_KEY);
      qc.setQueryData<WatchlistEntry[]>(WATCHLIST_KEY, (old) =>
        (old ?? []).filter((e) => e.characterId !== entry.characterId),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WATCHLIST_KEY, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: WATCHLIST_KEY }),
  });

  const busy = flagsMut.isPending || unwatchMut.isPending;

  return (
    <li className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] transition-colors hover:bg-[color:var(--surface-card-hover)]">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/character/$characterId"
          params={{ characterId: entry.characterId }}
          className="font-medium text-[color:var(--text-primary)] hover:underline"
        >
          {entry.title || entry.characterId}
        </Link>
        {entry.isDeleted && (
          <StatusPill>
            <Trans>已删除</Trans>
          </StatusPill>
        )}
        {entry.protectionLevel !== "none" && (
          <StatusPill>
            {entry.protectionLevel === "semi"
              ? t(msg`半保护`)
              : t(msg`完全保护`)}
          </StatusPill>
        )}
        <span className="ml-auto whitespace-nowrap text-xs text-[color:var(--text-muted)]">
          <Trans>自 {formatDate(entry.addedAt)}</Trans>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* 文案固定为概念名（编辑通知/讨论通知），开/关状态用 aria-pressed + 实心/
            幽灵两种 variant 表达，避免每个状态各占一条译文，也更贴近 a11y 规范。 */}
        <Button
          size="sm"
          variant={entry.notifyOnEdit ? "secondary" : "ghost"}
          aria-pressed={entry.notifyOnEdit}
          disabled={busy}
          onClick={() =>
            flagsMut.mutate({ notifyOnEdit: !entry.notifyOnEdit })
          }
        >
          <span aria-hidden="true">{entry.notifyOnEdit ? "🔔 " : "🔕 "}</span>
          {t(msg`编辑通知`)}
        </Button>
        <Button
          size="sm"
          variant={entry.notifyOnTalk ? "secondary" : "ghost"}
          aria-pressed={entry.notifyOnTalk}
          disabled={busy}
          onClick={() =>
            flagsMut.mutate({ notifyOnTalk: !entry.notifyOnTalk })
          }
        >
          <span aria-hidden="true">{entry.notifyOnTalk ? "🔔 " : "🔕 "}</span>
          {t(msg`讨论通知`)}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-[color:var(--text-danger,#dc2626)]"
          disabled={busy}
          onClick={() => unwatchMut.mutate()}
        >
          <Trans>取消关注</Trans>
        </Button>
      </div>
    </li>
  );
}

export function WatchlistPage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const listQ = useQuery({
    queryKey: ["wiki", "watchlist"],
    queryFn: () => wikiApi.watchlist(),
    enabled: !!user,
  });
  const feedQ = useQuery({
    queryKey: ["wiki", "watchlist", "feed"],
    queryFn: () => wikiApi.watchlistFeed(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <PageShell
        eyebrow={t(msg`个人`)}
        title={t(msg`我的观察列表`)}
        description={t(msg`登录后即可关注词条并查看最新动态。`)}
      >
        <Card className="p-6 text-sm">
          <Trans>
            请先{" "}
            <Link to="/login" className="font-medium underline">
              登录
            </Link>{" "}
            后再使用此功能。
          </Trans>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={t(msg`个人`)}
      title={t(msg`我的观察列表`)}
      description={t(
        msg`左侧是你正在观察的所有词条；右侧汇总它们的最新版本与讨论动态。在词条页右上角点击 ⭐ 关注/取消关注。`,
      )}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            <Trans>观察的词条</Trans>
          </h2>
          {listQ.isLoading && <LoadingBlock />}
          {listQ.isError && (
            <ErrorBlock role="alert" message={(listQ.error as Error).message} />
          )}
          {listQ.data?.length === 0 && (
            <PanelEmpty
              message={t(
                msg`还没有观察任何词条。打开任意角色页，点击右上角的 ⭐ 关注按钮即可加入。`,
              )}
            />
          )}
          <ul className="space-y-2">
            {listQ.data?.map((entry) => (
              <WatchlistRow key={entry.characterId} entry={entry} />
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            <Trans>最新动态</Trans>
          </h2>
          {feedQ.isLoading && <LoadingBlock />}
          {feedQ.isError && (
            <ErrorBlock role="alert" message={(feedQ.error as Error).message} />
          )}
          {feedQ.data?.length === 0 && (
            <PanelEmpty message={t(msg`观察的词条暂无更新。`)} />
          )}
          <ul className="space-y-2">
            {feedQ.data?.map((item) => (
              <li
                key={
                  item.kind === "revision"
                    ? `r:${item.revision.id}`
                    : `t:${item.thread.id}`
                }
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] transition-colors hover:bg-[color:var(--surface-card-hover)]"
              >
                {item.kind === "revision" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill>
                        <Trans>编辑</Trans>
                      </StatusPill>
                      <Link
                        to="/character/$characterId"
                        params={{ characterId: item.characterId }}
                        className="font-medium hover:underline"
                      >
                        {item.title || item.characterId}
                      </Link>
                      <span className="ml-auto text-xs text-[color:var(--text-muted)]">
                        v{item.revision.version} ·{" "}
                        {formatDateTime(item.revision.createdAt)}
                      </span>
                    </div>
                    {item.revision.editSummary && (
                      <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                        {item.revision.editSummary}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill>
                        <Trans>讨论</Trans>
                      </StatusPill>
                      <Link
                        to="/character/$characterId"
                        params={{ characterId: item.characterId }}
                        className="font-medium hover:underline"
                      >
                        {item.title || item.characterId}
                      </Link>
                      <span className="ml-auto text-xs text-[color:var(--text-muted)]">
                        {item.thread.lastReplyAt
                          ? formatDateTime(item.thread.lastReplyAt)
                          : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-sm">{item.thread.title}</div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
