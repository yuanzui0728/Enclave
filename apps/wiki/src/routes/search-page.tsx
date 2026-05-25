import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { ErrorBlock, LoadingBlock, PanelEmpty, TagBadge } from "@yinjie/ui";
import { wikiApi } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";

// 一次请求取到后端上限（wiki-page.service.search 把 limit 钳到 100）。原来固定
// 20：命中数 > 20 的常见词（搜"的"命中 57）只显示前 20，且计数行"命中 N 条"直接
// 写展示数 = 谎报总数，用户既看不到其余命中也不知被截断。取满 100 后，对当前体量
// 的 wiki 任何查询都能一次展示全部命中；真撞到 100 上限时计数显示 "100+" 表明还有更多。
const SEARCH_LIMIT = 100;

export function SearchPage() {
  const t = translateRuntimeMessage;
  const { q } = useSearch({ from: "/search" }) as { q?: string };
  const query = (q ?? "").trim();
  const resultsQ = useQuery({
    queryKey: ["wiki", "search", query],
    queryFn: () => wikiApi.search(query, SEARCH_LIMIT),
    enabled: query.length > 0,
  });
  const hitCount = resultsQ.data?.length ?? 0;
  // 相关度展示归一化：后端 score 是字段权重之和（单词 2–24，多词 AND 会累加到
  // 更高，无固定上界），原样显示"相关度 24"对用户毫无刻度可言。结果已按 score
  // 降序，取榜首分作分母，把每条折算成相对最佳命中的 0–100% —— 榜首恒 100%，
  // 其余相对可读。百分号放进占位符表达式内（值为 "42%"），msgid 仍是 `相关度 {0}`，
  // en/ja/ko 译文不受影响。
  const maxScore = Math.max(1, ...(resultsQ.data?.map((r) => r.score) ?? [1]));

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
              : t(
                  msg`命中 ${hitCount >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : String(hitCount)} 条相关词条`,
                )
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
        <ErrorBlock role="alert" message={(resultsQ.error as Error).message} />
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
                  {/* 占位符保持单个数值表达式，msgid 仍是 `相关度 {0}`（命中现有 catalog
                      哈希）。早先试过把 "%" 放进模板串 → lingui 把它解析进消息变成
                      `相关度 {0}%`（新哈希 DgCNQ8 不在 catalog）→ 整条退化成显示哈希。
                      所以这里用纯归一化数值（0–100，榜首恒 100），不带 %。 */}
                  <Trans>相关度 {Math.round((r.score / maxScore) * 100)}</Trans>
                </span>
              </div>
              {r.bio && (
                <p className="mt-1 line-clamp-2 text-sm text-[color:var(--text-secondary)]">
                  {r.bio}
                </p>
              )}
              {/* 专长标签：搜专长域（如 finance / general）只命中 expertDomains
                  这种隐藏字段时，name/关系/简介里都没有该词，光看卡片用户不知道
                  为什么命中。把专长标签亮出来、并高亮与查询匹配的那个，命中就有
                  了可见依据。 */}
              {r.expertDomains?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.expertDomains.slice(0, 8).map((d, idx) => {
                    const matched =
                      query.length > 0 &&
                      d.toLowerCase().includes(query.toLowerCase());
                    return (
                      <TagBadge
                        key={`${d}-${idx}`}
                        tone={matched ? "accent" : "neutral"}
                        className="px-2 py-0.5 text-[10px]"
                      >
                        {d}
                      </TagBadge>
                    );
                  })}
                  {r.expertDomains.length > 8 && (
                    <span className="text-[10px] text-[color:var(--text-muted)]">
                      +{r.expertDomains.length - 8}
                    </span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
