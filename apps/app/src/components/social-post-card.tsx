import type { ReactNode } from "react";
import { AvatarChip } from "./avatar-chip";

type SocialPostCardProps = {
  cardId?: string;
  authorName: string;
  authorAvatar?: string | null;
  meta?: ReactNode;
  headerActions?: ReactNode;
  body: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  secondary?: ReactNode;
  composer?: ReactNode;
};

export function SocialPostCard({
  cardId,
  authorName,
  authorAvatar,
  meta,
  headerActions,
  body,
  summary,
  actions,
  secondary,
  composer,
}: SocialPostCardProps) {
  return (
    <article
      id={cardId}
      className="overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] p-4 shadow-none"
    >
      <div className="flex items-start gap-3">
        <AvatarChip name={authorName} src={authorAvatar} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
            {authorName}
          </div>
          {meta ? (
            <div className="mt-0.5 text-[10px] text-[color:var(--text-muted)]">
              {meta}
            </div>
          ) : null}
        </div>
        {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
      </div>
      <div className="mt-3 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2.5 text-[12px] leading-[1.35rem] text-[color:var(--text-primary)]">
        {body}
      </div>
      {summary ? (
        <div className="mt-2.5 text-[11px] leading-[1.35rem] text-[color:var(--text-muted)]">
          {summary}
        </div>
      ) : null}
      {actions ? (
        <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div>
      ) : null}
      {secondary ? <div className="mt-2.5">{secondary}</div> : null}
      {composer ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-2">
          {composer}
        </div>
      ) : null}
    </article>
  );
}
