import type { OfficialAccountServiceMessage } from "@yinjie/contracts";
import { ArrowRight, FileText } from "lucide-react";
import { cn } from "@yinjie/ui";
import { formatMessageTimestamp } from "../lib/format";

export function OfficialServiceMessageBubble({
  message,
  variant = "mobile",
  activeArticleId,
  onOpenArticle,
}: {
  message: OfficialAccountServiceMessage;
  variant?: "mobile" | "desktop";
  activeArticleId?: string | null;
  onOpenArticle?: (articleId: string) => void;
}) {
  const isDesktop = variant === "desktop";
  const hasText = message.type === "text" && Boolean(message.text);
  const articleCardActive =
    message.attachment?.kind === "article_card" &&
    message.attachment.articleId === activeArticleId;
  const hasArticleCard = message.attachment?.kind === "article_card";

  return (
    <div className="flex justify-center">
      <div
        className={
          isDesktop
            ? "w-full max-w-[34rem]"
            : "w-full max-w-[24.5rem]"
        }
      >
        <div className={isDesktop ? "mb-2.5 flex justify-center" : "mb-2 flex justify-center"}>
          <div
            className={
              isDesktop
                ? "rounded-full bg-[rgba(15,23,42,0.06)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)]"
                : "rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[9px] text-[color:var(--text-secondary)]"
            }
          >
            {formatMessageTimestamp(message.createdAt)}
          </div>
        </div>

        <div
          className={cn(
            "overflow-hidden border bg-white text-left",
            isDesktop
              ? "rounded-[20px] shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
              : "rounded-[16px] shadow-[0_6px_18px_rgba(15,23,42,0.04)]",
            articleCardActive
              ? "border-[rgba(7,193,96,0.18)]"
              : "border-black/6",
          )}
        >
          {hasText ? (
            <div
              className={
                isDesktop
                  ? "px-4 py-3.5 text-[14px] leading-7 text-[color:var(--text-primary)]"
                  : "px-3 py-2.5 text-[12px] leading-[1.45rem] text-[color:var(--text-primary)]"
              }
            >
              {message.text}
            </div>
          ) : null}

          {hasArticleCard ? (
            <>
              {hasText ? (
                <div
                  className={
                    isDesktop
                      ? "mx-4 border-t border-[color:var(--border-faint)]"
                      : "mx-3 border-t border-[color:var(--border-faint)]"
                  }
                />
              ) : null}
              <button
                type="button"
                onClick={() => onOpenArticle?.(message.attachment!.articleId)}
                className={cn(
                  "block w-full text-left transition",
                  isDesktop
                    ? "hover:bg-[rgba(15,23,42,0.02)]"
                    : "active:bg-[rgba(15,23,42,0.03)]",
                )}
              >
                <div className={isDesktop ? "px-4 py-4" : "px-3 py-3"}>
                  <div
                    className={
                      isDesktop
                        ? "flex items-center gap-2 text-xs text-[color:var(--text-muted)]"
                        : "flex items-center gap-1.5 text-[10px] text-[color:var(--text-muted)]"
                    }
                  >
                    <FileText
                      size={isDesktop ? 14 : 12}
                      className="text-[color:var(--text-dim)]"
                    />
                    <span>服务号文章</span>
                  </div>
                  <div
                    className={cn(
                      "mt-3 flex items-start gap-3",
                      isDesktop ? "gap-3.5" : "gap-2.5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          isDesktop
                            ? "text-[15px] font-medium leading-6 text-[color:var(--text-primary)]"
                            : "text-[13px] font-medium leading-[1.4rem] text-[color:var(--text-primary)]"
                        }
                      >
                        {message.attachment.title}
                      </div>
                      <div
                        className={
                          isDesktop
                            ? "mt-1.5 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]"
                            : "mt-1 line-clamp-2 text-[10px] leading-[1.125rem] text-[color:var(--text-secondary)]"
                        }
                      >
                        {message.attachment.summary}
                      </div>
                    </div>
                    {message.attachment.coverImage ? (
                      <img
                        src={message.attachment.coverImage}
                        alt={message.attachment.title}
                        className={
                          isDesktop
                            ? "h-20 w-20 shrink-0 rounded-[12px] border border-[color:var(--border-faint)] object-cover"
                            : "h-[3.75rem] w-[3.75rem] shrink-0 rounded-[10px] border border-[color:var(--border-faint)] object-cover"
                        }
                      />
                    ) : (
                      <div
                        className={
                          isDesktop
                            ? "flex h-20 w-20 shrink-0 items-center justify-center rounded-[12px] bg-[color:var(--surface-console)] text-[color:var(--text-dim)]"
                            : "flex h-[3.75rem] w-[3.75rem] shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--surface-console)] text-[color:var(--text-dim)]"
                        }
                      >
                        <FileText size={isDesktop ? 20 : 18} />
                      </div>
                    )}
                  </div>
                </div>
                <div
                  className={
                    isDesktop
                      ? "flex items-center justify-between border-t border-[color:var(--border-faint)] px-4 py-3 text-[12px] text-[color:var(--text-secondary)]"
                      : "flex items-center justify-between border-t border-[color:var(--border-faint)] px-3 py-2.5 text-[10px] text-[color:var(--text-secondary)]"
                  }
                >
                  <span>阅读全文</span>
                  <ArrowRight
                    size={isDesktop ? 14 : 12}
                    className="shrink-0 text-[color:var(--text-dim)]"
                  />
                </div>
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
