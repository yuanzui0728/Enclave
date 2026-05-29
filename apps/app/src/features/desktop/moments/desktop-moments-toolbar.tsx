import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice } from "@yinjie/ui";
import { ArrowUp, PenSquare, RefreshCcw } from "lucide-react";

type DesktopMomentsToolbarProps = {
  commentErrorMessage?: string | null;
  deleteErrorMessage?: string | null;
  errors?: string[];
  likeErrorMessage?: string | null;
  /**
   * 顶部状态条文案。tone 由 noticeTone 决定 —— 之前 toolbar 永远写死 tone="success"，
   * mutation 失败（点赞/评论/删除/刷新失败）走同一个 notice 通道时也被渲成绿色"成功"，
   * 用户看着像操作生效了。mobile MomentsView 一直把 tone+action 透传过来，桌面这边
   * 漏掉了，跟 chat Round 6 同类 bug。
   */
  notice?: string;
  noticeTone?: "success" | "info" | "danger";
  /** danger notice 上的重试按钮文案（点赞/删除失败时 moments-page 会塞「重试点赞」/「重试删除」）。 */
  noticeActionLabel?: string | null;
  onNoticeAction?: (() => void) | null;
  /** 当前已加载到前端的动态数（visibleMoments.length） */
  loadedCount: number;
  /** 服务端 MomentsPageResponse.total。null = 首页还没拿到 */
  totalCount?: number | null;
  onBackToTop: () => void;
  onOpenCompose: () => void;
  onRefresh: () => void;
  /** 走查新 R1：refresh in-flight 时按钮 disabled + 文案变「刷新中…」，
   *  防止连点触发多次同步 GET /api/moments?page=1。 */
  refreshPending?: boolean;
  /** 当前账户有朋友圈草稿 → 「发朋友圈」按钮右上角挂红点。 */
  hasMomentDraft?: boolean;
};

export function DesktopMomentsToolbar({
  commentErrorMessage,
  deleteErrorMessage,
  errors = [],
  likeErrorMessage,
  notice,
  noticeTone = "success",
  noticeActionLabel,
  onNoticeAction,
  loadedCount,
  totalCount = null,
  onBackToTop,
  onOpenCompose,
  onRefresh,
  refreshPending = false,
  hasMomentDraft = false,
}: DesktopMomentsToolbarProps) {
  const t = useRuntimeTranslator();
  return (
    <div className="border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)]/74 px-6 py-4 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[18px] font-semibold text-[color:var(--text-primary)]">
              {t(msg`朋友圈`)}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={refreshPending}
            >
              <RefreshCcw size={14} />
              {refreshPending ? t(msg`刷新中…`) : t(msg`刷新`)}
            </Button>
            <Button variant="secondary" size="sm" onClick={onBackToTop}>
              <ArrowUp size={14} />
              {t(msg`回到顶部`)}
            </Button>
            <span className="relative inline-flex">
              <Button variant="primary" size="sm" onClick={onOpenCompose}>
                <PenSquare size={14} />
                {t(msg`发朋友圈`)}
              </Button>
              {hasMomentDraft ? (
                // 6px 红点；ring-2 是工具栏底色（白带 backdrop-blur），让红点
                // 在按钮主色（绿）边角上仍能跟下面控件区分开。pointer-events-none
                // 保证点击穿透到 Button。
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-0.5 -top-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--state-danger-solid)] ring-2 ring-[color:var(--border-faint)]"
                />
              ) : null}
            </span>
          </div>
        </div>

        {/* 之前一律 "当前共 X 条动态"，但 auto-prefetch 中途 X 还在涨，
            用户读着以为 X 就是总数 ——「我才 100 条朋友圈？」其实有 240。
            未跑完时拿服务端 total 当上限显示「已加载 100 / 共 240」；跑完后
            回到客户端 visible count（loadedCount）—— 服务端 total 没扣黑名单
            过滤的角色 moments，跑完显示 240 但客户端只能看 235 会反过来误导。
            首页响应还没拿到时（totalCount=null && loadedCount=0），feed 正在
            转 LoadingBlock，count 区藏起来避免「共 0 条」与 loading spinner 撞车。

            走查 R1（本轮）：之前外层 `<div className="mt-4 flex items-center justify-end">`
            始终渲染，内层 count 文案被 totalCount==null && loadedCount==0 gate 藏起来时
            外层壳还在 — flex 容器无内容塌成 0 高，但 mt-4 仍贡献 16px margin。后果：
            首屏 momentsQuery 没回前（~600ms 公网 RTT）+ mutation 错误打开 notice 前
            的常见态下，标题行和 notice/ErrorBlock 之间硬塞一道空隙；count 出现后
            空隙又消失，体感"toolbar 高度抖一下"。把 mt-4 容器一并 gate 掉，文案
            没渲染时不留 margin。

            走查电脑端朋友圈 R1（本轮，新一轮）：之前 delta 文案被 `!isFullyLoaded`
            额外 gate 掉 —— auto-prefetch 跑完后（hasNextPage=false → isFullyLoaded=true）
            就退回 "共 loadedCount 条"。问题：服务端 total=161 但全部被屏蔽角色 /
            tool-call 空胶水帖过滤掉 → loadedCount=0，用户看到 "共 0 条动态"，下面
            EmptyState 写 "朋友圈都被你屏蔽了"，counter 跟 EmptyState 对不上 ——
            "0 条" 让人以为这世界一条朋友圈都没有，不是 "161 条全被你屏蔽"。
            把 `!isFullyLoaded` gate 去掉：只要 totalCount > loadedCount（不管 prefetch
            是否跑完）就显示 "已加载 X / 共 Y"，跑完 + 全部 visible 时才退回 "共 X"。
            EmptyState 那边已经按 hasFilteredOutMoments 切到 "朋友圈都被你屏蔽了"
            兜住语义。 */}
        {totalCount === null && loadedCount === 0 ? null : (
          <div className="mt-4 flex items-center justify-end">
            <div className="text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
              {totalCount !== null && totalCount > loadedCount
                ? t(msg`已加载 ${loadedCount} / 共 ${totalCount} 条动态`)
                : t(msg`共 ${loadedCount} 条动态`)}
            </div>
          </div>
        )}

        {notice ? (
          <div className="mt-4">
            <InlineNotice
              tone={noticeTone}
              className="border-[color:var(--border-faint)] bg-[color:var(--surface-card)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0 flex-1">{notice}</span>
                {noticeActionLabel && onNoticeAction ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onNoticeAction}
                    className="shrink-0 border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                  >
                    {noticeActionLabel}
                  </Button>
                ) : null}
              </div>
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

        {/* mutation 失败时 moments-page 同时打开两路：danger notice（带「重试点赞/删除」按钮，
            2.4s 自清）+ 这里的 ErrorBlock（粘到下一次 mutation 才走）。两条红条同文显示
            一段时间，用户看着像"系统连发两次错误"。先级 notice：danger 在屏时把
            type-specific ErrorBlock 藏起来；notice 自清后 ErrorBlock 还能粘住做持久指示。 */}
        {likeErrorMessage && !(notice && noticeTone === "danger") ? (
          <div className="mt-4">
            <ErrorBlock message={likeErrorMessage} />
          </div>
        ) : null}

        {commentErrorMessage && !(notice && noticeTone === "danger") ? (
          <div className="mt-4">
            <ErrorBlock message={commentErrorMessage} />
          </div>
        ) : null}

        {deleteErrorMessage && !(notice && noticeTone === "danger") ? (
          <div className="mt-4">
            <ErrorBlock message={deleteErrorMessage} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
