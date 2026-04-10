import { useEffect, useMemo, useRef, useState } from "react";
import { type Moment } from "@yinjie/contracts";
import { Button, ErrorBlock, TextAreaField } from "@yinjie/ui";
import { X } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { parseTimestamp } from "../../../lib/format";
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
  showCompose: boolean;
  successNotice?: string;
  text: string;
  setShowCompose: (nextValue: boolean) => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onCreate: () => void;
  onLike: (momentId: string) => void;
  onRefresh: () => void;
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
  showCompose,
  successNotice,
  text,
  setShowCompose,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onLike,
  onRefresh,
  onTextChange,
}: DesktopMomentsWorkspaceProps) {
  const [activeFilter, setActiveFilter] =
    useState<DesktopMomentsFeedFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [activeAuthorId, setActiveAuthorId] = useState<string | null>(null);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  const authorSummaries = useMemo(() => {
    const map = new Map<
      string,
      Omit<DesktopMomentAuthorSummary, "authorId">
    >();

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
    authorSummaries.find((author) => author.authorId === activeAuthorId) ?? null;

  const authorMoments = useMemo(() => {
    if (!activeAuthorId) {
      return [];
    }

    return moments.filter((moment) => moment.authorId === activeAuthorId);
  }, [activeAuthorId, moments]);

  const filteredCountLabel = useMemo(() => {
    if (activeAuthorSummary) {
      return `${activeAuthorSummary.authorName} · ${filteredMoments.length} 条`;
    }

    if (searchText.trim()) {
      return `搜索结果 ${filteredMoments.length} 条`;
    }

    return `当前展示 ${filteredMoments.length} 条`;
  }, [activeAuthorSummary, filteredMoments.length, searchText]);

  useEffect(() => {
    if (
      selectedMomentId &&
      !filteredMoments.some((moment) => moment.id === selectedMomentId)
    ) {
      setSelectedMomentId(null);
    }
  }, [filteredMoments, selectedMomentId]);

  useEffect(() => {
    if (!activeAuthorId) {
      return;
    }

    if (!authorSummaries.some((author) => author.authorId === activeAuthorId)) {
      setActiveAuthorId(null);
    }
  }, [activeAuthorId, authorSummaries]);

  const selectedMoment = useMemo(
    () =>
      filteredMoments.find((moment) => moment.id === selectedMomentId) ?? null,
    [filteredMoments, selectedMomentId],
  );
  const sidebarMode = selectedMoment
    ? "detail"
    : activeAuthorSummary
      ? "author"
      : "summary";

  function focusAuthor(authorId: string) {
    setActiveFilter("all");
    setActiveAuthorId(authorId);
    setSelectedMomentId(null);
  }

  return (
    <div className="relative flex h-full min-h-0 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,249,241,0.96))]">
      <section className="min-w-0 flex-1 border-r border-[rgba(15,23,42,0.06)]">
        <div className="flex h-full min-h-0 flex-col">
          <DesktopMomentsToolbar
            activeFilter={activeFilter}
            commentErrorMessage={commentErrorMessage}
            errors={errors}
            filteredCountLabel={filteredCountLabel}
            likeErrorMessage={likeErrorMessage}
            searchText={searchText}
            selectedAuthorName={activeAuthorSummary?.authorName ?? null}
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
            className="min-h-0 flex-1 overflow-auto px-6 py-5"
          >
            <DesktopMomentsFeed
              commentDrafts={commentDrafts}
              commentPendingMomentId={commentPendingMomentId}
              isLoading={isLoading}
              likePendingMomentId={likePendingMomentId}
              moments={filteredMoments}
              ownerId={ownerId}
              selectedMomentId={selectedMomentId}
              totalMomentsCount={moments.length}
              onCommentChange={onCommentChange}
              onCommentSubmit={onCommentSubmit}
              onLike={onLike}
              onOpenCompose={() => setShowCompose(true)}
              onOpenDetail={(momentId) => setSelectedMomentId(momentId)}
              onSelectAuthor={(authorId) => {
                focusAuthor(authorId);
              }}
            />
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
        onClearAuthor={() => setActiveAuthorId(null)}
        onCloseDetail={() => setSelectedMomentId(null)}
        onCommentChange={onCommentChange}
        onCommentSubmit={onCommentSubmit}
        onLike={onLike}
        onOpenCompose={() => setShowCompose(true)}
        onSelectAuthor={focusAuthor}
        onSelectMoment={setSelectedMomentId}
      />

      {showCompose ? (
        <div className="absolute inset-0 z-20 flex justify-end bg-[rgba(15,23,42,0.16)] backdrop-blur-[2px]">
          <div className="flex h-full w-full max-w-[420px] flex-col border-l border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,239,0.98))] shadow-[-24px_0_48px_rgba(15,23,42,0.10)]">
            <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.06)] px-5 py-5">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
                  发朋友圈
                </div>
                <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
                  把这一刻留在桌面里
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCompose(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(15,23,42,0.06)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[rgba(248,250,252,0.98)]"
                aria-label="关闭发帖面板"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 px-5 py-5">
              <div className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-3">
                  <AvatarChip name={ownerUsername} src={ownerAvatar} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                      {ownerUsername ?? "我"}
                    </div>
                    <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                      桌面端首版先支持文本发布
                    </div>
                  </div>
                </div>

                <TextAreaField
                  value={text}
                  onChange={(event) => onTextChange(event.target.value)}
                  placeholder="写下这一刻的想法..."
                  className="mt-5 min-h-[220px] resize-none border-[rgba(15,23,42,0.08)] bg-[rgba(248,250,252,0.98)]"
                  autoFocus
                />

                {composeErrorMessage ? (
                  <div className="mt-4">
                    <ErrorBlock message={composeErrorMessage} />
                  </div>
                ) : null}

                <div className="mt-4 text-[12px] text-[color:var(--text-muted)]">
                  草稿会自动保存在当前浏览器，直到你发布或清空内容。
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <div className="text-[12px] text-[color:var(--text-muted)]">
                    发布后会直接插入到动态流顶部。
                  </div>
                  <Button
                    variant="primary"
                    disabled={!text.trim() || createPending}
                    onClick={onCreate}
                  >
                    {createPending ? "发布中..." : "发布"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
