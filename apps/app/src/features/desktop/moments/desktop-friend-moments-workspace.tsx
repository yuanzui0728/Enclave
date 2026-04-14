import { useEffect, useMemo, useRef, useState } from "react";
import { type Character, type Moment } from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import {
  ArrowLeft,
  Clock3,
  MessageCircle,
  Newspaper,
  UserRound,
} from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { formatTimestamp, parseTimestamp } from "../../../lib/format";
import {
  type DesktopFriendMomentsRouteState,
} from "./desktop-friend-moments-route-state";
import { DesktopMomentComposePanel } from "./desktop-moment-compose-panel";
import { DesktopMomentDetailPanel } from "./desktop-moment-detail-panel";
import { DesktopMomentRow } from "./desktop-moment-row";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";

type DesktopFriendMomentsWorkspaceProps = {
  character: Character;
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingMomentId: string | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  displayName: string;
  errors?: string[];
  imageDrafts: MomentImageDraft[];
  isBlocked?: boolean;
  isFriend?: boolean;
  isLoading: boolean;
  likeErrorMessage?: string | null;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerAvatar?: string | null;
  ownerId?: string | null;
  ownerUsername?: string | null;
  routeSelectedMomentId?: string | null;
  showCompose: boolean;
  signature: string;
  successNotice?: string;
  text: string;
  videoDraft: MomentVideoDraft | null;
  isMomentFavorite: (momentId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onBack: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onCreate: () => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onLike: (momentId: string) => void;
  onOpenMomentsHome: () => void;
  onOpenProfile: () => void;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  onRouteStateChange?: (state: DesktopFriendMomentsRouteState) => void;
  onTextChange: (value: string) => void;
  onToggleFavorite: (momentId: string) => void;
  onVideoFileSelected: (file: File | null) => void;
};

export function DesktopFriendMomentsWorkspace({
  character,
  commentDrafts,
  commentErrorMessage,
  commentPendingMomentId,
  composeErrorMessage,
  createPending,
  displayName,
  errors = [],
  imageDrafts,
  isBlocked = false,
  isFriend = true,
  isLoading,
  likeErrorMessage,
  likePendingMomentId,
  moments,
  ownerAvatar,
  ownerId,
  ownerUsername,
  routeSelectedMomentId = null,
  showCompose,
  signature,
  successNotice,
  text,
  videoDraft,
  isMomentFavorite,
  setShowCompose,
  onBack,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onImageFilesSelected,
  onLike,
  onOpenMomentsHome,
  onOpenProfile,
  onRemoveImage,
  onRemoveVideo,
  onRouteStateChange,
  onTextChange,
  onToggleFavorite,
  onVideoFileSelected,
}: DesktopFriendMomentsWorkspaceProps) {
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(
    routeSelectedMomentId,
  );

  const sortedMoments = useMemo(
    () =>
      [...moments].sort(
        (left, right) =>
          (parseTimestamp(right.postedAt) ?? 0) -
          (parseTimestamp(left.postedAt) ?? 0),
      ),
    [moments],
  );
  const selectedMoment = useMemo(
    () =>
      sortedMoments.find((moment) => moment.id === selectedMomentId) ?? null,
    [selectedMomentId, sortedMoments],
  );
  const totalLikeCount = useMemo(
    () => sortedMoments.reduce((total, moment) => total + moment.likeCount, 0),
    [sortedMoments],
  );
  const totalCommentCount = useMemo(
    () => sortedMoments.reduce((total, moment) => total + moment.commentCount, 0),
    [sortedMoments],
  );
  const latestMoment = sortedMoments[0] ?? null;
  const recentMoments = sortedMoments.slice(0, 5);

  useEffect(() => {
    setSelectedMomentId((current) =>
      current === routeSelectedMomentId ? current : routeSelectedMomentId,
    );
  }, [routeSelectedMomentId]);

  useEffect(() => {
    if (
      selectedMomentId &&
      !sortedMoments.some((moment) => moment.id === selectedMomentId)
    ) {
      setSelectedMomentId(null);
    }
  }, [selectedMomentId, sortedMoments]);

  useEffect(() => {
    onRouteStateChange?.({
      momentId: selectedMomentId ?? undefined,
    });
  }, [onRouteStateChange, selectedMomentId]);

  function renderFeedContent() {
    if (isLoading) {
      return (
        <LoadingBlock
          label="正在读取这位好友的朋友圈..."
          className="rounded-[20px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      );
    }

    if (!sortedMoments.length) {
      return (
        <div className="mx-auto max-w-[560px] py-10">
          <EmptyState
            title={
              isFriend
                ? isBlocked
                  ? "这位好友的朋友圈当前不可见"
                  : `${displayName} 还没有发表朋友圈`
                : "只有好友才能查看这位角色的朋友圈"
            }
            description={
              isFriend
                ? isBlocked
                  ? "你已经将这位好友加入黑名单，相关朋友圈内容会先隐藏。"
                  : "后续有新动态时，会直接显示在这个独立页面里。"
                : "先加为好友，再像微信电脑版那样进入 TA 的朋友圈独立页。"
            }
            action={
              <div className="flex items-center justify-center gap-2">
                <Button variant="secondary" onClick={onOpenProfile}>
                  查看资料
                </Button>
                <Button variant="primary" onClick={onOpenMomentsHome}>
                  返回朋友圈
                </Button>
              </div>
            }
          />
        </div>
      );
    }

    return (
      <div className="space-y-4 pb-6">
        {sortedMoments.map((moment) => (
          <DesktopMomentRow
            key={moment.id}
            active={moment.id === selectedMomentId}
            authorActionAriaLabel={`查看 ${displayName} 的资料`}
            commentDraft={commentDrafts[moment.id] ?? ""}
            commentLoading={commentPendingMomentId === moment.id}
            likeLoading={likePendingMomentId === moment.id}
            moment={moment}
            ownerId={ownerId}
            favorite={isMomentFavorite(moment.id)}
            onCommentChange={(value) => onCommentChange(moment.id, value)}
            onCommentSubmit={() => onCommentSubmit(moment.id)}
            onLike={() => onLike(moment.id)}
            onOpenDetail={() => setSelectedMomentId(moment.id)}
            onSelectAuthor={onOpenProfile}
            onToggleFavorite={() => onToggleFavorite(moment.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 border-r border-[color:var(--border-faint)] bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-5 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[760px] items-start justify-between gap-5">
              <div className="flex min-w-0 items-start gap-4">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="返回上一页"
                  className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
                >
                  <ArrowLeft size={17} />
                </button>
                <AvatarChip
                  name={displayName}
                  src={character.avatar}
                  size="wechat"
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                    好友朋友圈
                  </div>
                  <div className="mt-1 truncate text-[20px] font-semibold text-[color:var(--text-primary)]">
                    {displayName}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                    {signature}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1">
                      <Newspaper size={13} />
                      {sortedMoments.length} 条动态
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1">
                      <MessageCircle size={13} />
                      {totalCommentCount} 条评论
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1">
                      <Clock3 size={13} />
                      {latestMoment
                        ? `最近更新 ${formatTimestamp(latestMoment.postedAt)}`
                        : "暂未更新"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={onOpenProfile}>
                  查看资料
                </Button>
                <Button variant="secondary" size="sm" onClick={onOpenMomentsHome}>
                  返回朋友圈
                </Button>
                <Button variant="primary" size="sm" onClick={() => setShowCompose(true)}>
                  发朋友圈
                </Button>
              </div>
            </div>
          </div>

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-7 py-6"
          >
            <div className="mx-auto w-full max-w-[760px]">
              {successNotice ? (
                <div className="mb-4">
                  <InlineNotice
                    tone="success"
                    className="border-[color:var(--border-faint)] bg-white"
                  >
                    {successNotice}
                  </InlineNotice>
                </div>
              ) : null}

              {errors.length > 0 ? (
                <div className="mb-4 space-y-3">
                  {errors.map((message, index) => (
                    <ErrorBlock key={`${message}-${index}`} message={message} />
                  ))}
                </div>
              ) : null}

              {likeErrorMessage ? (
                <div className="mb-4">
                  <ErrorBlock message={likeErrorMessage} />
                </div>
              ) : null}

              {commentErrorMessage ? (
                <div className="mb-4">
                  <ErrorBlock message={commentErrorMessage} />
                </div>
              ) : null}

              {renderFeedContent()}
            </div>
          </div>
        </div>
      </section>

      <aside className="flex w-[336px] shrink-0 flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,249,0.92)]">
        {selectedMoment ? (
          <DesktopMomentDetailPanel
            authorActionAriaLabel={`查看 ${displayName} 的资料`}
            authorActionLabel="查看资料"
            commentDraft={commentDrafts[selectedMoment.id] ?? ""}
            commentLoading={commentPendingMomentId === selectedMoment.id}
            favorite={isMomentFavorite(selectedMoment.id)}
            likeLoading={likePendingMomentId === selectedMoment.id}
            moment={selectedMoment}
            ownerId={ownerId}
            onClose={() => setSelectedMomentId(null)}
            onCommentChange={(value) => onCommentChange(selectedMoment.id, value)}
            onCommentSubmit={() => onCommentSubmit(selectedMoment.id)}
            onLike={() => onLike(selectedMoment.id)}
            onSelectAuthor={onOpenProfile}
            onToggleFavorite={() => onToggleFavorite(selectedMoment.id)}
          />
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[color:var(--border-faint)] bg-white/72 px-5 py-4 backdrop-blur-xl">
              <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
                独立页概览
              </div>
              <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
                当前只看 {displayName} 的朋友圈
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
              <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <div className="flex items-center gap-4">
                  <AvatarChip
                    name={displayName}
                    src={character.avatar}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-[color:var(--text-primary)]">
                      {displayName}
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-[12px] text-[color:var(--text-secondary)]">
                      <UserRound size={13} />
                      {character.relationship?.trim() || "好友"}
                    </div>
                    <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                      {latestMoment
                        ? `最近发布于 ${formatTimestamp(latestMoment.postedAt)}`
                        : "当前还没有朋友圈动态。"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <SidebarMetric
                    label="动态"
                    value={String(sortedMoments.length)}
                  />
                  <SidebarMetric
                    label="获赞"
                    value={String(totalLikeCount)}
                  />
                  <SidebarMetric
                    label="评论"
                    value={String(totalCommentCount)}
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={onOpenMomentsHome}
                  >
                    朋友圈主页
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={onOpenProfile}
                  >
                    查看资料
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-[18px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-section)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[14px] font-semibold text-[color:var(--text-primary)]">
                    最近动态
                  </div>
                  <div className="text-[12px] text-[color:var(--text-muted)]">
                    {recentMoments.length} 条
                  </div>
                </div>

                {recentMoments.length > 0 ? (
                  <div className="mt-3 space-y-2.5">
                    {recentMoments.map((moment) => (
                      <button
                        key={moment.id}
                        type="button"
                        onClick={() => setSelectedMomentId(moment.id)}
                        className={cn(
                          "w-full rounded-[14px] border px-3.5 py-3 text-left transition-[background-color,border-color]",
                          selectedMomentId === moment.id
                            ? "border-[rgba(7,193,96,0.12)] bg-white shadow-[inset_3px_0_0_0_var(--brand-primary),0_8px_18px_rgba(15,23,42,0.04)]"
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
                ) : (
                  <div className="mt-3 rounded-[14px] border border-dashed border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-4 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                    暂时还没有可展开的朋友圈内容。
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

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

function SidebarMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-3">
      <div className="text-[11px] text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
