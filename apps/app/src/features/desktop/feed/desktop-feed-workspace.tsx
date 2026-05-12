import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFeedPost,
  type FeedComment,
  type FeedPostListItem,
} from "@yinjie/contracts";
import { DesktopFeedComposePanel } from "./desktop-feed-compose-panel";
import { DesktopFeedList } from "./desktop-feed-list";
import { DesktopFeedToolbar } from "./desktop-feed-toolbar";
import { type FeedCommentReplyTarget } from "./feed-types";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";

type DesktopFeedWorkspaceProps = {
  canAddImages: boolean;
  canAddVideo: boolean;
  baseUrl?: string;
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingPostId: string | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  errors?: string[];
  imageDrafts: MomentImageDraft[];
  isLoading: boolean;
  likeErrorMessage?: string | null;
  likePendingPostId: string | null;
  ownerAvatar?: string | null;
  ownerUsername?: string | null;
  posts: FeedPostListItem[];
  onSelectedPostChange?: (postId: string | null) => void;
  routeSelectedPostId?: string | null;
  showCompose: boolean;
  successNotice?: string;
  text: string;
  videoDraft: MomentVideoDraft | null;
  commentReplyTarget?: FeedCommentReplyTarget | null;
  isPostFavorite: (postId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onCancelCommentReply?: () => void;
  onCommentChange: (postId: string, value: string) => void;
  onCommentSubmit: (postId: string) => void;
  onCreate: () => void;
  onStartCommentReply?: (comment: FeedComment) => void;
  onSelectCommentAuthor?: (
    event: ReactMouseEvent<HTMLButtonElement>,
    comment: FeedComment,
  ) => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onLike: (postId: string) => void;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  onRefresh: () => void;
  /** 可选 — 点击行内「分享图卡」时上抛 postId，由 page 弹出 modal。 */
  onShare?: (postId: string) => void;
  onTextChange: (value: string) => void;
  onToggleFavorite: (postId: string) => void;
  onVideoFileSelected: (file: File | null) => void;
};

export function DesktopFeedWorkspace({
  canAddImages,
  canAddVideo,
  baseUrl,
  commentDrafts,
  commentErrorMessage,
  commentPendingPostId,
  composeErrorMessage,
  createPending,
  errors = [],
  imageDrafts,
  isLoading,
  likeErrorMessage,
  likePendingPostId,
  ownerAvatar,
  ownerUsername,
  posts,
  onSelectedPostChange,
  routeSelectedPostId = null,
  showCompose,
  successNotice,
  text,
  videoDraft,
  commentReplyTarget = null,
  isPostFavorite,
  setShowCompose,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onImageFilesSelected,
  onStartCommentReply,
  onSelectCommentAuthor,
  onLike,
  onRemoveImage,
  onRemoveVideo,
  onRefresh,
  onShare,
  onTextChange,
  onToggleFavorite,
  onVideoFileSelected,
}: DesktopFeedWorkspaceProps) {
  const [selectedPostId, setSelectedPostId] = useState<string | null>(
    routeSelectedPostId,
  );
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedPostId((current) =>
      current === routeSelectedPostId ? current : routeSelectedPostId,
    );
  }, [routeSelectedPostId]);

  const detailQuery = useQuery({
    queryKey: ["app-feed-post", baseUrl, selectedPostId],
    queryFn: async () => {
      if (!selectedPostId) {
        return null;
      }

      return (await getFeedPost(selectedPostId, baseUrl)) ?? null;
    },
    enabled: Boolean(selectedPostId),
  });

  useEffect(() => {
    if (!selectedPostId) {
      return;
    }

    if (!posts.some((post) => post.id === selectedPostId)) {
      setSelectedPostId(null);
    }
  }, [posts, selectedPostId]);

  useEffect(() => {
    onSelectedPostChange?.(selectedPostId);
  }, [onSelectedPostChange, selectedPostId]);

  useEffect(() => {
    if (!selectedPostId || typeof document === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`desktop-feed-post-${selectedPostId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedPostId]);

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <DesktopFeedToolbar
            commentErrorMessage={commentErrorMessage}
            errors={errors}
            likeErrorMessage={likeErrorMessage}
            successNotice={successNotice}
            totalCount={posts.length}
            onBackToTop={() => {
              scrollViewportRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
            onOpenCompose={() => setShowCompose(true)}
            onRefresh={onRefresh}
          />

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-7 py-6"
          >
            <div className="mx-auto w-full max-w-[760px]">
              <DesktopFeedList
                commentDrafts={commentDrafts}
                commentPendingPostId={commentPendingPostId}
                commentReplyTarget={commentReplyTarget}
                detailErrorMessage={
                  detailQuery.isError && detailQuery.error instanceof Error
                    ? detailQuery.error.message
                    : null
                }
                detailLoading={detailQuery.isLoading}
                detailPost={detailQuery.data ?? null}
                selectedPostId={selectedPostId}
                isLoading={isLoading}
                likePendingPostId={likePendingPostId}
                posts={posts}
                isPostFavorite={isPostFavorite}
                onCancelCommentReply={onCancelCommentReply}
                onCommentChange={onCommentChange}
                onCommentSubmit={onCommentSubmit}
                onLoadFullComments={(postId) => setSelectedPostId(postId)}
                onLike={onLike}
                onOpenCompose={() => setShowCompose(true)}
                onShare={onShare}
                onStartCommentReply={onStartCommentReply}
                onSelectCommentAuthor={onSelectCommentAuthor}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          </div>
        </div>
      </section>

      {showCompose ? (
        <DesktopFeedComposePanel
          canAddImages={canAddImages}
          canAddVideo={canAddVideo}
          createPending={createPending}
          errorMessage={composeErrorMessage}
          imageDrafts={imageDrafts}
          ownerAvatar={ownerAvatar}
          ownerUsername={ownerUsername}
          text={text}
          videoDraft={videoDraft}
          onClose={() => setShowCompose(false)}
          onCreate={onCreate}
          onImageFilesSelected={onImageFilesSelected}
          onRemoveImage={onRemoveImage}
          onRemoveVideo={onRemoveVideo}
          onTextChange={onTextChange}
          onVideoFileSelected={onVideoFileSelected}
        />
      ) : null}
    </div>
  );
}
