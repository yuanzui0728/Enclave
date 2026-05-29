import { msg } from "@lingui/macro";
import {
  type Moment,
  type MomentComment,
  type MomentLike,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import {
  DesktopMomentRow,
  type MomentCommentReplyTarget,
} from "./desktop-moment-row";

type DesktopMomentsFeedProps = {
  commentDrafts: Record<string, string>;
  commentPendingMomentId: string | null;
  commentReplyTarget?: MomentCommentReplyTarget | null;
  deletePendingMomentId?: string | null;
  isLoading: boolean;
  /** momentsQuery 首屏失败的错误信息；空 = 没失败。moments.length===0 时优先
   *  渲「朋友圈暂时不可用 / 重试读取」而不是「还很安静 / 发朋友圈」CTA —
   *  跟 desktop-feed-list Round 2 (674f3dfa) 同类修复。 */
  loadErrorMessage?: string | null;
  likePendingMomentId: string | null;
  moments: Moment[];
  /** 走查 R3：后端给了 N 条 moment 但前端全被 blockedCharacterIds 过滤掉时，
   *  之前桌面只看 moments.length===0 直接走「朋友圈还很安静 / 发一条朋友圈」CTA，
   *  把"全被你拉黑了"误导成"还没有人发朋友圈"，用户被推去发动态填补"空空的"
   *  feed。移动端 MobileMomentsView 一直按 hasFilteredOutMoments 切到「正在寻找
   *  未屏蔽的动态」/「朋友圈都被你屏蔽了 / 打开通讯录」分支，桌面这里漏了。
   *  传 hasFilteredOutMoments + 还在 prefetch 的 hasNextPage + onOpenContacts
   *  让桌面跟齐 mobile 的两条分支。 */
  hasFilteredOutMoments?: boolean;
  hasNextPage?: boolean;
  onOpenContacts?: () => void;
  ownerId?: string | null;
  isMomentFavorite: (momentId: string) => boolean;
  onCancelCommentReply?: () => void;
  onCommentChange: (momentId: string, value: string) => void;
  onCommentSubmit: (momentId: string) => void;
  /** 删除自己的朋友圈；只有 moment.authorType==='user' && moment.authorId===ownerId 时 feed 会把它接到行内菜单。 */
  onDeleteMoment?: (momentId: string) => void;
  onLike: (momentId: string) => void;
  /** 可选：点击行内「分享」时上抛，由调用方弹出分享图卡。 */
  onShare?: (momentId: string) => void;
  onStartCommentReply?: (comment: MomentComment) => void;
  onToggleFavorite: (momentId: string) => void;
  onOpenCompose: () => void;
  /** 错误空态上的「重试读取」按钮回调。复用 workspace 的 onRefresh —— 走
   *  resetMomentsToFirstPage + refetch。 */
  onRetryLoad?: () => void;
  onSelectAuthor?: (input: {
    anchorElement: HTMLButtonElement;
    moment: Moment;
  }) => void;
  onSelectLiker?: (input: {
    anchorElement: HTMLButtonElement;
    moment: Moment;
    like: MomentLike;
  }) => void;
};

export function DesktopMomentsFeed({
  commentDrafts,
  commentPendingMomentId,
  commentReplyTarget = null,
  deletePendingMomentId = null,
  isLoading,
  loadErrorMessage = null,
  likePendingMomentId,
  moments,
  hasFilteredOutMoments = false,
  hasNextPage = false,
  onOpenContacts,
  ownerId,
  isMomentFavorite,
  onCancelCommentReply,
  onCommentChange,
  onCommentSubmit,
  onDeleteMoment,
  onLike,
  onShare,
  onStartCommentReply,
  onToggleFavorite,
  onOpenCompose,
  onRetryLoad,
  onSelectAuthor,
  onSelectLiker,
}: DesktopMomentsFeedProps) {
  const t = useRuntimeTranslator();
  return (
    <>
      {isLoading ? (
        <LoadingBlock
          label={t(msg`正在读取朋友圈...`)}
          className="rounded-[var(--radius-lg)] border-[color:var(--border-faint)] bg-white py-10 shadow-[var(--shadow-section)]"
        />
      ) : null}

      {!isLoading && moments.length > 0 ? (
        <div className="space-y-4 pb-6">
          {moments.map((moment) => (
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
              onDelete={
                onDeleteMoment &&
                ownerId &&
                moment.authorType === "user" &&
                moment.authorId === ownerId
                  ? () => onDeleteMoment(moment.id)
                  : undefined
              }
              onLike={() => onLike(moment.id)}
              onShare={onShare ? () => onShare(moment.id) : undefined}
              onStartCommentReply={onStartCommentReply}
              onToggleFavorite={() => onToggleFavorite(moment.id)}
              onSelectAuthor={
                // 新走查 R2：之前只 character 接 onSelectAuthor，own user moment
                // 的 avatar 完全没接 → 用户点自己头像无反应。Mobile MobileMomentsView
                // 的 onAuthorTap 一直按 user+ownerId 跳 /profile/moments，桌面这边
                // 漏接。这里给两种 authorType 都接上，parent (moments-page) 在
                // onOpenAuthorPopover 里按 authorType 分流（character → friend-moments
                // 工作区；user → owner popover）。
                onSelectAuthor
                  ? (event) =>
                      onSelectAuthor({
                        anchorElement: event.currentTarget,
                        moment,
                      })
                  : undefined
              }
              onSelectLiker={
                onSelectLiker
                  ? (event, like) =>
                      onSelectLiker({
                        anchorElement: event.currentTarget,
                        moment,
                        like,
                      })
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}

      {!isLoading && !moments.length ? (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-[560px] items-center justify-center py-10">
          {/* momentsQuery 首屏失败时之前永远渲「朋友圈还很安静 / 发朋友圈」CTA，
              把"服务端读取失败"包装成"朋友圈是空的，发一条吧"，用户被引导
              去发动态填补"空 feed"——但其实是 server 抓不到。toolbar ErrorBlock
              虽然显示了错误，但用户视线先落在中央 CTA 上很容易忽略。跟 feed
              workspace Round 2 (674f3dfa) 同类修复：失败 + 0 条时空态直接渲
              「朋友圈暂时不可用 / 重试读取」。 */}
          {loadErrorMessage ? (
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
          ) : hasFilteredOutMoments ? (
            // 走查 R3：后端有 N 条 moment 但全被 blockedCharacterIds 过滤掉。
            // 还在 auto-prefetch（hasNextPage=true）→ 当前页都是被屏蔽角色，
            // 给「正在寻找未屏蔽的动态」文案让用户知道在等什么；prefetch 跑完
            // 仍然 0 → 给「朋友圈都被你屏蔽了 / 打开通讯录」让用户能去解除屏蔽。
            // 跟 MobileMomentsView 同分支模板。
            hasNextPage ? (
              <EmptyState
                title={t(msg`正在寻找未屏蔽的动态`)}
                description={t(msg`当前页加载到的动态作者都在你的屏蔽名单里，正在自动翻下一页找未屏蔽的居民动态。`)}
              />
            ) : (
              <EmptyState
                title={t(msg`朋友圈都被你屏蔽了`)}
                description={t(msg`已加载的动态作者全部在你的屏蔽名单里。去通讯录里解除屏蔽，或者等其他居民发布新动态。`)}
                action={
                  onOpenContacts ? (
                    <Button variant="primary" onClick={onOpenContacts}>
                      {t(msg`打开通讯录`)}
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <EmptyState
              title={t(msg`朋友圈还很安静`)}
              description={t(msg`你先发一条，或者等世界里的其他人先开口。`)}
              action={
                <Button variant="primary" onClick={onOpenCompose}>
                  {t(msg`发朋友圈`)}
                </Button>
              }
            />
          )}
        </div>
      ) : null}
    </>
  );
}
