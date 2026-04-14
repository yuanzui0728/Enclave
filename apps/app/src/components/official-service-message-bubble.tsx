import type { OfficialAccountServiceMessage } from "@yinjie/contracts";
import { ArrowRight, FileText } from "lucide-react";
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
  const articleCardActive =
    message.attachment?.kind === "article_card" &&
    message.attachment.articleId === activeArticleId;

  return (
    <div className="flex justify-start">
      <div
        className={
          isDesktop
            ? "max-w-[min(100%,34rem)] space-y-2"
            : "max-w-[min(100%,30rem)] space-y-1.5"
        }
      >
        {message.type === "text" && message.text ? (
          <div
            className={
              isDesktop
                ? "rounded-[22px] rounded-bl-[10px] border border-black/5 bg-white px-4 py-3 text-sm leading-7 text-[color:var(--text-primary)] shadow-none"
                : "rounded-[16px] rounded-bl-[9px] border border-black/5 bg-white px-3 py-2 text-[12px] leading-[1.35rem] text-[color:var(--text-primary)] shadow-none"
            }
          >
            {message.text}
          </div>
        ) : null}

        {message.attachment?.kind === "article_card" ? (
          <button
            type="button"
            onClick={() => onOpenArticle?.(message.attachment!.articleId)}
            className={
              isDesktop
                ? articleCardActive
                  ? "w-full rounded-[22px] border border-[rgba(7,193,96,0.18)] bg-white text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition"
                  : "w-full rounded-[22px] border border-black/6 bg-white text-left shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-[color:var(--border-faint)] hover:bg-[color:var(--surface-console)]"
                : articleCardActive
                  ? "w-full rounded-[16px] border border-[rgba(7,193,96,0.18)] bg-white text-left shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition"
                  : "w-full rounded-[16px] border border-black/6 bg-white text-left shadow-[0_6px_16px_rgba(15,23,42,0.04)] transition active:bg-[color:var(--surface-console)]"
            }
          >
            <div className={isDesktop ? "px-4 py-4" : "px-3 py-2.5"}>
              <div
                className={
                  isDesktop
                    ? "flex items-center gap-2 text-xs text-[color:var(--text-muted)]"
                    : "flex items-center gap-1 text-[10px] text-[color:var(--text-muted)]"
                }
              >
                <FileText
                  size={isDesktop ? 14 : 12}
                  className="text-[color:var(--text-dim)]"
                />
                <span>服务号文章</span>
              </div>
              <div
                className={
                  isDesktop
                    ? "mt-3 text-[15px] font-medium leading-6 text-[color:var(--text-primary)]"
                    : "mt-2 text-[13px] font-medium leading-[1.4rem] text-[color:var(--text-primary)]"
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
            <div
              className={
                isDesktop
                  ? "flex items-center justify-between border-t border-[color:var(--border-faint)] px-4 py-3 text-[12px] text-[color:var(--text-secondary)]"
                  : "flex items-center justify-between border-t border-[color:var(--border-faint)] px-3 py-2 text-[10px] text-[color:var(--text-secondary)]"
              }
            >
              <span>阅读全文</span>
              <ArrowRight
                size={isDesktop ? 14 : 12}
                className="shrink-0 text-[color:var(--text-dim)]"
              />
            </div>
          </button>
        ) : null}

        <div
          className={
            isDesktop
              ? "px-1 text-[11px] text-[color:var(--text-dim)]"
              : "px-1 text-[9px] text-[color:var(--text-dim)]"
          }
        >
          {formatMessageTimestamp(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
