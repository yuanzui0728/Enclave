import { useState, type MouseEvent } from "react";
import type { OfficialAccountArticleDetail } from "@yinjie/contracts";
import { ArrowRight, Copy, Newspaper, Share2, Star } from "lucide-react";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { formatTimestamp } from "../lib/format";
import { openExternalUrl } from "../runtime/external-url";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";

export function OfficialArticleViewer({
  article,
  accountName,
  mobile = false,
  desktopSurface = "card",
  favorite = false,
  showShareAction = true,
  onOpenAccount,
  onOpenArticle,
  onToggleFavorite,
}: {
  article: OfficialAccountArticleDetail;
  accountName?: string;
  mobile?: boolean;
  desktopSurface?: "card" | "reader";
  favorite?: boolean;
  showShareAction?: boolean;
  onOpenAccount?: (accountId: string) => void;
  onOpenArticle?: (articleId: string) => void;
  onToggleFavorite?: (article: OfficialAccountArticleDetail) => void;
}) {
  const [shareNotice, setShareNotice] = useState<{
    message: string;
    tone: "success" | "info";
  } | null>(null);
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const isDesktopReader = !mobile && desktopSurface === "reader";
  const accountMeta = [
    article.account.accountType === "service" ? "服务号" : "订阅号",
    article.account.isVerified ? "已认证" : null,
  ].filter(Boolean);

  const articlePath = `/official-accounts/articles/${article.id}`;
  const articleUrl =
    typeof window === "undefined"
      ? articlePath
      : `${window.location.origin}${articlePath}`;

  async function handleCopyLink() {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setShareNotice({
        message: nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制链接。",
        tone: "info",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(articleUrl);
      setShareNotice({
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制文章链接。"
          : "文章链接已复制。",
        tone: "success",
      });
    } catch {
      setShareNotice({
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制失败，请稍后重试。",
        tone: "info",
      });
    }
  }

  async function handleShareArticle() {
    if (!nativeMobileShareSupported) {
      await handleCopyLink();
      return;
    }

    const shared = await shareWithNativeShell({
      title: article.title,
      text: `${accountName ?? article.account.name}\n${article.title}`,
      url: articleUrl,
    });

    if (shared) {
      setShareNotice({
        message: "已打开系统分享面板。",
        tone: "success",
      });
      return;
    }

    await handleCopyLink();
  }

  async function handleContentLinkClick(event: MouseEvent<HTMLDivElement>) {
    if (!nativeMobileShareSupported) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    const rawHref = anchor.getAttribute("href")?.trim();
    if (!rawHref || rawHref.startsWith("#")) {
      return;
    }

    if (!/^(https?:|mailto:|tel:)/i.test(rawHref)) {
      return;
    }

    event.preventDefault();
    const opened = await openExternalUrl(anchor.href || rawHref);
    if (opened) {
      return;
    }

    setShareNotice({
      message: "打开链接失败，请稍后重试。",
      tone: "info",
    });
  }

  return (
    <article
      className={
        mobile
          ? "w-full bg-white px-4 py-3"
          : desktopSurface === "reader"
            ? "mx-auto w-full max-w-[780px] bg-white px-6 py-8 sm:px-8"
            : "mx-auto w-full max-w-[760px] rounded-[28px] border border-[color:var(--border-faint)] bg-white px-5 py-6 shadow-[var(--shadow-section)] sm:px-8"
      }
    >
      <div
        className={cn(
          mobile
            ? "flex flex-wrap items-start justify-between gap-2"
            : "flex flex-wrap items-start justify-between gap-3",
          isDesktopReader ? "justify-start" : undefined,
        )}
      >
        <div>
          <button
            type="button"
            onClick={() => onOpenAccount?.(article.account.id)}
            className={
              mobile
                ? "text-left text-[10px] font-medium tracking-[0.06em] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
                : isDesktopReader
                  ? "text-left text-[13px] font-medium tracking-[0.08em] text-[color:var(--text-secondary)] transition hover:text-[color:var(--text-primary)]"
                  : "text-left text-xs font-medium tracking-[0.12em] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
            }
          >
            {accountName ?? article.account.name}
          </button>
          <div
            className={cn(
              mobile
                ? "mt-1 flex flex-wrap items-center gap-1 text-[10px] text-[color:var(--text-muted)]"
                : "mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-muted)]",
              isDesktopReader ? "mt-1.5 gap-1.5 text-[12px]" : undefined,
            )}
          >
            {accountMeta.map((item) => (
              <span
                key={item}
                className={
                  mobile
                    ? "rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-1.5 py-0.5 text-[color:var(--brand-primary)]"
                    : isDesktopReader
                      ? "rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2 py-0.5 text-[11px] text-[color:var(--text-secondary)]"
                      : "rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-2.5 py-1 text-[color:var(--brand-primary)]"
                }
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <div
          className={cn(
            mobile
              ? "flex flex-wrap items-center gap-1.5"
              : "flex flex-wrap items-center gap-2",
            isDesktopReader ? "hidden" : undefined,
          )}
        >
          {onToggleFavorite ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onToggleFavorite(article)}
              className={mobile ? "h-7 rounded-[10px] px-2.5 text-[12px]" : "rounded-xl"}
            >
              <Star size={14} className={favorite ? "fill-current" : ""} />
              {favorite ? "已收藏" : "收藏"}
            </Button>
          ) : null}
          {showShareAction ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleShareArticle()}
              className={mobile ? "h-7 rounded-[10px] px-2.5 text-[12px]" : "rounded-xl"}
            >
              {nativeMobileShareSupported ? (
                <Share2 size={14} />
              ) : (
                <Copy size={14} />
              )}
              {nativeMobileShareSupported ? "系统分享" : "复制链接"}
            </Button>
          ) : null}
        </div>
      </div>
      <h1
        className={
          mobile
            ? "mt-2.5 text-[22px] font-semibold leading-[1.35] text-[color:var(--text-primary)]"
            : isDesktopReader
              ? "mt-4 text-[32px] font-semibold leading-[1.42] text-[color:var(--text-primary)]"
              : "mt-3 text-[28px] font-semibold leading-[1.35] text-[color:var(--text-primary)]"
        }
      >
        {article.title}
      </h1>
      <div
        className={cn(
          mobile
            ? "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--text-muted)]"
            : "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[color:var(--text-muted)]",
          isDesktopReader ? "mt-3 gap-x-2.5 text-[13px]" : undefined,
        )}
      >
        <span>{article.authorName}</span>
        <span>{formatTimestamp(article.publishedAt)}</span>
        <span>{article.readCount} 阅读</span>
      </div>

      {isDesktopReader &&
      ((onToggleFavorite != null) || showShareAction) ? (
        <div className="mt-5 flex flex-wrap items-center gap-5 border-y border-[color:var(--border-faint)] py-3 text-[13px] text-[color:var(--text-secondary)]">
          {onToggleFavorite ? (
            <button
              type="button"
              onClick={() => onToggleFavorite(article)}
              className={cn(
                "inline-flex items-center gap-2 transition hover:text-[color:var(--text-primary)]",
                favorite ? "text-[color:var(--text-primary)]" : undefined,
              )}
            >
              <Star size={15} className={favorite ? "fill-current" : ""} />
              <span>{favorite ? "已收藏" : "收藏"}</span>
            </button>
          ) : null}
          {showShareAction ? (
            <button
              type="button"
              onClick={() => void handleShareArticle()}
              className="inline-flex items-center gap-2 transition hover:text-[color:var(--text-primary)]"
            >
              {nativeMobileShareSupported ? (
                <Share2 size={15} />
              ) : (
                <Copy size={15} />
              )}
              <span>{nativeMobileShareSupported ? "分享" : "复制链接"}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {shareNotice ? (
        <InlineNotice
          className={cn(
            mobile
              ? "mt-2.5 border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[12px] leading-5"
              : "mt-4 border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
            isDesktopReader
              ? "mt-4 rounded-[16px] bg-[#f6f8f6] text-[13px] leading-6"
              : undefined,
          )}
          tone={shareNotice.tone}
        >
          {shareNotice.message}
        </InlineNotice>
      ) : null}
      {article.coverImage ? (
        <div
          className={
            mobile
              ? "mt-4 overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
              : isDesktopReader
                ? "mt-7 overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
                : "mt-6 overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
          }
        >
          <img
            src={article.coverImage}
            alt={article.title}
            className={
              mobile
                ? "h-auto max-h-[280px] w-full object-cover"
                : isDesktopReader
                  ? "h-auto max-h-[440px] w-full object-cover"
                  : "h-auto max-h-[420px] w-full object-cover"
            }
          />
        </div>
      ) : null}
      <div
        className={
          mobile
            ? "mt-3.5 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2 text-[12px] leading-[1.35rem] text-[color:var(--text-secondary)]"
            : isDesktopReader
              ? "mt-6 border-l-[3px] border-[rgba(7,193,96,0.18)] bg-[color:var(--surface-console)] px-4 py-3 text-[14px] leading-7 text-[color:var(--text-secondary)]"
              : "mt-6 rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3 text-sm leading-7 text-[color:var(--text-secondary)]"
        }
      >
        {article.summary}
      </div>
      <div
        className={
          mobile
            ? "official-article-content mt-4 space-y-2.5 text-[13px] leading-6 text-[color:var(--text-primary)] [&_blockquote]:rounded-[14px] [&_blockquote]:border-l-4 [&_blockquote]:border-[rgba(7,193,96,0.2)] [&_blockquote]:bg-[rgba(7,193,96,0.07)] [&_blockquote]:px-3 [&_blockquote]:py-2 [&_h3]:mt-6 [&_h3]:text-[18px] [&_h3]:font-semibold [&_img]:rounded-[14px] [&_p]:my-0"
            : isDesktopReader
              ? "official-article-content mt-8 space-y-4 text-[16px] leading-[2] text-[color:var(--text-primary)] [&_blockquote]:rounded-[16px] [&_blockquote]:border-l-4 [&_blockquote]:border-[rgba(15,23,42,0.08)] [&_blockquote]:bg-[color:var(--surface-console)] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_h3]:mt-9 [&_h3]:text-[22px] [&_h3]:font-semibold [&_img]:rounded-[14px] [&_p]:my-0"
              : "official-article-content mt-7 space-y-4 text-[15px] leading-8 text-[color:var(--text-primary)] [&_blockquote]:rounded-[20px] [&_blockquote]:border-l-4 [&_blockquote]:border-[rgba(7,193,96,0.2)] [&_blockquote]:bg-[rgba(7,193,96,0.07)] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_img]:rounded-[20px] [&_p]:my-0"
        }
        onClick={(event) => void handleContentLinkClick(event)}
        dangerouslySetInnerHTML={{ __html: article.contentHtml }}
      />

      {article.relatedArticles.length ? (
        <section
          className={
            mobile
              ? "mt-6 border-t border-[color:var(--border-faint)] pt-3.5"
              : isDesktopReader
                ? "mt-12 border-t border-[color:var(--border-faint)] pt-5"
                : "mt-10 rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5"
          }
        >
          <div
            className={cn(
              mobile
                ? "flex items-center gap-1.5 text-[14px] font-medium text-[color:var(--text-primary)]"
                : "flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]",
              isDesktopReader ? "text-[15px]" : undefined,
            )}
          >
            <Newspaper
              size={mobile ? 15 : 16}
              className="text-[color:var(--brand-primary)]"
            />
            <span>该号更多内容</span>
          </div>

          <div
            className={
              mobile
                ? "mt-2.5 space-y-2"
                : isDesktopReader
                  ? "mt-3 divide-y divide-[color:var(--border-faint)]"
                  : "mt-4 space-y-3"
            }
          >
            {article.relatedArticles.map((relatedArticle) => (
              <button
                key={relatedArticle.id}
                type="button"
                onClick={() => onOpenArticle?.(relatedArticle.id)}
                className={
                  mobile
                    ? "flex w-full items-start justify-between gap-2.5 rounded-[13px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2.5 text-left transition hover:bg-white"
                    : isDesktopReader
                      ? "flex w-full items-start justify-between gap-4 py-4 text-left transition hover:bg-[rgba(15,23,42,0.02)]"
                      : "flex w-full items-start justify-between gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-3 text-left transition hover:bg-[color:var(--surface-console)]"
                }
              >
                <div className={cn("min-w-0 flex-1", isDesktopReader ? "pr-4" : undefined)}>
                  <div
                    className={
                      mobile
                        ? "text-[13px] font-medium leading-5 text-[color:var(--text-primary)]"
                        : isDesktopReader
                          ? "text-[15px] font-medium leading-6 text-[color:var(--text-primary)]"
                          : "text-sm font-medium leading-6 text-[color:var(--text-primary)]"
                    }
                  >
                    {relatedArticle.title}
                  </div>
                  <div
                    className={
                      mobile
                        ? "mt-1 line-clamp-2 text-[10px] leading-[1.125rem] text-[color:var(--text-secondary)]"
                        : isDesktopReader
                          ? "mt-1.5 line-clamp-2 text-[12px] leading-5 text-[color:var(--text-secondary)]"
                          : "mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]"
                    }
                  >
                    {relatedArticle.summary}
                  </div>
                  <div
                    className={
                      mobile
                        ? "mt-1 text-[10px] text-[color:var(--text-muted)]"
                        : isDesktopReader
                          ? "mt-1.5 text-[11px] text-[color:var(--text-muted)]"
                          : "mt-2 text-[11px] text-[color:var(--text-muted)]"
                    }
                  >
                    {formatTimestamp(relatedArticle.publishedAt)}
                  </div>
                </div>
                <ArrowRight
                  size={mobile ? 14 : 16}
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
