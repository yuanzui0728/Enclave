import type { ReactNode } from "react";
import { AvatarChip } from "./avatar-chip";

type SocialPostCardProps = {
  authorName: string;
  authorAvatar?: string | null;
  meta?: ReactNode;
  body: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  secondary?: ReactNode;
  composer?: ReactNode;
};

export function SocialPostCard({
  authorName,
  authorAvatar,
  meta,
  body,
  summary,
  actions,
  secondary,
  composer,
}: SocialPostCardProps) {
  return (
    <article className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] p-4">
      <div className="flex items-center gap-3">
        <AvatarChip name={authorName} src={authorAvatar} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white">{authorName}</div>
          {meta ? <div className="text-xs text-[color:var(--text-muted)]">{meta}</div> : null}
        </div>
      </div>
      <div className="mt-4 text-sm leading-7 text-[color:var(--text-primary)]">{body}</div>
      {summary ? <div className="mt-4 text-xs text-[color:var(--text-muted)]">{summary}</div> : null}
      {actions ? <div className="mt-4 flex gap-2">{actions}</div> : null}
      {secondary ? <div className="mt-4">{secondary}</div> : null}
      {composer ? <div className="mt-3 flex items-center gap-2">{composer}</div> : null}
    </article>
  );
}
