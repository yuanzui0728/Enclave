import { useEffect, useMemo, useRef, useState } from "react";
import { type Moment } from "@yinjie/contracts";
import { parseTimestamp } from "../../../lib/format";
import { type DesktopMomentsRouteState } from "./desktop-moments-route-state";
import { DesktopMomentComposePanel } from "./desktop-moment-compose-panel";
import { DesktopMomentsFeed } from "./desktop-moments-feed";
import {
  DesktopMomentsSidebar,
  type DesktopMomentAuthorSummary,
} from "./desktop-moments-sidebar";
import {
  DesktopMomentsToolbar,
  type DesktopMomentsFeedFilter,
} from "./desktop-moments-toolbar";

type DesktopMomentsWorkspaceProps = {
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingMomentId: string | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  errors?: string[];
  isLoading: boolean;
  likeErrorMessage?: string | null;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerAvatar?: string | null;
  ownerId?: string | null;
  ownerUsername?: string | null;
  routeSelectedAuthorId?: string | null;
  routeSelectedMomentId?: string | null;
  showCompose: boolean;
  successNotice?: string;
  text: string;
  isMomentFavorite: (momentId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onCreate: () => void;
  onLike: (momentId: string) => void;
  onToggleFavorite: (momentId: string) => void;
  onRefresh: () => void;
  onRouteStateChange?: (state: DesktopMomentsRouteState) => void;
  onTextChange: (value: string) => void;
};

export function DesktopMomentsWorkspace({
  commentDrafts,
  commentErrorMessage,
  commentPendingMomentId,
  composeErrorMessage,
  createPending,
  errors = [],
  isLoading,
  likeErrorMessage,
  likePendingMomentId,
  moments,
  ownerAvatar,
  ownerId,
  ownerUsername,
  routeSelectedAuthorId = null,
  routeSelectedMomentId = null,
  showCompose,
  successNotice,
  text,
  isMomentFavorite,
  setShowCompose,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onLike,
  onToggleFavorite,
  onRefresh,
  onRouteStateChange,
  onTextChange,
}: DesktopMomentsWorkspaceProps) {
  const [activeFilter, setActiveFilter] =
    useState<DesktopMomentsFeedFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [activeAuthorId, setActiveAuthorId] = useState<string | null>(
    routeSelectedAuthorId,
  );
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(
    routeSelectedMomentId,
  );
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedMomentId((current) =>
      current === routeSelectedMomentId ? current : routeSelectedMomentId,
    );
  }, [routeSelectedMomentId]);

  useEffect(() => {
    if (routeSelectedAuthorId) {
      setActiveFilter("all");
      scrollViewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }

    setActiveAuthorId((current) =>
      current === routeSelectedAuthorId ? current : routeSelectedAuthorId,
    );
  }, [routeSelectedAuthorId]);

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

  const filteredMoments = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return moments.filter((moment) => {
      if (activeFilter === "owner" && moment.authorType !== "user") {
        return false;
      }

      if (activeFilter === "character" && moment.authorType !== "character") {
        return false;
      }

      if (activeAuthorId && moment.authorId !== activeAuthorId) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const commentText = moment.comments
        .map((comment) => comment.text)
        .join(" ")
        .toLowerCase();

      return (
        moment.authorName.toLowerCase().includes(keyword) ||
        moment.text.toLowerCase().includes(keyword) ||
        commentText.includes(keyword)
      );
    });
  }, [activeAuthorId, activeFilter, moments, searchText]);

  const activeAuthorSummary =
    authorSummaries.find((author) => author.authorId === activeAuthorId) ??
    null;

  const authorMoments = useMemo(() => {
    if (!activeAuthorId) {
      return [];
    }

    return moments.filter((moment) => moment.authorId === activeAuthorId);
  }, [activeAuthorId, moments]);

  const filteredCountLabel = useMemo(() => {
    if (activeAuthorId) {
      return `${activeAuthorSummary?.authorName ?? "当前联系人"} · ${filteredMoments.length} 条`;
    }

    if (searchText.trim()) {
      return `搜索结果 ${filteredMoments.length} 条`;
    }

    return `当前展示 ${filteredMoments.length} 条`;
  }, [activeAuthorId, activeAuthorSummary, filteredMoments.length, searchText]);

  useEffect(() => {
    if (
      selectedMomentId &&
      !filteredMoments.some((moment) => moment.id === selectedMomentId)
    ) {
      setSelectedMomentId(null);
    }
  }, [filteredMoments, selectedMomentId]);

  const selectedMoment = useMemo(
    () =>
      filteredMoments.find((moment) => moment.id === selectedMomentId) ?? null,
    [filteredMoments, selectedMomentId],
  );
  const sidebarMode = selectedMoment
    ? "detail"
    : activeAuthorId
      ? "author"
      : "summary";

  useEffect(() => {
    onRouteStateChange?.({
      authorId: activeAuthorId ?? undefined,
      momentId: selectedMomentId ?? undefined,
    });
  }, [activeAuthorId, onRouteStateChange, selectedMomentId]);

  function focusAuthor(authorId: string) {
    setActiveFilter("all");
    setActiveAuthorId(authorId);
    setSelectedMomentId(null);
  }

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 border-r border-[color:var(--border-faint)] bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <DesktopMomentsToolbar
            activeFilter={activeFilter}
            commentErrorMessage={commentErrorMessage}
            errors={errors}
            filteredCountLabel={filteredCountLabel}
            likeErrorMessage={likeErrorMessage}
            searchText={searchText}
            selectedAuthorName={
              activeAuthorSummary?.authorName ??
              (activeAuthorId ? "当前联系人" : null)
            }
            successNotice={successNotice}
            onBackToTop={() => {
              scrollViewportRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
            onClearAuthor={() => setActiveAuthorId(null)}
            onFilterChange={setActiveFilter}
            onOpenCompose={() => setShowCompose(true)}
            onRefresh={onRefresh}
            onSearchChange={setSearchText}
          />

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-7 py-6"
          >
            <div className="mx-auto w-full max-w-[760px]">
              <DesktopMomentsFeed
                activeAuthorId={activeAuthorId}
                activeAuthorName={activeAuthorSummary?.authorName ?? null}
                commentDrafts={commentDrafts}
                commentPendingMomentId={commentPendingMomentId}
                isLoading={isLoading}
                likePendingMomentId={likePendingMomentId}
                moments={filteredMoments}
                ownerId={ownerId}
                searchText={searchText}
                selectedMomentId={selectedMomentId}
                totalMomentsCount={moments.length}
                isMomentFavorite={isMomentFavorite}
                onCommentChange={onCommentChange}
                onCommentSubmit={onCommentSubmit}
                onClearAuthor={() => setActiveAuthorId(null)}
                onLike={onLike}
                onToggleFavorite={onToggleFavorite}
                onOpenCompose={() => setShowCompose(true)}
                onOpenDetail={(momentId) => setSelectedMomentId(momentId)}
                onSelectAuthor={(authorId) => {
                  focusAuthor(authorId);
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <DesktopMomentsSidebar
        activeAuthorId={activeAuthorId}
        activeAuthorSummary={activeAuthorSummary}
        authorMoments={authorMoments}
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
        onClearAuthor={() => setActiveAuthorId(null)}
        onCloseDetail={() => setSelectedMomentId(null)}
        onCommentChange={onCommentChange}
        onCommentSubmit={onCommentSubmit}
        onLike={onLike}
        onToggleFavorite={onToggleFavorite}
        onOpenCompose={() => setShowCompose(true)}
        onSelectAuthor={focusAuthor}
        onSelectMoment={setSelectedMomentId}
      />

      {showCompose ? (
        <DesktopMomentComposePanel
          createPending={createPending}
          errorMessage={composeErrorMessage}
          ownerAvatar={ownerAvatar}
          ownerUsername={ownerUsername}
          text={text}
          onClose={() => setShowCompose(false)}
          onCreate={onCreate}
          onTextChange={onTextChange}
        />
      ) : null}
    </div>
  );
}
