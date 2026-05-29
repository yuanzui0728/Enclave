import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { ArrowLeft, History, PlayCircle } from "lucide-react";
import {
  getChannelWatchHistory,
  type FeedPostListItem,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";

import { EmptyState } from "../components/empty-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { buildDesktopChannelsRouteHash } from "../features/channels/channels-route-state";
import { stripToolCallSyntax } from "../features/moments/moment-content";
import { formatWeChatCommentTime } from "../lib/format";
import { navigateBackOrFallback } from "../lib/history-back";
import { resolveAppMediaUrl } from "../lib/media-url";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const HISTORY_PAGE_PATH = "/channels/history";
const HISTORY_PAGE_LIMIT = 20;

export function ChannelHistoryPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const historyQuery = useQuery({
    queryKey: ["app-channel-history", baseUrl],
    queryFn: () =>
      getChannelWatchHistory(baseUrl, { page: 1, limit: HISTORY_PAGE_LIMIT }),
    staleTime: 30_000,
  });

  const posts = historyQuery.data?.posts ?? [];

  const openPost = (postId: string) => {
    void navigate({
      to: "/tabs/channels",
      hash: buildDesktopChannelsRouteHash({
        postId,
        section: "recommended",
        returnPath: HISTORY_PAGE_PATH,
      }),
    });
  };

  return (
    <AppPage className="space-y-0 bg-[#f5f1e6] px-0 py-0">
      <TabPageTopBar
        title={t(msg`观看历史`)}
        subtitle={t(msg`你看过的视频号`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(250,245,237,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              // 观看历史可从移动端 /discover/channels 和桌面 /tabs/channels 两处进入，
              // 不硬编码 expectedPreviousPath=/tabs/channels：移动端真实 prev 是
              // /discover/channels，比对失败会 fallback 到桌面 tab 路径（移动端无底栏）。
              // 去掉 hint → history.back() 回真实来处，仅冷启动/深链兜底。
              navigateBackOrFallback(() => void navigate({ to: "/tabs/channels" }))
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-[640px] px-4 py-4">
        {historyQuery.isLoading ? (
          <LoadingBlock label={t(msg`正在读取观看历史…`)} />
        ) : historyQuery.isError ? (
          <ErrorBlock
            role="alert"
            message={t(
              msg`观看历史加载失败：${describeRequestError(historyQuery.error)}`,
            )}
          >
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => void historyQuery.refetch()}
            >
              {t(msg`重试`)}
            </Button>
          </ErrorBlock>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={<History size={24} strokeWidth={1.6} />}
            title={t(msg`还没有观看记录`)}
            description={t(msg`你在视频号看过的内容会出现在这里。`)}
          />
        ) : (
          <div className="space-y-2.5">
            {posts.map((post) => (
              <ChannelHistoryRow
                key={post.id}
                post={post}
                onOpen={() => openPost(post.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppPage>
  );
}

function ChannelHistoryRow({
  post,
  onOpen,
}: {
  post: FeedPostListItem;
  onOpen: () => void;
}) {
  const t = useRuntimeTranslator();
  const [coverFailed, setCoverFailed] = useState(false);
  const coverUrl = post.coverUrl?.trim() || post.mediaUrl?.trim() || "";
  const cleanText = stripToolCallSyntax(post.text);
  const primaryText = post.title?.trim() || cleanText || post.authorName;
  const lastViewedAt = post.ownerState?.lastViewedAt;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-stretch gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-2.5 text-left active:bg-black/[0.03]"
    >
      <div className="relative h-[5.5rem] w-[4.4rem] shrink-0 overflow-hidden rounded-[12px] bg-[#d8e5de]">
        {coverUrl && !coverFailed ? (
          <>
            <img
              src={resolveAppMediaUrl(coverUrl)}
              alt={primaryText}
              loading="lazy"
              decoding="async"
              onError={() => setCoverFailed(true)}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-end justify-start bg-[linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.28))] p-1.5">
              <PlayCircle size={16} className="text-white/90" />
            </div>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#0f766e,#115e59)] text-white/85">
            <PlayCircle size={26} strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className="line-clamp-2 text-[14px] font-medium leading-5 text-[color:var(--text-primary)]">
          {primaryText}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[color:var(--text-muted)]">
          <span className="truncate">{post.authorName}</span>
          {lastViewedAt ? (
            <span className="shrink-0">
              {t(msg`${formatWeChatCommentTime(lastViewedAt)} 看过`)}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
