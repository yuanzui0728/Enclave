import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { ErrorBlock, LoadingBlock, PanelEmpty } from "@yinjie/ui";
import { wikiApi } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";

export function SearchPage() {
  const t = translateRuntimeMessage;
  const { q } = useSearch({ from: "/search" }) as { q?: string };
  const query = (q ?? "").trim();
  const resultsQ = useQuery({
    queryKey: ["wiki", "search", query],
    queryFn: () => wikiApi.search(query),
    enabled: query.length > 0,
  });

  return (
    <PageShell
      eyebrow={t(msg`搜索`)}
      title={query ? t(msg`搜索"${query}"`) : t(msg`搜索词条`)}
      description={
        query
          ? resultsQ.isLoading
            ? t(msg`搜索中...`)
            : resultsQ.isError
              ? t(msg`搜索请求失败，请稍后重试。`)
              : t(msg`命中 ${resultsQ.data?.length ?? 0} 条相关词条`)
          : t(
              msg`在顶栏的搜索框输入关键字，按回车进行搜索。系统会按词条名、关系、简介与画像字段全文检索。`,
            )
      }
    >
      {!query && (
        <PanelEmpty message={t(msg`请在顶栏输入关键字开始搜索。`)} />
      )}
      {resultsQ.isLoading && <LoadingBlock />}
      {resultsQ.isError && (
        <ErrorBlock message={(resultsQ.error as Error).message} />
      )}
      {query && resultsQ.data?.length === 0 && (
        <PanelEmpty
          message={t(msg`没有匹配的词条。换个关键字试试，或检查是否有拼写错误。`)}
        />
      )}
      {resultsQ.data && resultsQ.data.length > 0 && (
        <ul className="space-y-2">
          {resultsQ.data.map((r) => (
            <li
              key={r.characterId}
              className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-sm shadow-[var(--shadow-soft)] transition-colors hover:bg-[color:var(--surface-card-hover)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/character/$characterId"
                  params={{ characterId: r.characterId }}
                  className="font-medium text-[color:var(--text-primary)] hover:underline"
                >
                  {r.name || r.characterId}
                </Link>
                {r.relationship && (
                  <span className="text-xs text-[color:var(--text-muted)]">
                    {r.relationship}
                  </span>
                )}
                <span className="ml-auto whitespace-nowrap text-xs text-[color:var(--text-muted)]">
                  <Trans>相关度 {Math.round(r.score * 100) / 100}</Trans>
                </span>
              </div>
              {r.bio && (
                <p className="mt-1 line-clamp-2 text-sm text-[color:var(--text-secondary)]">
                  {r.bio}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
