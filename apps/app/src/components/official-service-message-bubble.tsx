import type { OfficialAccountServiceMessage } from "@yinjie/contracts";
import { FileText } from "lucide-react";
import { formatMessageTimestamp } from "../lib/format";

export function OfficialServiceMessageBubble({
  message,
  onOpenArticle,
}: {
  message: OfficialAccountServiceMessage;
  onOpenArticle?: (articleId: string) => void;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[min(100%,34rem)] space-y-2">
        {message.type === "text" && message.text ? (
          <div className="rounded-[22px] rounded-bl-[10px] border border-[rgba(249,115,22,0.12)] bg-white px-4 py-3 text-sm leading-7 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]">
            {message.text}
          </div>
        ) : null}

        {message.attachment?.kind === "article_card" ? (
          <button
            type="button"
            onClick={() => onOpenArticle?.(message.attachment!.articleId)}
            className="w-full rounded-[22px] border border-[rgba(249,115,22,0.12)] bg-[rgba(255,250,243,0.95)] p-4 text-left shadow-[var(--shadow-soft)] transition hover:bg-white"
          >
            <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
              <FileText size={14} />
              <span>文章卡片</span>
            </div>
            <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
              {message.attachment.title}
            </div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
              {message.attachment.summary}
            </div>
          </button>
        ) : null}

        <div className="px-1 text-[11px] text-[color:var(--text-dim)]">
          {formatMessageTimestamp(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
