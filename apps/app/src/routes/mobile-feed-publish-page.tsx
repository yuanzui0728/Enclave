import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { FeedListResponse } from "@yinjie/contracts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Video } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AppPage, Button, InlineNotice, TextAreaField, cn } from "@yinjie/ui";
import { MomentComposeMediaPreview } from "../components/moment-compose-media-preview";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { storeFeedPublishFlash } from "../features/feed/feed-publish-flash";
import { parseMobileFeedPublishRouteState } from "../features/feed/mobile-feed-publish-route-state";
import {
  publishFeedComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const t = translateRuntimeMessage;

export function MobileFeedPublishPage() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const composeDraft = useMomentComposeDraft();
  const routeState = useMemo(
    () => parseMobileFeedPublishRouteState(hash),
    [hash],
  );
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const statusBackLabel = safeReturnPath ? t(msg`返回上一页`) : t(msg`返回广场`);
  const resetComposeDraft = composeDraft.reset;
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      publishFeedComposeDraft({
        text: composeDraft.text,
        imageDrafts: composeDraft.imageDrafts,
        videoDraft: composeDraft.videoDraft,
        baseUrl,
      }),
    onSuccess: (newPost) => {
      storeFeedPublishFlash(t(msg`广场动态已发布，世界居民公开可见。`));
      composeDraft.reset();
      // 把新 post prepend 到 paged 头部 + 平铺 flat cache，跳到 /discover/feed 时立刻可见，
      // 不必等后台 refetch；同时砍回 page 1，避免发布后分页边界重复。
      const newListItem = { ...newPost, commentsPreview: [] };
      queryClient.setQueryData<InfiniteData<FeedListResponse>>(
        ["app-feed-paged", baseUrl],
        (current) =>
          current && current.pages.length > 0
            ? {
                pages: [
                  {
                    ...current.pages[0]!,
                    posts: [newListItem, ...current.pages[0]!.posts],
                    total: current.pages[0]!.total + 1,
                  },
                ],
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      queryClient.setQueryData<FeedListResponse>(
        ["app-feed", baseUrl],
        (current) =>
          current
            ? {
                posts: [newListItem, ...current.posts],
                total: current.total + 1,
              }
            : current,
      );
      // fire-and-forget：原来 await refetch 让"发表中"按钮多卡 600ms+。
      void queryClient.invalidateQueries({ queryKey: ["app-feed", baseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-feed-paged", baseUrl],
      });
      void queryClient.invalidateQueries({ queryKey: ["app-feed-post", baseUrl] });
      void navigate({
        to: safeReturnPath ?? "/discover/feed",
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
    },
  });

  useEffect(() => {
    resetComposeDraft();
  }, [baseUrl, resetComposeDraft]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/feed",
      replace: true,
    });
  }, [isDesktopLayout, navigate]);

  function performBack() {
    navigateBackOrFallback(() => {
      if (safeReturnPath) {
        void navigate({
          to: safeReturnPath,
          ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        });
        return;
      }

      void navigate({ to: "/discover/feed" });
    });
  }

  function handleBack() {
    if (composeDraft.hasContent && !createMutation.isPending) {
      setDiscardConfirmOpen(true);
      return;
    }
    performBack();
  }

  function handleConfirmDiscard() {
    setDiscardConfirmOpen(false);
    composeDraft.reset();
    performBack();
  }

  async function handleImageFilesSelected(files: FileList | null) {
    try {
      await composeDraft.addImageFiles(files);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : t(msg`图片选择失败，请稍后重试。`),
      );
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    try {
      await composeDraft.replaceVideoFile(file);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : t(msg`视频选择失败，请稍后重试。`),
      );
    }
  }

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在回到桌面广场`)}
        description={t(msg`发广场动态在桌面布局里已经并入广场工作区，这里会自动带你返回桌面入口。`)}
        loadingLabel={t(msg`正在打开广场...`)}
      />
    );
  }

  return (
    <AppPage className="space-y-0 bg-[#f2f2f2] px-0 py-0">
      <TabPageTopBar
        title={t(msg`发表广场动态`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.96)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={handleBack}
            aria-label={t(msg`返回广场`)}
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!composeDraft.hasContent || createMutation.isPending}
            className={cn(
              "h-9 rounded-full px-3 text-[15px] font-medium transition",
              composeDraft.hasContent && !createMutation.isPending
                ? "bg-[#07c160] text-white active:opacity-90"
                : "text-[color:var(--text-dim)]",
            )}
          >
            {createMutation.isPending ? t(msg`发表中`) : t(msg`发表`)}
          </button>
        }
      />

      <div className="space-y-3 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-3">
        {composeDraft.mediaError ||
        (createMutation.isError && createMutation.error instanceof Error) ? (
          <InlineNotice
            tone="info"
            className="rounded-[16px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[12px] shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">
                {composeDraft.mediaError ??
                  (createMutation.error instanceof Error
                    ? createMutation.error.message
                    : "")}
              </span>
              <button
                type="button"
                onClick={handleBack}
                className="shrink-0 rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
              >
                {statusBackLabel}
              </button>
            </div>
          </InlineNotice>
        ) : null}

        <section className="overflow-hidden rounded-[24px] border border-[rgba(0,0,0,0.05)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-3">
            <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
              {t(msg`这一刻`)}
            </div>
            <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
              {t(msg`发到广场后，世界里的居民都可能看到、点赞，甚至继续接话。`)}
            </div>
          </div>

          <div className="px-4 pb-4 pt-3">
            <TextAreaField
              value={composeDraft.text}
              onChange={(event) => composeDraft.setText(event.target.value)}
              placeholder={t(msg`写点想让世界居民都能看到的内容...`)}
              className="min-h-[11rem] resize-none rounded-[18px] border-0 bg-[color:var(--surface-console)] px-4 py-3.5 text-[16px] leading-7 shadow-none"
              autoFocus
            />

            {composeDraft.imageDrafts.length > 0 || composeDraft.videoDraft ? (
              <div className="mt-3">
                <MomentComposeMediaPreview
                  imageDrafts={composeDraft.imageDrafts}
                  videoDraft={composeDraft.videoDraft}
                  onRemoveImage={(id) => composeDraft.removeImageDraft(id)}
                  onRemoveVideo={() => composeDraft.clearVideoDraft()}
                  variant="mobile"
                />
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  !composeDraft.canAddImages || createMutation.isPending
                }
                className="h-9 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImagePlus size={14} className="mr-1" />
                {t(msg`添加图片`)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!composeDraft.canAddVideo || createMutation.isPending}
                className="h-9 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 text-[11px]"
                onClick={() => videoInputRef.current?.click()}
              >
                <Video size={14} className="mr-1" />
                {composeDraft.videoDraft ? t(msg`更换视频`) : t(msg`添加视频`)}
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-[rgba(0,0,0,0.05)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                {t(msg`谁可以看`)}
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                {t(msg`当前发布到广场`)}
              </div>
            </div>
            <span className="rounded-full bg-[rgba(7,193,96,0.12)] px-3 py-1 text-[11px] font-medium text-[#07c160]">
              {t(msg`公开可见`)}
            </span>
          </div>
          <div className="border-t border-[rgba(15,23,42,0.06)] px-4 py-3 text-[11px] leading-5 text-[color:var(--text-muted)]">
            {t(msg`图片最多 9 张，视频当前支持 1 条且不超过 5 分钟，暂不支持图片和视频混发。`)}
          </div>
        </section>
      </div>

      {discardConfirmOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
          <button
            type="button"
            aria-label={t(msg`关闭提示`)}
            onClick={() => setDiscardConfirmOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[18px] bg-white shadow-[var(--shadow-overlay)]">
            <div className="px-6 pb-3 pt-6 text-center">
              <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
                {t(msg`放弃发表`)}
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
                {t(msg`返回会丢失已编辑的文字与媒体，确定不发布吗？`)}
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-[color:var(--border-faint)]">
              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(false)}
                className="border-r border-[color:var(--border-faint)] py-3 text-[15px] text-[color:var(--text-secondary)] active:bg-black/[0.04]"
              >
                {t(msg`继续编辑`)}
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                className="py-3 text-[15px] font-medium text-[#fa5151] active:bg-black/[0.04]"
              >
                {t(msg`放弃`)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleImageFilesSelected(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          void handleVideoFileSelected(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
    </AppPage>
  );
}
