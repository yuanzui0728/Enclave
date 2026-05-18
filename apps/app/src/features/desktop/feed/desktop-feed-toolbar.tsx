import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice } from "@yinjie/ui";
import { ArrowUp, PenSquare, RefreshCcw } from "lucide-react";

type DesktopFeedToolbarProps = {
  commentErrorMessage?: string | null;
  errors?: string[];
  likeErrorMessage?: string | null;
  successNotice?: string;
  loadedCount: number;
  /** 服务端汇报的总数；不传或 < loadedCount 时按 loadedCount 显示。 */
  serverTotal?: number;
  /** 是否还有下一页未拉；用来在「已经到底」时把 toolbar 的数量文案从
   *  「已加载 X / 共 Y」收敛到「共 X」，避免被屏蔽过滤吃掉的差额一直挂在
   *  顶部看着像「还有 N 条没拉」。 */
  hasNextPage?: boolean;
  onBackToTop: () => void;
  onOpenCompose: () => void;
  /** 「重试发送」点击；为空时退化成纯 ErrorBlock（不显示按钮）。 */
  onRetryComment?: () => void;
  /** 「重试点赞」点击；为空时退化成纯 ErrorBlock。 */
  onRetryLike?: () => void;
  onRefresh: () => void;
};

export function DesktopFeedToolbar({
  commentErrorMessage,
  errors = [],
  likeErrorMessage,
  successNotice,
  loadedCount,
  serverTotal,
  hasNextPage = false,
  onBackToTop,
  onOpenCompose,
  onRetryComment,
  onRetryLike,
  onRefresh,
}: DesktopFeedToolbarProps) {
  const t = useRuntimeTranslator();
  return (
    <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-6 py-4 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
              {t(msg`广场动态`)}
            </div>
            <div className="mt-1 text-[18px] font-semibold text-[color:var(--text-primary)]">
              {t(msg`世界公开流`)}
            </div>
            <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
              {t(msg`这里不只看朋友，世界主人和居民的公开发言都会进入这条流。`)}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              <RefreshCcw size={14} />
              {t(msg`刷新`)}
            </Button>
            <Button variant="secondary" size="sm" onClick={onBackToTop}>
              <ArrowUp size={14} />
              {t(msg`回到顶部`)}
            </Button>
            <Button variant="primary" size="sm" onClick={onOpenCompose}>
              <PenSquare size={14} />
              {t(msg`发动态`)}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <div className="text-[12px] text-[color:var(--text-muted)]">
            {/* 还有下一页时如实展示「已加载 X / 共 Y」，告诉用户还能滚出更多；
                所有分页都拉完后 (hasNextPage=false) 把它收敛到「共 X 条」——
                屏蔽过滤吃掉的差额永远补不回来，挂在 toolbar 上反而像在催用户
                继续等数据，跟 list 底部「已经到底了」也对不上。 */}
            {typeof serverTotal === "number" &&
            serverTotal > loadedCount &&
            hasNextPage
              ? t(msg`已加载 ${loadedCount} / 共 ${serverTotal} 条动态`)
              : t(msg`共 ${loadedCount} 条动态`)}
          </div>
        </div>

        {successNotice ? (
          <div className="mt-4">
            <InlineNotice
              tone="success"
              className="border-[color:var(--border-faint)] bg-white"
            >
              {successNotice}
            </InlineNotice>
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
          // 走查新 Round 9：原本桌面 toolbar 把 like 错误纯渲成 ErrorBlock，没
          // 重试入口；用户要么忽略错误条等下次操作把它顶掉，要么得自己滚回去
          // 把那条 row 找出来重点一次赞——视觉上离错误条十万八千里，操作链路
          // 完全断开。移动端 (discover-feed-page L2096-2124) 早就在错误条里塞
          // 了「重试点赞」按钮直接 mutate.variables 回放，桌面对齐。
          <div className="mt-4">
            {onRetryLike ? (
              <InlineNotice tone="info">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 text-[12px]">
                    {likeErrorMessage}
                  </span>
                  <button
                    type="button"
                    onClick={onRetryLike}
                    className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)]"
                  >
                    {t(msg`重试点赞`)}
                  </button>
                </div>
              </InlineNotice>
            ) : (
              <ErrorBlock message={likeErrorMessage} />
            )}
          </div>
        ) : null}

        {commentErrorMessage ? (
          // 同上：评论失败时桌面端没重试入口，文案高频是「评论最多 500 字」之类
          // 用户改完文本想重新发送，得在 row 内重新触发 Enter / 点发送；toolbar
          // 错误条停在顶上一直挂着像没修好。挂「重试发送」按钮回放 commentMutation
          // 的最后一组 variables，但 text 用当前 commentDrafts[postId] (在 page 那
          // 里串好 onRetryComment 时已经现读)，避免覆盖用户改了一半的草稿。
          <div className="mt-4">
            {onRetryComment ? (
              <InlineNotice tone="info">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 text-[12px]">
                    {commentErrorMessage}
                  </span>
                  <button
                    type="button"
                    onClick={onRetryComment}
                    className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-console)]"
                  >
                    {t(msg`重试发送`)}
                  </button>
                </div>
              </InlineNotice>
            ) : (
              <ErrorBlock message={commentErrorMessage} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
