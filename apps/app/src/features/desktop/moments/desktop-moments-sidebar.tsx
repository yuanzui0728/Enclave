import { type Moment } from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import { Bot, PenSquare, UserRound } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { DesktopMomentDetailPanel } from "./desktop-moment-detail-panel";

export type DesktopMomentAuthorSummary = {
  authorAvatar: string;
  authorId: string;
  authorName: string;
  authorType: "user" | "character";
  count: number;
  latestPostedAt: string;
};

export type DesktopMomentsSidebarMode = "summary" | "detail";

type DesktopMomentsSidebarProps = {
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
  onCloseDetail: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onLike: (momentId: string) => void;
  onToggleFavorite: (momentId: string) => void;
  onOpenCompose: () => void;
  onOpenAuthorProfilePopover?: (input: {
    anchorElement: HTMLButtonElement;
    moment: Moment;
  }) => void;
  onSelectAuthor: (authorId: string, momentId?: string) => void;
};

export function DesktopMomentsSidebar({
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
  onCloseDetail,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onToggleFavorite,
  onOpenCompose,
  onOpenAuthorProfilePopover,
  onSelectAuthor,
}: DesktopMomentsSidebarProps) {
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
          onAuthorAction={
            selectedMoment.authorType === "character"
              ? () => onSelectAuthor(selectedMoment.authorId, selectedMoment.id)
              : undefined
          }
          onSelectAuthor={
            selectedMoment.authorType === "character" &&
            onOpenAuthorProfilePopover
              ? (event) =>
                  onOpenAuthorProfilePopover({
                    anchorElement: event.currentTarget,
                    moment: selectedMoment,
                  })
              : undefined
          }
        />
      </aside>
    );
  }

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-5 py-4 backdrop-blur-xl">
          <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
            朋友圈概览
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
                最近更新
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
                  className="flex w-full items-center gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3 text-left transition-[border-color,background-color] hover:bg-white"
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
