import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ImagePlus, Video } from "lucide-react";
import { AppPage, Button, InlineNotice, TextAreaField, cn } from "@yinjie/ui";
import { MomentComposeMediaPreview } from "../components/moment-compose-media-preview";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { storeMomentPublishFlash } from "../features/moments/moment-publish-flash";
import {
  parseMobileMomentsPublishRouteState,
} from "../features/moments/mobile-moments-publish-route-state";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function MobileMomentsPublishPage() {
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
    () => parseMobileMomentsPublishRouteState(hash),
    [hash],
  );
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const statusBackLabel = safeReturnPath ? "返回上一页" : "返回朋友圈";
  const resetComposeDraft = useEffectEvent(() => {
    composeDraft.reset();
  });
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      publishMomentComposeDraft({
        text: composeDraft.text,
        imageDrafts: composeDraft.imageDrafts,
        videoDraft: composeDraft.videoDraft,
        baseUrl,
      }),
    onSuccess: async () => {
      storeMomentPublishFlash("朋友圈已发布。");
      composeDraft.reset();
      await queryClient.invalidateQueries({
        queryKey: ["app-moments", baseUrl],
      });
      void navigate({
        to: safeReturnPath ?? "/discover/moments",
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
      to: "/tabs/moments",
      replace: true,
    });
  }, [isDesktopLayout, navigate]);

  function handleBack() {
    navigateBackOrFallback(() => {
      if (safeReturnPath) {
        void navigate({
          to: safeReturnPath,
          ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        });
        return;
      }

      void navigate({ to: "/discover/moments" });
    });
  }

  async function handleImageFilesSelected(files: FileList | null) {
    try {
      await composeDraft.addImageFiles(files);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : "图片选择失败，请稍后重试。",
      );
    }
  }

  async function handleVideoFileSelected(file: File | null) {
    try {
      await composeDraft.replaceVideoFile(file);
    } catch (error) {
      composeDraft.setMediaError(
        error instanceof Error ? error.message : "视频选择失败，请稍后重试。",
      );
    }
  }

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title="正在回到桌面朋友圈"
        description="发朋友圈在桌面布局里已经并入朋友圈工作区，这里会自动带你返回桌面入口。"
        loadingLabel="正在打开朋友圈..."
      />
    );
  }

  return (
    <AppPage className="space-y-0 bg-[#f2f2f2] px-0 py-0">
      <TabPageTopBar
        title="发表朋友圈"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.96)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={handleBack}
            aria-label="返回朋友圈"
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
            {createMutation.isPending ? "发表中" : "发表"}
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
              这一刻
            </div>
            <div className="mt-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
              会同步到朋友圈时间线，适合发日常照片、短视频和临时心情。
            </div>
          </div>

          <div className="px-4 pb-4 pt-3">
            <TextAreaField
              value={composeDraft.text}
              onChange={(event) => composeDraft.setText(event.target.value)}
              placeholder="这一刻的想法..."
              className="min-h-[11rem] resize-none rounded-[18px] border-0 bg-[color:var(--surface-console)] px-4 py-3.5 text-[15px] leading-7 shadow-none"
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
                添加图片
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
                {composeDraft.videoDraft ? "更换视频" : "添加视频"}
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[24px] border border-[rgba(0,0,0,0.05)] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                谁可以看
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                当前发布到朋友圈
              </div>
            </div>
            <span className="rounded-full bg-[rgba(47,122,63,0.12)] px-3 py-1 text-[11px] font-medium text-[#2f7a3f]">
              朋友
            </span>
          </div>
          <div className="border-t border-[rgba(15,23,42,0.06)] px-4 py-3 text-[11px] leading-5 text-[color:var(--text-muted)]">
            图片最多 9 张，视频当前支持 1 条且不超过 5
            分钟，暂不支持图片和视频混发。
          </div>
        </section>
      </div>

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
