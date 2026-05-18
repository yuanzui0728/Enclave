import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { ArrowLeft, PenSquare } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { MomentShareCardModal } from "../../../components/moment-share-card-modal";
import { parseTimestamp } from "../../../lib/format";
import { DesktopMomentComposePanel } from "./desktop-moment-compose-panel";
import {
  DesktopMomentRow,
  type MomentCommentReplyTarget,
} from "./desktop-moment-row";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";

type DesktopProfileMomentsWorkspaceProps = {
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingMomentId: string | null;
  commentReplyTarget?: MomentCommentReplyTarget | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  deletePendingMomentId: string | null;
  deleteErrorMessage?: string | null;
  errors?: string[];
  imageDrafts: MomentImageDraft[];
  isLoading: boolean;
  /** momentsQuery 首屏失败时的错误信息；moments=[] 时空态优先渲「重试读取」
   *  而不是「发条朋友圈」误导 CTA。跟 desktop-moments-feed Round 2 同款修复。 */
  loadErrorMessage?: string | null;
  /** 首屏失败 + 空态时空态上的「重试读取」按钮回调；profile-moments-page
   *  绑 momentsQuery.refetch。 */
  onRetryLoad?: () => void;
  likeErrorMessage?: string | null;
  likePendingMomentId: string | null;
  moments: Moment[];
  ownerAvatar?: string | null;
  ownerId: string | null;
  ownerName: string;
  showCompose: boolean;
  /** 顶部状态条文案 + tone + 可选「重试」按钮。之前桌面只接收纯字符串走死的 success 样式，
   * 点赞/评论/删除失败时也染成绿色，用户看着像操作成功了。 */
  notice?: string;
  noticeTone?: "success" | "info" | "danger";
  noticeActionLabel?: string | null;
  onNoticeAction?: (() => void) | null;
  text: string;
  videoDraft: MomentVideoDraft | null;
  isMomentFavorite: (momentId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onBack: () => void;
  onCancelCommentReply?: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onCreate: () => void;
  onDelete: (momentId: string) => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onLike: (momentId: string) => void;
  onOpenLikerPopover?: (input: {
    anchorElement: HTMLButtonElement;
    momentId: string;
    like: MomentLike;
  }) => void;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  onStartCommentReply?: (input: {
    momentId: string;
    comment: MomentComment;
  }) => void;
  onTextChange: (value: string) => void;
  onToggleFavorite: (momentId: string) => void;
  onVideoFileSelected: (file: File | null) => void;
};

export function DesktopProfileMomentsWorkspace({
  commentDrafts,
  commentErrorMessage,
  commentPendingMomentId,
  commentReplyTarget = null,
  composeErrorMessage,
  createPending,
  deletePendingMomentId,
  deleteErrorMessage,
  errors = [],
  imageDrafts,
  isLoading,
  loadErrorMessage = null,
  onRetryLoad,
  likeErrorMessage,
  likePendingMomentId,
  moments,
  ownerAvatar,
  ownerId,
  ownerName,
  showCompose,
  notice,
  noticeTone = "success",
  noticeActionLabel = null,
  onNoticeAction = null,
  text,
  videoDraft,
  isMomentFavorite,
  setShowCompose,
  onBack,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onDelete,
  onImageFilesSelected,
  onLike,
  onOpenLikerPopover,
  onRemoveImage,
  onRemoveVideo,
  onStartCommentReply,
  onTextChange,
  onToggleFavorite,
  onVideoFileSelected,
}: DesktopProfileMomentsWorkspaceProps) {
  const t = useRuntimeTranslator();
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  const [shareMomentId, setShareMomentId] = useState<string | null>(null);
  // 走查电脑端 R4：跟 desktop-moments-workspace / desktop-friend-moments-workspace
  // 同款 —— 切账户时 moments 列表整体翻新，旧 shareMomentId 找不到 →
  // ShareCardModal cardKey=null 不渲；但状态仍在 → 切回旧账户又 find 回来
  // 重新弹出"幽灵"分享卡。用 ownerId 当 reset 锚跟着账户切。
  useEffect(() => {
    setShareMomentId(null);
  }, [ownerId]);
  // 走查电脑端朋友圈 R1（本轮，新一轮）：和 desktop-moments-workspace 同款 ——
  // 切账户时 /profile/moments 路由不卸载，scrollTop 保留上个账户读 mine feed
  // 时的位置；新账户的 ownMoments 翻新后用户落在中段。scrollTo(0) 保证从
  // header banner 开始重新读自己的朋友圈。
  useEffect(() => {
    scrollViewportRef.current?.scrollTo({ top: 0 });
  }, [ownerId]);
  const shareMoment = shareMomentId
    ? moments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    ownerId && shareMoment?.likes.some((like) => like.authorId === ownerId),
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

  function renderFeedContent() {
    if (isLoading) {
      return (
        <LoadingBlock
          label={t(msg`正在加载我的朋友圈`)}
          className="rounded-[20px] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      );
    }

    if (!sortedMoments.length) {
      // momentsQuery 首屏失败时之前永远渲「还没有发布过朋友圈 / 发条朋友圈」CTA，
      // 把"读取我的朋友圈失败"包装成"你还没发过，去发一条吧"，用户被误导去
      // 发动态——但实际是 server 抓不到，再发也填不进来。跟 desktop-moments-feed
      // Round 2 (674f3dfa / desktop-feed-list) 同款：失败 + 0 条直接渲
      // 「朋友圈暂时不可用 / 重试读取」。
      if (loadErrorMessage) {
        return (
          <div className="mx-auto max-w-[560px] py-10">
            <EmptyState
              title={t(msg`朋友圈暂时不可用`)}
              description={loadErrorMessage}
              action={
                onRetryLoad ? (
                  <Button variant="primary" onClick={onRetryLoad}>
                    {t(msg`重试读取`)}
                  </Button>
                ) : undefined
              }
            />
          </div>
        );
      }
      return (
        <div className="mx-auto max-w-[560px] py-10">
          <EmptyState
            title={t(msg`还没有发布过朋友圈`)}
            description={t(msg`记录此刻，你的朋友圈会出现在这里。`)}
            action={
              <Button variant="primary" onClick={() => setShowCompose(true)}>
                {t(msg`发条朋友圈`)}
              </Button>
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
            commentDraft={commentDrafts[moment.id] ?? ""}
            commentLoading={commentPendingMomentId === moment.id}
            commentReplyTarget={
              commentReplyTarget?.postId === moment.id
                ? commentReplyTarget
                : null
            }
            deleteLoading={deletePendingMomentId === moment.id}
            likeLoading={likePendingMomentId === moment.id}
            moment={moment}
            ownerId={ownerId}
            favorite={isMomentFavorite(moment.id)}
            onCancelCommentReply={onCancelCommentReply}
            onCommentChange={(value) => onCommentChange(moment.id, value)}
            onCommentSubmit={() => onCommentSubmit(moment.id)}
            onDelete={() => onDelete(moment.id)}
            onLike={() => onLike(moment.id)}
            onShare={() => setShareMomentId(moment.id)}
            onStartCommentReply={
              onStartCommentReply
                ? (comment) =>
                    onStartCommentReply({
                      momentId: comment.postId,
                      comment,
                    })
                : undefined
            }
            onSelectLiker={
              onOpenLikerPopover
                ? (event, like) =>
                    onOpenLikerPopover({
                      anchorElement: event.currentTarget,
                      momentId: moment.id,
                      like,
                    })
                : undefined
            }
            onToggleFavorite={() => onToggleFavorite(moment.id)}
          />
        ))}
      </div>
    );
  }

  const displayName = ownerName?.trim() || t(msg`世界主人`);

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-4">
              <button
                type="button"
                onClick={onBack}
                aria-label={t(msg`返回上一页`)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
              >
                <ArrowLeft size={17} />
              </button>
              <div className="text-[15px] font-semibold text-[color:var(--text-primary)]">
                {t(msg`我的朋友圈`)}
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCompose(true)}
                className="shrink-0"
              >
                <PenSquare size={14} className="mr-1.5" />
                {t(msg`发朋友圈`)}
              </Button>
            </div>
          </div>

          {/* 走查 R5：notice / errors 之前嵌在 scrollViewportRef 内部 cover 之
              下、moments 之上。用户滚到第 N 条 own moment 上 like / comment /
              delete / share，成功 / 失败 toast 都触发在 cover 下方 —— 已经滚到
              第 N 条的用户看不见，体感"我点了但没反应"。和 desktop-moments-workspace
              的 toolbar 把 notice 挂在 scroll viewport *外* 的模式对齐：抽到
              header bar 下、scroll viewport 上的独立条带里，跨页统一"无论滚到哪
              toast 都看得到"。整段在四种来源都为空时整块不渲染（不留空白栏）。 */}
          {notice ||
          errors.length > 0 ||
          (likeErrorMessage && !(notice && noticeTone === "danger")) ||
          (commentErrorMessage && !(notice && noticeTone === "danger")) ||
          (deleteErrorMessage && !(notice && noticeTone === "danger")) ? (
            <div className="border-b border-[color:var(--border-faint)] bg-white/82 px-6 py-3 backdrop-blur-xl">
              <div className="mx-auto w-full max-w-[760px] space-y-3">
                {notice ? (
                  <InlineNotice
                    tone={noticeTone}
                    className="border-[color:var(--border-faint)] bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0 flex-1">{notice}</span>
                      {noticeActionLabel && onNoticeAction ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={onNoticeAction}
                          className="shrink-0 border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                        >
                          {noticeActionLabel}
                        </Button>
                      ) : null}
                    </div>
                  </InlineNotice>
                ) : null}

                {errors.length > 0
                  ? errors.map((message, index) => (
                      <ErrorBlock
                        key={`${message}-${index}`}
                        message={message}
                      />
                    ))
                  : null}

                {/* profile-moments-page 失败时同时打开两路：notice.tone="danger" 红条 + 这里
                    的 ErrorBlock。两条红条同文显示让用户感觉"系统连发两次错误"。先级
                    danger notice：在屏时把 type-specific ErrorBlock 藏起来；notice 自清后
                    ErrorBlock 仍可做持久指示。 */}
                {likeErrorMessage && !(notice && noticeTone === "danger") ? (
                  <ErrorBlock message={likeErrorMessage} />
                ) : null}

                {commentErrorMessage && !(notice && noticeTone === "danger") ? (
                  <ErrorBlock message={commentErrorMessage} />
                ) : null}

                {deleteErrorMessage && !(notice && noticeTone === "danger") ? (
                  <ErrorBlock message={deleteErrorMessage} />
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto"
          >
            <section
              className="relative w-full bg-[rgba(245,248,247,0.96)]"
              style={{ height: 290 }}
            >
              <div
                className="absolute inset-x-0 top-0 overflow-hidden bg-[linear-gradient(135deg,#34a853_0%,#0f8b3a_55%,#085c25_100%)]"
                style={{ height: 260 }}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,0.32),transparent_60%)]" />
              </div>
              <div className="absolute bottom-7 right-8 flex items-end gap-4">
                <div className="text-right text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]">
                  <div className="text-[18px] font-medium leading-tight">
                    {displayName}
                  </div>
                </div>
                <div className="translate-y-7">
                  <AvatarChip name={displayName} src={ownerAvatar} size="lg" />
                </div>
              </div>
            </section>

            <div className="mx-auto w-full max-w-[760px] px-7 pb-10 pt-12">
              {renderFeedContent()}
            </div>
          </div>
        </div>
      </section>

      {showCompose ? (
        <DesktopMomentComposePanel
          createPending={createPending}
          canAddImages={imageDrafts.length < 9 && !videoDraft}
          canAddVideo={!imageDrafts.length}
          errorMessage={composeErrorMessage}
          imageDrafts={imageDrafts}
          ownerAvatar={ownerAvatar}
          ownerUsername={displayName}
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

      <MomentShareCardModal
        moment={shareMoment}
        liked={shareLiked}
        ownerId={ownerId}
        ownerDisplayName={displayName}
        onClose={() => setShareMomentId(null)}
      />
    </div>
  );
}
