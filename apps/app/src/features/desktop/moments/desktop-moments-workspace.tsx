import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { MomentShareCardModal } from "../../../components/moment-share-card-modal";
import { DesktopMomentComposePanel } from "./desktop-moment-compose-panel";
import { DesktopMomentsFeed } from "./desktop-moments-feed";
import { type MomentCommentReplyTarget } from "./desktop-moment-row";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";
import { DesktopMomentsToolbar } from "./desktop-moments-toolbar";

const t = translateRuntimeMessage;

type DesktopMomentsWorkspaceProps = {
  commentDrafts: Record<string, string>;
  commentErrorMessage?: string | null;
  commentPendingMomentId: string | null;
  commentReplyTarget?: MomentCommentReplyTarget | null;
  composeErrorMessage?: string | null;
  createPending: boolean;
  deletePendingMomentId?: string | null;
  deleteErrorMessage?: string | null;
  errors?: string[];
  imageDrafts: MomentImageDraft[];
  isLoading: boolean;
  /** momentsQuery 首屏失败的错误信息；moments=[] 时空态优先渲「重试读取」
   *  而不是「发朋友圈」误导 CTA。 */
  loadErrorMessage?: string | null;
  likeErrorMessage?: string | null;
  likePendingMomentId: string | null;
  moments: Moment[];
  /**
   * 服务端 MomentsPageResponse.total —— auto-prefetch 没跑完时 moments.length
   * 只是「已加载」，不能当总数显示。null 表示还没拿到首页响应。
   */
  totalCount?: number | null;
  /** 走查 R3：后端给了 N 条 moment 但前端 visibleMoments 全被屏蔽过滤掉时，
   *  desktop-moments-feed 改走「正在寻找未屏蔽的动态」/「朋友圈都被你屏蔽了」
   *  分支，不再误导用户去发朋友圈。和 mobile MomentsView 同模板。 */
  hasFilteredOutMoments?: boolean;
  /** auto-prefetch 是否还有下一页可拉 —— 用来区分「屏蔽态：还在翻」与「翻完了」。 */
  hasNextPage?: boolean;
  /** 「打开通讯录」按钮回调——「朋友圈都被你屏蔽了」分支挂在里头。 */
  onOpenContacts?: () => void;
  ownerAvatar?: string | null;
  ownerId?: string | null;
  ownerUsername?: string | null;
  scrollToMomentId?: string | null;
  showCompose: boolean;
  /** 状态条文案 + tone + 可选「重试」按钮。之前桌面只接收纯字符串，
   * mutation 失败走 danger tone 时被 toolbar 写死的 success 颜色冒充成「已生效」。 */
  notice?: string;
  noticeTone?: "success" | "info" | "danger";
  noticeActionLabel?: string | null;
  onNoticeAction?: (() => void) | null;
  text: string;
  videoDraft: MomentVideoDraft | null;
  isMomentFavorite: (momentId: string) => boolean;
  setShowCompose: (nextValue: boolean) => void;
  onCancelCommentReply?: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  onCreate: () => void;
  onDeleteMoment?: (momentId: string) => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onLike: (momentId: string) => void;
  onOpenAuthorPopover?: (input: {
    anchorElement: HTMLButtonElement;
    moment: Moment;
  }) => void;
  onOpenLikerPopover?: (input: {
    anchorElement: HTMLButtonElement;
    moment: Moment;
    like: MomentLike;
  }) => void;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  onStartCommentReply?: (input: {
    momentId: string;
    comment: MomentComment;
  }) => void;
  onToggleFavorite: (momentId: string) => void;
  onRefresh: () => void;
  /** 走查新 R1：手动刷新 in-flight 时把按钮置 disabled，避免连点触发多次
   *  GET /api/moments?page=1（公网 600ms RTT 下连点 5 次 = 5 个 RTT 浪费）。 */
  refreshPending?: boolean;
  /** 当前账户存在朋友圈草稿 → 顶栏「发朋友圈」按钮挂红点。 */
  hasMomentDraft?: boolean;
  onTextChange: (value: string) => void;
  onVideoFileSelected: (file: File | null) => void;
};

export function DesktopMomentsWorkspace({
  commentDrafts,
  commentErrorMessage,
  commentPendingMomentId,
  commentReplyTarget = null,
  composeErrorMessage,
  createPending,
  deletePendingMomentId = null,
  deleteErrorMessage,
  errors = [],
  imageDrafts,
  isLoading,
  loadErrorMessage = null,
  likeErrorMessage,
  likePendingMomentId,
  moments,
  totalCount = null,
  hasFilteredOutMoments = false,
  hasNextPage = false,
  onOpenContacts,
  ownerAvatar,
  ownerId,
  ownerUsername,
  scrollToMomentId = null,
  showCompose,
  notice,
  noticeTone = "success",
  noticeActionLabel = null,
  onNoticeAction = null,
  text,
  videoDraft,
  isMomentFavorite,
  setShowCompose,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onCreate,
  onDeleteMoment,
  onImageFilesSelected,
  onLike,
  onOpenAuthorPopover,
  onOpenLikerPopover,
  onRemoveImage,
  onRemoveVideo,
  onStartCommentReply,
  onToggleFavorite,
  onRefresh,
  refreshPending = false,
  hasMomentDraft = false,
  onTextChange,
  onVideoFileSelected,
}: DesktopMomentsWorkspaceProps) {
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);

  // 「分享图卡」目标 — 只存 id，moments 后续刷新时预览图也跟着新。
  const [shareMomentId, setShareMomentId] = useState<string | null>(null);
  // 走查电脑端 R4：mobile 路径 (moments-page.tsx 行 2118-2120) 早就在
  // baseUrl 变化时把 shareMomentId 清掉了；桌面这套 3 个 workspace 都漏。
  // 后果：用户在账户 A 开着分享卡片，切到 B（同窗口 / Tauri 桌面 / 浏览器同
  // 标签换世界），B 的 moments 里找不到 A 那条 → ShareCardModal cardKey=null
  // 不渲染但 shareMomentId 状态仍是 A 的 id；用户再切回 A，A 的 moments 把
  // 那条 find 回来 → 分享卡片"幽灵"重新弹出，体感是"我没点为啥又冒出来"。
  // 用 ownerId 当 reset 锚（每次切账户都换），跟着 [ownerId] 翻转一次即可。
  useEffect(() => {
    setShareMomentId(null);
  }, [ownerId]);
  // 走查电脑端朋友圈 R1（本轮，新一轮）：cloud-console 切账户时 baseUrl 翻新但
  // /tabs/moments 路由不卸载——DesktopMomentsWorkspace 同一实例继续挂着，
  // scrollViewportRef 的 scrollTop 保留旧账户读到第 N 条时的位置；新账户的
  // visibleMoments 重 fetch（首屏 ~20 条 + auto-prefetch 串到 ~240 条），中间
  // scrollHeight 短暂变小被 browser clamp 又变大，用户落在新账户列表中段、
  // 偶尔甚至落在 LoadingBlock 下方的空白区。和 mobileScrollSnappedRouteIdRef
  // 在 moments-page 切账户时复位的思路对齐，把 scrollViewportRef.scrollTo(0)
  // 一并加上，确保切账户后新账户的朋友圈从顶部开始读。本轮三个 workspace
  // (main / friend / profile) 一起修。
  useEffect(() => {
    scrollViewportRef.current?.scrollTo({ top: 0 });
  }, [ownerId]);
  const shareMoment = shareMomentId
    ? moments.find((moment) => moment.id === shareMomentId) ?? null
    : null;
  const shareLiked = Boolean(
    ownerId && shareMoment?.likes.some((like) => like.authorId === ownerId),
  );
  const shareOwnerName = ownerUsername?.trim() || t(msg`世界主人`);

  // 每个 scrollToMomentId 只滚一次：之前依赖 [moments, scrollToMomentId]，
  // 用户每点一次赞/发一条评论 → optimistic 让 moments 数组换新 → effect 重跑
  // smooth-scroll 把用户拉回到该 moment，体感像"被吸住"。改成 ref 记录已滚过
  // 的 id，moments 后续变更不再触发滚动；用户切换到另一个 momentId（hash 变）
  // 时再滚一次。
  const lastScrolledIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!scrollToMomentId || typeof document === "undefined") {
      return;
    }
    if (lastScrolledIdRef.current === scrollToMomentId) {
      return;
    }
    if (!moments.some((moment) => moment.id === scrollToMomentId)) {
      // 目标还没出现在已加载分页里，等 moments 更新再尝试。
      return;
    }
    lastScrolledIdRef.current = scrollToMomentId;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`desktop-moment-post-${scrollToMomentId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [moments, scrollToMomentId]);
  useEffect(() => {
    if (!scrollToMomentId) {
      lastScrolledIdRef.current = null;
    }
  }, [scrollToMomentId]);

  return (
    <div className="relative flex h-full min-h-0 bg-[rgba(244,247,246,0.98)]">
      <section className="min-w-0 flex-1 bg-[rgba(245,248,247,0.96)]">
        <div className="flex h-full min-h-0 flex-col">
          <DesktopMomentsToolbar
            commentErrorMessage={commentErrorMessage}
            deleteErrorMessage={deleteErrorMessage}
            errors={errors}
            likeErrorMessage={likeErrorMessage}
            notice={notice}
            noticeTone={noticeTone}
            noticeActionLabel={noticeActionLabel}
            onNoticeAction={onNoticeAction}
            loadedCount={moments.length}
            totalCount={totalCount}
            onBackToTop={() => {
              scrollViewportRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
              });
            }}
            onOpenCompose={() => setShowCompose(true)}
            onRefresh={onRefresh}
            refreshPending={refreshPending}
            hasMomentDraft={hasMomentDraft}
          />

          <div
            ref={scrollViewportRef}
            className="min-h-0 flex-1 overflow-auto px-7 py-6"
          >
            <div className="mx-auto w-full max-w-[760px]">
              <DesktopMomentsFeed
                commentDrafts={commentDrafts}
                commentPendingMomentId={commentPendingMomentId}
                commentReplyTarget={commentReplyTarget}
                deletePendingMomentId={deletePendingMomentId}
                isLoading={isLoading}
                loadErrorMessage={loadErrorMessage}
                likePendingMomentId={likePendingMomentId}
                moments={moments}
                hasFilteredOutMoments={hasFilteredOutMoments}
                hasNextPage={hasNextPage}
                onOpenContacts={onOpenContacts}
                ownerId={ownerId}
                isMomentFavorite={isMomentFavorite}
                onCancelCommentReply={onCancelCommentReply}
                onCommentChange={onCommentChange}
                onCommentSubmit={onCommentSubmit}
                onDeleteMoment={onDeleteMoment}
                onLike={onLike}
                onShare={(momentId) => setShareMomentId(momentId)}
                onStartCommentReply={
                  onStartCommentReply
                    ? (comment) =>
                        onStartCommentReply({
                          momentId: comment.postId,
                          comment,
                        })
                    : undefined
                }
                onToggleFavorite={onToggleFavorite}
                onOpenCompose={() => setShowCompose(true)}
                onRetryLoad={onRefresh}
                onSelectAuthor={onOpenAuthorPopover}
                onSelectLiker={onOpenLikerPopover}
              />
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

      <MomentShareCardModal
        moment={shareMoment}
        liked={shareLiked}
        ownerId={ownerId ?? null}
        ownerDisplayName={shareOwnerName}
        onClose={() => setShareMomentId(null)}
      />
    </div>
  );
}
