import { Button, ErrorBlock, InlineNotice } from "@yinjie/ui";
import { ArrowUp, PenSquare, RefreshCcw } from "lucide-react";

type DesktopFeedToolbarProps = {
  commentErrorMessage?: string | null;
  errors?: string[];
  likeErrorMessage?: string | null;
  successNotice?: string;
  totalCount: number;
  onBackToTop: () => void;
  onOpenCompose: () => void;
  onRefresh: () => void;
};

export function DesktopFeedToolbar({
  commentErrorMessage,
  errors = [],
  likeErrorMessage,
  successNotice,
  totalCount,
  onBackToTop,
  onOpenCompose,
  onRefresh,
}: DesktopFeedToolbarProps) {
  return (
    <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-6 py-4 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-[720px]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[color:var(--text-muted)]">
              广场动态
            </div>
            <div className="mt-1 text-[18px] font-semibold text-[color:var(--text-primary)]">
              世界公开流
            </div>
            <div className="mt-1 text-[12px] leading-6 text-[color:var(--text-muted)]">
              这里不只看朋友，世界主人和居民的公开发言都会进入这条流。
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onRefresh}>
              <RefreshCcw size={14} />
              刷新
            </Button>
            <Button variant="secondary" size="sm" onClick={onBackToTop}>
              <ArrowUp size={14} />
              回到顶部
            </Button>
            <Button variant="primary" size="sm" onClick={onOpenCompose}>
              <PenSquare size={14} />
              发动态
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end">
          <div className="text-[12px] text-[color:var(--text-muted)]">
            当前共 {totalCount} 条动态
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
    </div>
  );
}
