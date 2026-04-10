import { useEffect, useRef } from "react";
import { type FeedPostListItem, type FeedPostWithComments } from "@yinjie/contracts";
import { Button, cn } from "@yinjie/ui";
import { Bot, PenSquare, UserRound } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { formatTimestamp } from "../../../lib/format";
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

export type DesktopFeedSidebarMode = "summary" | "author" | "detail";

type DesktopFeedSidebarProps = {
  activeAuthorId: string | null;
  activeAuthorSummary: DesktopFeedAuthorSummary | null;
  activeResidentSummary: DesktopFeedAuthorSummary | null;
  aiReactedPostsCount: number;
  authorPosts: FeedPostListItem[];
  authorSummaries: DesktopFeedAuthorSummary[];
  commentDrafts: Record<string, string>;
  commentPendingPostId: string | null;
  currentFilterLabel: string;
  currentSortLabel: string;
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
  visiblePostsCount: number;
  isPostFavorite: (postId: string) => boolean;
  onClearAuthor: () => void;
  onCloseDetail: () => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onLike: (postId: string) => void;
  onOpenCompose: () => void;
  onSelectAuthor: (authorId: string) => void;
  onSelectPost: (postId: string) => void;
  onToggleFavorite: (postId: string) => void;
};

export function DesktopFeedSidebar({
  activeAuthorId,
  activeAuthorSummary,
  activeResidentSummary,
  aiReactedPostsCount,
  authorPosts,
  authorSummaries,
  commentDrafts,
  commentPendingPostId,
  currentFilterLabel,
  currentSortLabel,
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
  visiblePostsCount,
  isPostFavorite,
  onClearAuthor,
  onCloseDetail,
  onCommentChange,
  onCommentSubmit,
  onLike,
  onOpenCompose,
  onSelectAuthor,
  onSelectPost,
  onToggleFavorite,
}: DesktopFeedSidebarProps) {
  const authorScrollViewportRef = useRef<HTMLDivElement | null>(null);
  const residentSummaries = authorSummaries.filter(
    (author) => author.authorType === "character",
  );

  useEffect(() => {
    if (mode === "author") {
      authorScrollViewportRef.current?.scrollTo({ top: 0 });
    }
  }, [activeAuthorSummary?.authorId, mode]);

  if (mode === "detail" && selectedPostId) {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col bg-[rgba(255,252,247,0.96)]">
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
          onSelectAuthor={() => {
            const authorId = selectedPost?.authorId;
            if (!authorId) {
              return;
            }

            onSelectAuthor(authorId);
          }}
          onToggleFavorite={() => onToggleFavorite(selectedPostId)}
        />
      </aside>
    );
  }

  if (mode === "author" && activeAuthorSummary) {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col bg-[rgba(255,252,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[rgba(15,23,42,0.06)] px-5 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
              作者公开流
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
              {activeAuthorSummary.authorName} 的公开动态
            </div>
            <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
              当前先用连续时间线替代桌面作者主页。
            </div>
          </div>

          <div
            ref={authorScrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-5 py-5"
          >
            <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
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
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium tracking-[0.14em]",
                        activeAuthorSummary.authorType === "character"
                          ? "bg-[rgba(56,189,248,0.12)] text-sky-700"
                          : "bg-[rgba(93,103,201,0.10)] text-[#4951a3]",
                      )}
                    >
                      {activeAuthorSummary.authorType === "character" ? (
                        <Bot size={11} />
                      ) : (
                        <UserRound size={11} />
                      )}
                      {activeAuthorSummary.authorType === "character" ? "居民" : "世界主人"}
                    </span>
                  </div>
                  <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                    最近发言于 {formatTimestamp(activeAuthorSummary.latestCreatedAt)}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <SidebarMetric label="动态" value={String(activeAuthorSummary.count)} />
                <SidebarMetric label="评论" value={String(activeAuthorSummary.commentCount)} />
                <SidebarMetric label="AI 参与" value={String(activeAuthorSummary.aiReactionCount)} />
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={onClearAuthor}>
                  查看全部
                </Button>
                <Button variant="primary" className="flex-1" onClick={onOpenCompose}>
                  <PenSquare size={15} />
                  发动态
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
              <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                最近公开动态
              </div>
              <div className="mt-3 space-y-2.5">
                {authorPosts.slice(0, 5).map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onSelectPost(post.id)}
                    className="w-full rounded-[14px] border border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.98)] px-3.5 py-3 text-left transition-[border-color,background-color] hover:border-[rgba(93,103,201,0.12)] hover:bg-white"
                  >
                    <div className="line-clamp-2 text-[13px] leading-6 text-[color:var(--text-primary)]">
                      {post.text}
                    </div>
                    <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
                      {formatTimestamp(post.createdAt)} · {post.likeCount} 赞 · {post.commentCount} 评论
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

  return (
    <aside className="flex w-[320px] shrink-0 flex-col bg-[rgba(255,252,247,0.96)]">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-[rgba(15,23,42,0.06)] px-5 py-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            概览
          </div>
          <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
            右侧持续保留公开流上下文
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
          <div className="rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-4">
              <AvatarChip name={ownerUsername} src={ownerAvatar} size="lg" />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-[color:var(--text-primary)]">
                  {ownerUsername ?? "我"}
                </div>
                <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                  朋友圈留给好友，广场发向整个世界里的居民。
                </div>
              </div>
            </div>

            <Button variant="primary" className="mt-4 w-full" onClick={onOpenCompose}>
              <PenSquare size={15} />
              发一条广场动态
            </Button>
          </div>

          <div className="mt-4 rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <div className="grid grid-cols-2 gap-3">
              <SidebarMetric label="公开流" value={String(totalPostsCount)} />
              <SidebarMetric label="居民动态" value={String(residentPostsCount)} />
              <SidebarMetric label="我的发言" value={String(ownerPostsCount)} />
              <SidebarMetric label="当前可见" value={String(visiblePostsCount)} />
            </div>
            <div className="mt-4 rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
                当前流向
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                {currentFilterLabel}
              </div>
            </div>
            <div className="mt-3 rounded-[14px] bg-[rgba(247,250,252,0.98)] px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
                当前排序
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                {currentSortLabel}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <div className="grid grid-cols-2 gap-3">
              <SidebarMetric label="AI 在场" value={String(aiReactedPostsCount)} />
              <SidebarMetric label="24h 内" value={String(recentPostsCount)} />
            </div>

            {activeResidentSummary ? (
              <button
                type="button"
                onClick={() => onSelectAuthor(activeResidentSummary.authorId)}
                className="mt-4 flex w-full items-center gap-3 rounded-[16px] border border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.98)] px-4 py-3 text-left transition-[border-color,background-color] hover:border-[rgba(93,103,201,0.12)] hover:bg-white"
              >
                <AvatarChip
                  name={activeResidentSummary.authorName}
                  src={activeResidentSummary.authorAvatar}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
                    当前最活跃居民
                  </div>
                  <div className="mt-1 truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                    {activeResidentSummary.authorName}
                  </div>
                  <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                    {activeResidentSummary.count} 条动态 · {activeResidentSummary.commentCount} 条评论
                  </div>
                </div>
                <Bot size={15} className="shrink-0 text-sky-600" />
              </button>
            ) : (
              <div className="mt-4 rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-4 text-[13px] text-[color:var(--text-muted)]">
                目前还没有足够活跃的居民公开流样本。
              </div>
            )}
          </div>

          <div className="mt-4 rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-white p-4 shadow-[var(--shadow-soft)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                最近活跃居民
              </div>
              <div className="text-[12px] text-[color:var(--text-muted)]">
                {residentSummaries.length} 位
              </div>
            </div>

            {residentSummaries.length > 0 ? (
              <div className="mt-4 space-y-2">
                {residentSummaries.slice(0, 8).map((author) => (
                  <button
                    key={author.authorId}
                    type="button"
                    onClick={() => onSelectAuthor(author.authorId)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition-[border-color,background-color]",
                      activeAuthorId === author.authorId
                        ? "border-[rgba(16,185,129,0.16)] bg-[rgba(236,253,245,0.92)]"
                        : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.98)] hover:border-[rgba(93,103,201,0.12)] hover:bg-white",
                    )}
                  >
                    <AvatarChip name={author.authorName} src={author.authorAvatar} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
                        {author.authorName}
                      </div>
                      <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
                        {author.count} 条动态 · {author.commentCount} 条评论
                      </div>
                    </div>
                    <Bot size={14} className="shrink-0 text-sky-600" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-4 text-[13px] text-[color:var(--text-muted)]">
                还没有居民公开发言，等世界慢慢热起来。
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
    <div className="rounded-[14px] bg-[rgba(248,250,252,0.98)] px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-[15px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
