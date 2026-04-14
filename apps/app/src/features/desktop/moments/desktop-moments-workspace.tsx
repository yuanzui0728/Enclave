import { useEffect, useMemo, useRef, useState } from "react";
import { type Moment } from "@yinjie/contracts";
import { parseTimestamp } from "../../../lib/format";
import { type DesktopMomentsRouteState } from "./desktop-moments-route-state";
import { DesktopMomentComposePanel } from "./desktop-moment-compose-panel";
import { DesktopMomentsFeed } from "./desktop-moments-feed";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";
import {
  DesktopMomentsSidebar,
  type DesktopMomentAuthorSummary,
} from "./desktop-moments-sidebar";
import { DesktopMomentsToolbar } from "./desktop-moments-toolbar";

type DesktopMomentsWorkspaceProps = {
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingMomentId: string | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  errors?: string[];
  imageDrafts: MomentImageDraft[];
  isLoading: boolean;
  likeErrorMessage?: string | null;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerAvatar?: string | null;
  ownerId?: string | null;
  ownerUsername?: string | null;
  routeSelectedMomentId?: string | null;
  showCompose: boolean;
  successNotice?: string;
  text: string;
  videoDraft: MomentVideoDraft | null;
  isMomentFavorite: (momentId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onCreate: () => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onLike: (momentId: string) => void;
  onOpenAuthorMoments?: (input: {
    authorId: string;
    momentId?: string;
  }) => void;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  onToggleFavorite: (momentId: string) => void;
  onRefresh: () => void;
  onRouteStateChange?: (state: DesktopMomentsRouteState) => void;
  onTextChange: (value: string) => void;
  onVideoFileSelected: (file: File | null) => void;
};

export function DesktopMomentsWorkspace({
  commentDrafts,
  commentErrorMessage,
  commentPendingMomentId,
  composeErrorMessage,
  createPending,
  errors = [],
  imageDrafts,
  isLoading,
  likeErrorMessage,
  likePendingMomentId,
  moments,
  ownerAvatar,
  ownerId,
  ownerUsername,
  routeSelectedMomentId = null,
  showCompose,
  successNotice,
  text,
  videoDraft,
  isMomentFavorite,
  setShowCompose,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onImageFilesSelected,
  onLike,
  onOpenAuthorMoments,
  onRemoveImage,
  onRemoveVideo,
  onToggleFavorite,
  onRefresh,
  onRouteStateChange,
  onTextChange,
  onVideoFileSelected,
}: DesktopMomentsWorkspaceProps) {
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(
    routeSelectedMomentId,
  );
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedMomentId((current) =>
      current === routeSelectedMomentId ? current : routeSelectedMomentId,
    );
  }, [routeSelectedMomentId]);

  const authorSummaries = useMemo(() => {
    const map = new Map<string, Omit<DesktopMomentAuthorSummary, "authorId">>();

    moments.forEach((moment) => {
      const current = map.get(moment.authorId);
      if (current) {
        current.count += 1;
        if (current.latestPostedAt < moment.postedAt) {
          current.latestPostedAt = moment.postedAt;
        }
        return;
      }

      map.set(moment.authorId, {
        authorAvatar: moment.authorAvatar,
        authorName: moment.authorName,
        authorType: moment.authorType,
        count: 1,
        latestPostedAt: moment.postedAt,
      });
    });

    return Array.from(map.entries())
      .map(([authorId, summary]) => ({
        authorId,
        ...summary,
      }))
      .sort(
        (left, right) =>
          (parseTimestamp(right.latestPostedAt) ?? 0) -
          (parseTimestamp(left.latestPostedAt) ?? 0),
      );
  }, [moments]);

  useEffect(() => {
    if (
      selectedMomentId &&
      !moments.some((moment) => moment.id === selectedMomentId)
    ) {
      setSelectedMomentId(null);
    }
  }, [moments, selectedMomentId]);

  const selectedMoment = useMemo(
    () => moments.find((moment) => moment.id === selectedMomentId) ?? null,
    [moments, selectedMomentId],
  );
  const sidebarMode = selectedMoment ? "detail" : "summary";

  useEffect(() => {
    onRouteStateChange?.({
      momentId: selectedMomentId ?? undefined,
    });
  }, [onRouteStateChange, selectedMomentId]);

  function focusAuthor(authorId: string, momentId?: string) {
    if (onOpenAuthorMoments) {
      onOpenAuthorMoments({
        authorId,
        momentId,
      });
      return;
    }

    setSelectedMomentId(momentId ?? null);
  }

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 border-r border-[color:var(--border-faint)] bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <DesktopMomentsToolbar
            commentErrorMessage={commentErrorMessage}
            errors={errors}
            likeErrorMessage={likeErrorMessage}
            successNotice={successNotice}
            totalCount={moments.length}
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
              <DesktopMomentsFeed
                commentDrafts={commentDrafts}
                commentPendingMomentId={commentPendingMomentId}
                isLoading={isLoading}
                likePendingMomentId={likePendingMomentId}
                moments={moments}
                ownerId={ownerId}
                selectedMomentId={selectedMomentId}
                isMomentFavorite={isMomentFavorite}
                onCommentChange={onCommentChange}
                onCommentSubmit={onCommentSubmit}
                onLike={onLike}
                onToggleFavorite={onToggleFavorite}
                onOpenCompose={() => setShowCompose(true)}
                onOpenDetail={(momentId) => setSelectedMomentId(momentId)}
                onSelectAuthor={(authorId, momentId) => {
                  focusAuthor(authorId, momentId);
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <DesktopMomentsSidebar
        authorSummaries={authorSummaries}
        commentDrafts={commentDrafts}
        commentPendingMomentId={commentPendingMomentId}
        likePendingMomentId={likePendingMomentId}
        mode={sidebarMode}
        moments={moments}
        ownerAvatar={ownerAvatar}
        ownerId={ownerId}
        ownerUsername={ownerUsername}
        selectedMoment={selectedMoment}
        isMomentFavorite={isMomentFavorite}
        onCloseDetail={() => setSelectedMomentId(null)}
        onCommentChange={onCommentChange}
        onCommentSubmit={onCommentSubmit}
        onLike={onLike}
        onToggleFavorite={onToggleFavorite}
        onOpenCompose={() => setShowCompose(true)}
        onSelectAuthor={focusAuthor}
      />

      {showCompose ? (
        <DesktopMomentComposePanel
          createPending={createPending}
          canAddImages={imageDrafts.length < 9 && !videoDraft}
          canAddVideo={!imageDrafts.length}
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
