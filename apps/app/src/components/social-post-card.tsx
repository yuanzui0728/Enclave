import type { ReactNode } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AvatarChip } from "./avatar-chip";

const t = translateRuntimeMessage;

type SocialPostCardProps = {
  cardId?: string;
  authorName: string;
  authorAvatar?: string | null;
  authorActionAriaLabel?: string;
  meta?: ReactNode;
  headerActions?: ReactNode;
  body: ReactNode;
  summary?: ReactNode;
  actions?: ReactNode;
  secondary?: ReactNode;
  composer?: ReactNode;
  onAuthorClick?: () => void;
};

export function SocialPostCard({
  cardId,
  authorName,
  authorAvatar,
  authorActionAriaLabel,
  meta,
  headerActions,
  body,
  summary,
  actions,
  secondary,
  composer,
  onAuthorClick,
}: SocialPostCardProps) {
  const authorActionLabel =
    authorActionAriaLabel ?? t(msg`查看 ${authorName} 的详情`);

  return (
    <article
      id={cardId}
      // scroll-mt 给 hash 跳转用：discover-feed-page useEffect 走
      // scrollIntoView({block:"start"})，但移动端顶上有带 subtitle 的 sticky
      // TabPageTopBar (~80px)，对齐到 y=0 会把作者头/meta 藏在顶栏底下。
      // 给 article 加 scroll-margin-top 让浏览器把这点高度还回来。
      className="scroll-mt-[88px] overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] p-4 shadow-none"
    >
      <div className="flex items-start gap-3">
        {onAuthorClick ? (
          <button
            type="button"
            onClick={onAuthorClick}
            className="shrink-0 rounded-[18px] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(7,193,96,0.34)] focus-visible:ring-offset-2"
            aria-label={authorActionLabel}
          >
            <AvatarChip name={authorName} src={authorAvatar} />
          </button>
        ) : (
          <AvatarChip name={authorName} src={authorAvatar} />
        )}
        <div className="min-w-0 flex-1">
          {onAuthorClick ? (
            <button
              type="button"
              onClick={onAuthorClick}
              className="max-w-full truncate text-left text-[13px] font-medium text-[color:var(--text-primary)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(7,193,96,0.34)] focus-visible:ring-offset-2"
              aria-label={authorActionLabel}
            >
              {authorName}
            </button>
          ) : (
            // 走查 R4：character 分支 (onAuthorClick 路径) 已经 truncate，user
            // 分支（世界主人 / 不可点头像）缺这条，碰上长 username（"用户_aabbccddeeff..."
            // 之类的 wiki 走查账号 / Android 输入法插入的特殊字符）会顶破 flex
            // 行把 headerActions 推到下一行，meta 也跟着错位。补 truncate 与
            // 上面 button 分支对齐，长名一律单行省略号。
            <div
              className="truncate text-[13px] font-medium text-[color:var(--text-primary)]"
              title={authorName}
            >
              {authorName}
            </div>
          )}
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
