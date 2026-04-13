import { useEffect, useRef } from "react";
import { type Moment } from "@yinjie/contracts";
import { Button, cn } from "@yinjie/ui";
import { Bot, PenSquare, UserRound } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { formatTimestamp } from "../../../lib/format";
import { DesktopMomentDetailPanel } from "./desktop-moment-detail-panel";

export type DesktopMomentAuthorSummary = {
  authorAvatar: string;
  authorId: string;
  authorName: string;
  authorType: "user" | "character";
  count: number;
  latestPostedAt: string;
};

export type DesktopMomentsSidebarMode = "summary" | "author" | "detail";

type DesktopMomentsSidebarProps = {
  activeAuthorId: string | null;
  activeAuthorSummary: DesktopMomentAuthorSummary | null;
  authorMoments: Moment[];
  authorSummaries: DesktopMomentAuthorSummary[];
  commentDrafts: Record<string, string>;
  commentPendingMomentId: string | null;
  likePendingMomentId: string | null;
  mode: DesktopMomentsSidebarMode;
  moments: Moment[];
  ownerAvatar?: string | null;
  ownerId?: string | null;
  ownerUsername?: string | null;
  selectedMoment: Moment | null;
  isMomentFavorite: (momentId: string) => boolean;
  onClearAuthor: () => void;
  onCloseDetail: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onLike: (momentId: string) => void;
  onToggleFavorite: (momentId: string) => void;
  onOpenCompose: () => void;
  onSelectAuthor: (authorId: string) => void;
  onSelectMoment: (momentId: string) => void;
};

export function DesktopMomentsSidebar({
  activeAuthorId,
  activeAuthorSummary,
  authorMoments,
  authorSummaries,
  commentDrafts,
  commentPendingMomentId,
  likePendingMomentId,
  mode,
  moments,
  ownerAvatar,
  ownerId,
  ownerUsername,
  selectedMoment,
  isMomentFavorite,
  onClearAuthor,
  onCloseDetail,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onToggleFavorite,
  onOpenCompose,
  onSelectAuthor,
  onSelectMoment,
}: DesktopMomentsSidebarProps) {
  const authorScrollViewportRef = useRef<HTMLDivElement | null>(null);
  const selectedSidebarItemClassName =
    "border-[rgba(7,193,96,0.12)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_8px_18px_rgba(15,23,42,0.04)]";

  useEffect(() => {
    if (mode === "author") {
      authorScrollViewportRef.current?.scrollTo({ top: 0 });
    }
  }, [activeAuthorSummary?.authorId, mode]);

  if (mode === "detail" && selectedMoment) {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
        <DesktopMomentDetailPanel
          commentDraft={commentDrafts[selectedMoment.id] ?? ""}
          commentLoading={commentPendingMomentId === selectedMoment.id}
          likeLoading={likePendingMomentId === selectedMoment.id}
          moment={selectedMoment}
          ownerId={ownerId}
          favorite={isMomentFavorite(selectedMoment.id)}
          onClose={onCloseDetail}
          onCommentChange={(value) => onCommentChange(selectedMoment.id, value)}
          onCommentSubmit={() => onCommentSubmit(selectedMoment.id)}
          onLike={() => onLike(selectedMoment.id)}
          onToggleFavorite={() => onToggleFavorite(selectedMoment.id)}
          onSelectAuthor={() => onSelectAuthor(selectedMoment.authorId)}
        />
      </aside>
    );
  }

  if (mode === "author" && activeAuthorSummary) {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-5 py-4 backdrop-blur-xl">
            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
              作者时间线
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
              {activeAuthorSummary.authorName} 的朋友圈
            </div>
            <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
              当前先用连续时间线替代桌面相册页。
            </div>
          </div>

          <div
            ref={authorScrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-5 py-5"
          >
            <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
              <div className="flex items-center gap-4">
                <AvatarChip
                  name={activeAuthorSummary.authorName}
                  src={activeAuthorSummary.authorAvatar}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-base font-semibold text-[color:var(--text-primary)]">
                      {activeAuthorSummary.authorName}
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium",
                        activeAuthorSummary.authorType === "character"
                          ? "border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.07)] text-[color:var(--brand-primary)]"
                          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
                      )}
                    >
                      {activeAuthorSummary.authorType === "character" ? (
                        <Bot size={11} />
                      ) : (
                        <UserRound size={11} />
                      )}
                      {activeAuthorSummary.authorType === "character"
                        ? "角色"
                        : "我"}
                    </span>
                  </div>
                  <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                    最近发布于{" "}
                    {formatTimestamp(activeAuthorSummary.latestPostedAt)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <SidebarMetric
                  label="动态"
                  value={String(activeAuthorSummary.count)}
                />
                <SidebarMetric
                  label="评论"
                  value={String(
                    authorMoments.reduce(
                      (total, moment) => total + moment.commentCount,
                      0,
                    ),
                  )}
                />
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={onClearAuthor}
                >
                  查看全部
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={onOpenCompose}
                >
                  <PenSquare size={15} />
                  发朋友圈
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
              <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                最近动态
              </div>
              <div className="mt-3 space-y-2.5">
                {authorMoments.slice(0, 5).map((moment) => (
                  <button
                    key={moment.id}
                    type="button"
                    onClick={() => onSelectMoment(moment.id)}
                    className={cn(
                      "w-full rounded-[14px] border px-3.5 py-3 text-left transition-[background-color,border-color]",
                      selectedMoment?.id === moment.id
                        ? selectedSidebarItemClassName
                        : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
                    )}
                  >
                    <div className="line-clamp-2 text-[13px] leading-6 text-[color:var(--text-primary)]">
                      {moment.text}
                    </div>
                    <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
                      {formatTimestamp(moment.postedAt)} · {moment.likeCount} 赞
                      · {moment.commentCount} 评论
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  if (mode === "author") {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-5 py-4 backdrop-blur-xl">
            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
              作者时间线
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
              当前联系人还没有朋友圈
            </div>
            <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
              先保留联系人上下文，等 TA 有新动态时会直接显示在这里。
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center px-5 py-5">
            <div className="w-full rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
              <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                暂无可展示内容
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                当前联系人暂时没有可展示的朋友圈内容，或者相关内容已被隐藏。
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={onClearAuthor}
                >
                  查看全部
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={onOpenCompose}
                >
                  <PenSquare size={15} />
                  发朋友圈
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-5 py-4 backdrop-blur-xl">
          <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
            概览
          </div>
          <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
            右侧保留当前上下文
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center gap-4">
              <AvatarChip name={ownerUsername} src={ownerAvatar} size="lg" />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-[color:var(--text-primary)]">
                  {ownerUsername ?? "我"}
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                  发一条新的朋友圈，或者从作者列表里切到某个人的时间线。
                </div>
              </div>
            </div>

            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={onOpenCompose}
            >
              <PenSquare size={15} />
              现在发一条
            </Button>
          </div>

          <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                最近作者
              </div>
              <div className="text-[12px] text-[color:var(--text-muted)]">
                {moments.length} 条动态
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {authorSummaries.slice(0, 8).map((author) => (
                <button
                  key={author.authorId}
                  type="button"
                  onClick={() => onSelectAuthor(author.authorId)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition-[border-color,background-color]",
                    activeAuthorId === author.authorId
                      ? selectedSidebarItemClassName
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] hover:bg-white",
                  )}
                >
                  <AvatarChip
                    name={author.authorName}
                    src={author.authorAvatar}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                        {author.authorName}
                      </div>
                      <span className="text-[10px] text-[color:var(--text-dim)]">
                        {author.authorType === "character" ? "角色" : "我"}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                      {author.count} 条动态
                    </div>
                  </div>
                  {author.authorType === "character" ? (
                    <Bot size={14} className="shrink-0 text-sky-600" />
                  ) : (
                    <UserRound
                      size={14}
                      className="shrink-0 text-[color:var(--text-secondary)]"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4">
      <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-[15px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
