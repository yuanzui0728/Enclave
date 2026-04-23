import { useState, type MouseEvent } from "react";
import type { OfficialAccountArticleDetail } from "@yinjie/contracts";
import { Copy, Share2, Star } from "lucide-react";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { InlineNoticeActionButton } from "./inline-notice-action-button";
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
  onOpenArticle?: (
    articleId: string,
    options?: {
      accountId?: string;
      title?: string;
    },
  ) => void;
  onToggleFavorite?: (article: OfficialAccountArticleDetail) => void;
}) {
  const [shareNotice, setShareNotice] = useState<{
    message: string;
    tone: "success" | "info";
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const isDesktopReader = !mobile && desktopSurface === "reader";
  const accountMeta = [
    article.account.accountType === "service" ? "服务号" : "订阅号",
    article.account.isVerified ? "已认证" : null,
  ].filter(Boolean);
  const accountMetaLabel = accountMeta.join(" · ");
  const publishedLabel = formatArticleDate(article.publishedAt, "full");

  const articlePath = `/official-accounts/articles/${article.id}`;
  const articleUrl =
    typeof window === "undefined"
      ? articlePath
      : `${window.location.origin}${articlePath}`;

  function retryCopyLink() {
    void handleCopyLink({
      retryLabel: "重试复制",
      onRetry: retryCopyLink,
    });
  }

  function retryShareArticle() {
    void handleShareArticle();
  }

  async function handleCopyLink(options?: {
    retryLabel?: string;
    onRetry?: () => void;
  }) {
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
        actionLabel: nativeMobileShareSupported ? options?.retryLabel : undefined,
        onAction: nativeMobileShareSupported ? options?.onRetry : undefined,
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
        actionLabel: undefined,
        onAction: undefined,
      });
    } catch {
      setShareNotice({
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制失败，请稍后重试。",
        tone: "info",
        actionLabel:
          options?.retryLabel ?? (nativeMobileShareSupported ? "重试分享" : "重试复制"),
        onAction:
          options?.onRetry ?? (nativeMobileShareSupported ? retryShareArticle : retryCopyLink),
      });
    }
  }

  async function handleShareArticle() {
    if (!nativeMobileShareSupported) {
      retryCopyLink();
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

    await handleCopyLink({
      retryLabel: "重试分享",
      onRetry: retryShareArticle,
    });
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
          ? "w-full bg-white px-4 py-4"
          : desktopSurface === "reader"
            ? "mx-auto w-full max-w-[720px] bg-white px-6 py-8 sm:px-8"
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
                ? "text-left text-[13px] font-medium text-[color:var(--text-primary)] transition hover:text-[color:var(--text-primary)]"
                : isDesktopReader
                  ? "text-left text-[14px] font-medium text-[color:var(--text-primary)] transition hover:text-[color:var(--text-primary)]"
                  : "text-left text-xs font-medium tracking-[0.12em] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
            }
          >
            {accountName ?? article.account.name}
          </button>
          {accountMetaLabel ? (
            <div
              className={cn(
                mobile
                  ? "mt-1 text-[11px] text-[color:var(--text-muted)]"
                  : "mt-1.5 text-xs text-[color:var(--text-muted)]",
                isDesktopReader ? "text-[12px]" : undefined,
              )}
            >
              {accountMetaLabel}
            </div>
          ) : null}
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
            ? "mt-3 text-[25px] font-semibold leading-[1.38] text-[color:var(--text-primary)]"
            : isDesktopReader
              ? "mt-4 text-[34px] font-semibold leading-[1.42] text-[color:var(--text-primary)]"
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
        <span className="font-medium text-[#576b95]">{article.authorName}</span>
        <span>{publishedLabel}</span>
        <span>{article.readCount} 阅读</span>
      </div>

      {isDesktopReader &&
      ((onToggleFavorite != null) || showShareAction) ? (
        <div className="mt-4 flex flex-wrap items-center gap-5 text-[13px] text-[color:var(--text-secondary)]">
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
              ? "mt-2.5 flex items-center justify-between gap-2.5 border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[12px] leading-5"
              : "mt-4 flex items-center justify-between gap-3 border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
            isDesktopReader
              ? "mt-4 rounded-[16px] bg-[#f6f8f6] text-[13px] leading-6"
              : undefined,
          )}
          tone={shareNotice.tone}
        >
          <span>{shareNotice.message}</span>
          {shareNotice.actionLabel && shareNotice.onAction ? (
            <InlineNoticeActionButton
              label={shareNotice.actionLabel}
              onClick={shareNotice.onAction}
            />
          ) : null}
        </InlineNotice>
      ) : null}
      {article.coverImage ? (
        <div
          className={
            mobile
              ? "mt-5 overflow-hidden rounded-[12px] bg-[color:var(--surface-console)]"
              : isDesktopReader
                ? "mt-7 overflow-hidden rounded-[10px] bg-[color:var(--surface-console)]"
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
      {article.summary.trim().length ? (
        <div
          className={
            mobile
              ? "mt-4 text-[14px] leading-7 text-[color:var(--text-secondary)]"
              : isDesktopReader
                ? "mt-6 text-[18px] leading-9 text-[color:var(--text-secondary)]"
                : "mt-6 text-[15px] leading-8 text-[color:var(--text-secondary)]"
          }
        >
          {article.summary}
        </div>
      ) : null}
      <div
        className={
          mobile
            ? "official-article-content mt-5 space-y-2.5 text-[15px] leading-8 text-[color:var(--text-primary)] [&_blockquote]:rounded-[14px] [&_blockquote]:border-l-4 [&_blockquote]:border-[rgba(15,23,42,0.08)] [&_blockquote]:bg-[rgba(15,23,42,0.035)] [&_blockquote]:px-3 [&_blockquote]:py-2 [&_h3]:mt-7 [&_h3]:text-[18px] [&_h3]:font-semibold [&_img]:rounded-[12px] [&_p]:my-0"
            : isDesktopReader
              ? "official-article-content mt-8 space-y-4 text-[17px] leading-[2] text-[color:var(--text-primary)] [&_blockquote]:rounded-[14px] [&_blockquote]:border-l-4 [&_blockquote]:border-[rgba(15,23,42,0.08)] [&_blockquote]:bg-[rgba(15,23,42,0.035)] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_h3]:mt-10 [&_h3]:text-[24px] [&_h3]:font-semibold [&_img]:rounded-[12px] [&_p]:my-0"
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
                ? "text-[14px] font-medium text-[color:var(--text-primary)]"
                : "text-sm font-medium text-[color:var(--text-primary)]",
              isDesktopReader ? "text-[15px]" : undefined,
            )}
          >
            更多内容
          </div>

          <div
            className={
              mobile
                ? "mt-2.5 divide-y divide-[color:var(--border-faint)]"
                : isDesktopReader
                  ? "mt-3 divide-y divide-[color:var(--border-faint)]"
                  : "mt-4 space-y-3"
            }
          >
            {article.relatedArticles.map((relatedArticle) => (
              <button
                key={relatedArticle.id}
                type="button"
                onClick={() =>
                  onOpenArticle?.(relatedArticle.id, {
                    accountId: relatedArticle.accountId,
                    title: relatedArticle.title,
                  })
                }
                className={
                  mobile
                    ? "flex w-full items-start justify-between gap-2.5 py-3 text-left transition active:bg-[rgba(15,23,42,0.03)]"
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
                    {formatArticleDate(relatedArticle.publishedAt, "short")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <footer
        className={
          mobile
            ? "mt-8 border-t border-[color:var(--border-faint)] pt-3 text-[11px] text-[color:var(--text-muted)]"
            : isDesktopReader
              ? "mt-10 border-t border-[color:var(--border-faint)] pt-4 text-[12px] text-[color:var(--text-muted)]"
              : "mt-8 text-xs text-[color:var(--text-muted)]"
        }
      >
        文章来源于 {accountName ?? article.account.name}
      </footer>
    </article>
  );
}

function formatArticleDate(
  value?: string | null,
  mode: "full" | "short" = "full",
) {
  if (!value) {
    return mode === "full" ? "刚刚" : "今天";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const date = new Date(timestamp);
  return new Intl.DateTimeFormat(
    "zh-CN",
    mode === "full"
      ? {
          year: "numeric",
          month: "numeric",
          day: "numeric",
        }
      : {
          month: "numeric",
          day: "numeric",
        },
  ).format(date);
}
