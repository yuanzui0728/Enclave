import { useEffect, useMemo, useRef, useState } from "react";
import { type Moment } from "@yinjie/contracts";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  cn,
} from "@yinjie/ui";
import {
  ArrowUp,
  Bot,
  PenSquare,
  RefreshCcw,
  UserRound,
  X,
} from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { DesktopMomentDetailPanel } from "./desktop-moment-detail-panel";
import { DesktopMomentRow } from "./desktop-moment-row";

type FeedFilter = "all" | "owner" | "character";

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

const filterOptions: Array<{ key: FeedFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "owner", label: "只看我" },
  { key: "character", label: "只看角色" },
];

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
  const [activeFilter, setActiveFilter] = useState<FeedFilter>("all");
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  const authorSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        authorAvatar: string;
        authorName: string;
        authorType: "user" | "character";
        count: number;
        latestPostedAt: string;
      }
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
      .sort((left, right) =>
        right.latestPostedAt.localeCompare(left.latestPostedAt),
      );
  }, [moments]);

  const filteredMoments = useMemo(() => {
    return moments.filter((moment) => {
      if (activeFilter === "owner" && moment.authorType !== "user") {
        return false;
      }

      if (activeFilter === "character" && moment.authorType !== "character") {
        return false;
      }

      if (selectedAuthorId && moment.authorId !== selectedAuthorId) {
        return false;
      }

      return true;
    });
  }, [activeFilter, moments, selectedAuthorId]);

  const selectedMoment = useMemo(
    () =>
      filteredMoments.find((moment) => moment.id === selectedMomentId) ?? null,
    [filteredMoments, selectedMomentId],
  );

  const ownerMomentCount = moments.filter(
    (moment) => moment.authorType === "user",
  ).length;
  const characterMomentCount = moments.filter(
    (moment) => moment.authorType === "character",
  ).length;
  const totalCommentCount = moments.reduce(
    (total, moment) => total + moment.commentCount,
    0,
  );
  const selectedAuthorSummary =
    authorSummaries.find((author) => author.authorId === selectedAuthorId) ??
    null;

  useEffect(() => {
    if (!filteredMoments.some((moment) => moment.id === selectedMomentId)) {
      setSelectedMomentId(null);
    }
  }, [filteredMoments, selectedMomentId]);

  return (
    <div className="relative flex h-full min-h-0 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,249,241,0.96))]">
      <section className="min-w-0 flex-1 border-r border-[rgba(15,23,42,0.06)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[rgba(15,23,42,0.06)] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-dim)]">
                  朋友圈
                </div>
                <div className="mt-2 text-[26px] font-semibold tracking-[0.02em] text-[color:var(--text-primary)]">
                  桌面里连续浏览，右边看详情
                </div>
                <div className="mt-2 text-[13px] leading-7 text-[color:var(--text-secondary)]">
                  把发帖、浏览、筛选和评论放进一个工作区里，不再是移动页的放大版。
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={onRefresh}>
                  <RefreshCcw size={14} />
                  刷新
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    scrollViewportRef.current?.scrollTo({
                      top: 0,
                      behavior: "smooth",
                    });
                  }}
                >
                  <ArrowUp size={14} />
                  回到顶部
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowCompose(true)}
                >
                  <PenSquare size={14} />
                  发朋友圈
                </Button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              {filterOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setActiveFilter(option.key)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-[12px] font-medium transition-[border-color,background-color,color]",
                    activeFilter === option.key
                      ? "border-[rgba(249,115,22,0.18)] bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]"
                      : "border-[rgba(15,23,42,0.08)] bg-white/86 text-[color:var(--text-secondary)] hover:border-[rgba(249,115,22,0.14)] hover:text-[color:var(--text-primary)]",
                  )}
                >
                  {option.label}
                </button>
              ))}

              {selectedAuthorSummary ? (
                <button
                  type="button"
                  onClick={() => setSelectedAuthorId(null)}
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(16,185,129,0.16)] bg-[rgba(236,253,245,0.92)] px-4 py-2 text-[12px] font-medium text-emerald-700"
                >
                  只看 {selectedAuthorSummary.authorName}
                  <X size={13} />
                </button>
              ) : null}
            </div>

            {successNotice ? (
              <div className="mt-4">
                <InlineNotice tone="success">{successNotice}</InlineNotice>
              </div>
            ) : null}
            {errors.length > 0 ? (
              <div className="mt-4 space-y-3">
                {errors.map((message, index) => (
                  <ErrorBlock key={`${message}-${index}`} message={message} />
                ))}
              </div>
            ) : null}
            {likeErrorMessage ? (
              <div className="mt-4">
                <ErrorBlock message={likeErrorMessage} />
              </div>
            ) : null}
            {commentErrorMessage ? (
              <div className="mt-4">
                <ErrorBlock message={commentErrorMessage} />
              </div>
            ) : null}
          </div>

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-6 py-5"
          >
            {isLoading ? <LoadingBlock label="正在读取朋友圈..." /> : null}

            {!isLoading && filteredMoments.length > 0 ? (
              <div className="space-y-4">
                {filteredMoments.map((moment) => (
                  <DesktopMomentRow
                    key={moment.id}
                    active={moment.id === selectedMomentId}
                    commentDraft={commentDrafts[moment.id] ?? ""}
                    commentLoading={commentPendingMomentId === moment.id}
                    likeLoading={likePendingMomentId === moment.id}
                    moment={moment}
                    ownerId={ownerId}
                    onCommentChange={(value) =>
                      onCommentChange(moment.id, value)
                    }
                    onCommentSubmit={() => onCommentSubmit(moment.id)}
                    onLike={() => onLike(moment.id)}
                    onOpenDetail={() => setSelectedMomentId(moment.id)}
                    onSelectAuthor={() => {
                      setSelectedAuthorId(moment.authorId);
                      setSelectedMomentId(moment.id);
                    }}
                  />
                ))}
              </div>
            ) : null}

            {!isLoading && !filteredMoments.length ? (
              <EmptyState
                title={moments.length ? "当前筛选下没有动态" : "朋友圈还很安静"}
                description={
                  moments.length
                    ? "换个筛选条件试试，或者去右边直接发一条新的朋友圈。"
                    : "你先发一条，或者等世界里的其他人先开口。"
                }
                action={
                  <Button
                    variant="primary"
                    onClick={() => setShowCompose(true)}
                  >
                    发朋友圈
                  </Button>
                }
              />
            ) : null}
          </div>
        </div>
      </section>

      <aside className="flex w-[360px] shrink-0 flex-col bg-[rgba(255,252,247,0.96)]">
        {selectedMoment ? (
          <DesktopMomentDetailPanel
            commentDraft={commentDrafts[selectedMoment.id] ?? ""}
            commentLoading={commentPendingMomentId === selectedMoment.id}
            likeLoading={likePendingMomentId === selectedMoment.id}
            moment={selectedMoment}
            ownerId={ownerId}
            onClose={() => setSelectedMomentId(null)}
            onCommentChange={(value) =>
              onCommentChange(selectedMoment.id, value)
            }
            onCommentSubmit={() => onCommentSubmit(selectedMoment.id)}
            onLike={() => onLike(selectedMoment.id)}
            onSelectAuthor={() => setSelectedAuthorId(selectedMoment.authorId)}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[rgba(15,23,42,0.06)] px-5 py-5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
                概览
              </div>
              <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
                像微信电脑端一样，把常用入口留在侧边
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
              <div className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-4">
                  <AvatarChip
                    name={ownerUsername}
                    src={ownerAvatar}
                    size="lg"
                  />
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
                  className="mt-5 w-full"
                  onClick={() => setShowCompose(true)}
                >
                  <PenSquare size={15} />
                  现在发一条
                </Button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <SidebarMetric
                  label="动态总数"
                  value={String(moments.length)}
                />
                <SidebarMetric
                  label="我的动态"
                  value={String(ownerMomentCount)}
                />
                <SidebarMetric
                  label="角色动态"
                  value={String(characterMomentCount)}
                />
                <SidebarMetric
                  label="评论总数"
                  value={String(totalCommentCount)}
                />
              </div>

              <div className="mt-5 rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white p-5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]">
                    <UserRound size={15} />
                  </div>
                  <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                    按作者查看
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {authorSummaries.slice(0, 8).map((author) => (
                    <button
                      key={author.authorId}
                      type="button"
                      onClick={() => setSelectedAuthorId(author.authorId)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition-[border-color,background-color]",
                        selectedAuthorId === author.authorId
                          ? "border-[rgba(16,185,129,0.16)] bg-[rgba(236,253,245,0.92)]"
                          : "border-[rgba(15,23,42,0.06)] bg-[rgba(248,250,252,0.98)] hover:border-[rgba(249,115,22,0.12)] hover:bg-white",
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
                          className="shrink-0 text-[color:var(--brand-primary)]"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

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

function SidebarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-white px-4 py-4 shadow-[var(--shadow-soft)]">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
        {label}
      </div>
      <div className="mt-2 text-[16px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
