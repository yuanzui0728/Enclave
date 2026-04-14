import { type FeedPostWithComments } from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import { Bot, PenSquare, UserRound } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { DesktopFeedDetailPanel } from "./desktop-feed-detail-panel";

export type DesktopFeedAuthorSummary = {
  authorAvatar: string;
  authorId: string;
  authorName: string;
  authorType: "user" | "character";
  aiReactionCount: number;
  commentCount: number;
  count: number;
  latestCreatedAt: string;
};

export type DesktopFeedSidebarMode = "summary" | "detail";

type DesktopFeedSidebarProps = {
  authorSummaries: DesktopFeedAuthorSummary[];
  commentDrafts: Record<string, string>;
  commentPendingPostId: string | null;
  detailErrorMessage?: string | null;
  detailLoading: boolean;
  likePendingPostId: string | null;
  mode: DesktopFeedSidebarMode;
  ownerAvatar?: string | null;
  ownerPostsCount: number;
  ownerUsername?: string | null;
  recentPostsCount: number;
  residentPostsCount: number;
  selectedPost: FeedPostWithComments | null;
  selectedPostId: string | null;
  totalPostsCount: number;
  aiReactedPostsCount: number;
  isPostFavorite: (postId: string) => boolean;
  onCloseDetail: () => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onOpenCompose: () => void;
  onToggleFavorite: (postId: string) => void;
};

export function DesktopFeedSidebar({
  authorSummaries,
  commentDrafts,
  commentPendingPostId,
  detailErrorMessage,
  detailLoading,
  likePendingPostId,
  mode,
  ownerAvatar,
  ownerPostsCount,
  ownerUsername,
  recentPostsCount,
  residentPostsCount,
  selectedPost,
  selectedPostId,
  totalPostsCount,
  aiReactedPostsCount,
  isPostFavorite,
  onCloseDetail,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onOpenCompose,
  onToggleFavorite,
}: DesktopFeedSidebarProps) {
  if (mode === "detail" && selectedPostId) {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
        <DesktopFeedDetailPanel
          commentDraft={commentDrafts[selectedPostId] ?? ""}
          commentLoading={commentPendingPostId === selectedPostId}
          errorMessage={detailErrorMessage}
          favorite={isPostFavorite(selectedPostId)}
          likeLoading={likePendingPostId === selectedPostId}
          loading={detailLoading}
          post={selectedPost}
          onClose={onCloseDetail}
          onCommentChange={(value) => onCommentChange(selectedPostId, value)}
          onCommentSubmit={() => onCommentSubmit(selectedPostId)}
          onLike={() => onLike(selectedPostId)}
          onToggleFavorite={() => onToggleFavorite(selectedPostId)}
        />
      </aside>
    );
  }

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-5 py-4 backdrop-blur-xl">
          <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
            广场概览
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
                  这里会连续展示整个世界的公开动态，不区分是否已经是好友。
                </div>
              </div>
            </div>

            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={onOpenCompose}
            >
              <PenSquare size={15} />
              发一条广场动态
            </Button>
          </div>

          <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="grid grid-cols-2 gap-3">
              <SidebarMetric label="公开流" value={String(totalPostsCount)} />
              <SidebarMetric
                label="居民动态"
                value={String(residentPostsCount)}
              />
              <SidebarMetric label="我的发言" value={String(ownerPostsCount)} />
              <SidebarMetric
                label="AI 在场"
                value={String(aiReactedPostsCount)}
              />
            </div>
            <div className="mt-3 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
              <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
                当前说明
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                广场会把很多并非好友关系的世界人公开发言一起放进时间流。
              </div>
            </div>
            <div className="mt-3 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3">
              <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
                最近 24 小时
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                最近 24 小时内共有 {recentPostsCount} 条公开动态更新。
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                最近活跃的世界人
              </div>
              <div className="text-[12px] text-[color:var(--text-muted)]">
                {authorSummaries.length} 位
              </div>
            </div>

            {authorSummaries.length > 0 ? (
              <div className="mt-4 space-y-2">
                {authorSummaries.slice(0, 8).map((author) => (
                  <div
                    key={author.authorId}
                    className="flex items-center gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3"
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
                          {author.authorType === "character" ? "世界人" : "我"}
                        </span>
                      </div>
                      <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                        {author.count} 条动态 · {author.commentCount} 条评论
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
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-4 text-[13px] text-[color:var(--text-muted)]">
                还没有公开发言，等世界慢慢热起来。
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-[15px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
