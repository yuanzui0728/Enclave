import { useState } from "react";
import type { OfficialAccountArticleDetail } from "@yinjie/contracts";
import { ArrowRight, Copy, Newspaper, Star } from "lucide-react";
import { Button, InlineNotice } from "@yinjie/ui";
import { formatTimestamp } from "../lib/format";

export function OfficialArticleViewer({
  article,
  accountName,
  favorite = false,
  onOpenAccount,
  onOpenArticle,
  onToggleFavorite,
}: {
  article: OfficialAccountArticleDetail;
  accountName?: string;
  favorite?: boolean;
  onOpenAccount?: (accountId: string) => void;
  onOpenArticle?: (articleId: string) => void;
  onToggleFavorite?: (article: OfficialAccountArticleDetail) => void;
}) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  async function handleCopyLink() {
    const articlePath = `/official-accounts/articles/${article.id}`;
    const articleUrl =
      typeof window === "undefined"
        ? articlePath
        : `${window.location.origin}${articlePath}`;

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setCopyNotice("当前环境暂不支持复制链接。");
      return;
    }

    try {
      await navigator.clipboard.writeText(articleUrl);
      setCopyNotice("文章链接已复制。");
    } catch {
      setCopyNotice("复制失败，请稍后重试。");
    }
  }

  return (
    <article className="mx-auto w-full max-w-[760px] rounded-[28px] border border-[color:var(--border-faint)] bg-white px-5 py-6 shadow-[var(--shadow-section)] sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => onOpenAccount?.(article.account.id)}
            className="text-left text-xs font-medium tracking-[0.12em] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
          >
            {accountName ?? article.account.name}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-muted)]">
            <span className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[color:var(--brand-primary)]">
              {article.account.accountType === "service" ? "服务号" : "订阅号"}
            </span>
            {article.account.isVerified ? (
              <span className="rounded-full border border-[#d7e5fb] bg-[#f3f7ff] px-2.5 py-1 text-[#315b9a]">
                已认证
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onToggleFavorite ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onToggleFavorite(article)}
              className="rounded-xl"
            >
              <Star size={14} className={favorite ? "fill-current" : ""} />
              {favorite ? "已收藏" : "收藏"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleCopyLink()}
            className="rounded-xl"
          >
            <Copy size={14} />
            复制链接
          </Button>
        </div>
      </div>
      <h1 className="mt-3 text-[28px] font-semibold leading-[1.35] text-[color:var(--text-primary)]">
        {article.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--text-muted)]">
        <span>{article.authorName}</span>
        <span>{formatTimestamp(article.publishedAt)}</span>
        <span>{article.readCount} 阅读</span>
      </div>
      {copyNotice ? (
        <InlineNotice
          className="mt-4 border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
          tone={copyNotice.includes("已复制") ? "success" : "info"}
        >
          {copyNotice}
        </InlineNotice>
      ) : null}
      {article.coverImage ? (
        <div className="mt-6 overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]">
          <img
            src={article.coverImage}
            alt={article.title}
            className="h-auto max-h-[420px] w-full object-cover"
          />
        </div>
      ) : null}
      <div className="mt-6 rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3 text-sm leading-7 text-[color:var(--text-secondary)]">
        {article.summary}
      </div>
      <div
        className="official-article-content mt-7 space-y-4 text-[15px] leading-8 text-[color:var(--text-primary)] [&_blockquote]:rounded-[20px] [&_blockquote]:border-l-4 [&_blockquote]:border-[rgba(7,193,96,0.2)] [&_blockquote]:bg-[rgba(7,193,96,0.07)] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_img]:rounded-[20px] [&_p]:my-0"
        dangerouslySetInnerHTML={{ __html: article.contentHtml }}
      />

      {article.relatedArticles.length ? (
        <section className="mt-10 rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
            <Newspaper size={16} className="text-[color:var(--brand-primary)]" />
            <span>该号更多内容</span>
          </div>

          <div className="mt-4 space-y-3">
            {article.relatedArticles.map((relatedArticle) => (
              <button
                key={relatedArticle.id}
                type="button"
                onClick={() => onOpenArticle?.(relatedArticle.id)}
                className="flex w-full items-start justify-between gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-3 text-left transition hover:bg-[color:var(--surface-console)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-6 text-[color:var(--text-primary)]">
                    {relatedArticle.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                    {relatedArticle.summary}
                  </div>
                  <div className="mt-2 text-[11px] text-[color:var(--text-muted)]">
                    {formatTimestamp(relatedArticle.publishedAt)}
                  </div>
                </div>
                <ArrowRight
                  size={16}
                  className="mt-1 shrink-0 text-[color:var(--text-dim)]"
                />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
