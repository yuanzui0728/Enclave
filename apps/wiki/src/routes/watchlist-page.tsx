import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Card,
  ErrorBlock,
  LoadingBlock,
  PanelEmpty,
  StatusPill,
} from "@yinjie/ui";
import { useAuth } from "../lib/use-auth";
import { wikiApi } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { formatDate, formatDateTime } from "../lib/format";

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
            <ErrorBlock message={(listQ.error as Error).message} />
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
              <li
                key={entry.characterId}
                className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] transition-colors hover:bg-[color:var(--surface-card-hover)]"
              >
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
                    <Trans>
                      自 {formatDate(entry.addedAt)}
                    </Trans>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            <Trans>最新动态</Trans>
          </h2>
          {feedQ.isLoading && <LoadingBlock />}
          {feedQ.isError && (
            <ErrorBlock message={(feedQ.error as Error).message} />
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
                        {item.title ||
                          item.revision.contentSnapshot?.name ||
                          item.characterId}
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
