import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { Moment, MomentsPageResponse } from "@yinjie/contracts";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight, Play, Plus, X } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { AppPage, InlineNotice, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { RouteRedirectState } from "../components/route-redirect-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { storeMomentPublishFlash } from "../features/moments/moment-publish-flash";
import {
  buildDesktopMomentsRouteHash,
} from "../features/moments/moments-route-state";
import { parseMobileMomentsPublishRouteState } from "../features/moments/mobile-moments-publish-route-state";
import {
  publishMomentComposeDraft,
  useMomentComposeDraft,
} from "../features/moments/moment-compose-media";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const t = translateRuntimeMessage;

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
  const resetComposeDraft = composeDraft.reset;
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [toast, setToast] = useState<string>("");

  const createMutation = useMutation({
    mutationFn: () =>
      publishMomentComposeDraft({
        text: composeDraft.text,
        imageDrafts: composeDraft.imageDrafts,
        videoDraft: composeDraft.videoDraft,
        baseUrl,
      }),
    onSuccess: (newMoment) => {
      storeMomentPublishFlash(t(msg`朋友圈已发布。`));
      composeDraft.reset();
      // 把新发布的 moment prepend 到 paged 头部 + 收回到 page 1。跳转后 moments-page mount
      // 能立刻看到自己刚发的内容；后台 invalidate 再去合并服务端最新状态（评论/点赞等）。
      queryClient.setQueryData<InfiniteData<MomentsPageResponse>>(
        ["app-moments-paged", baseUrl],
        (current) =>
          current && current.pages.length > 0
            ? {
                pages: [
                  {
                    ...current.pages[0]!,
                    items: [newMoment, ...current.pages[0]!.items],
                  },
                ],
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      queryClient.setQueryData<Moment[]>(["app-moments", baseUrl], (current) =>
        current ? [newMoment, ...current] : current,
      );
      // fire-and-forget：原来 await refetch 让"发表中"按钮多卡 600ms+。
      void queryClient.invalidateQueries({ queryKey: ["app-moments", baseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-moments-paged", baseUrl],
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
    if (!isDesktopLayout) return;
    void navigate({
      to: "/tabs/moments",
      hash:
        buildDesktopMomentsRouteHash({
          returnPath: safeReturnPath,
          returnHash: safeReturnHash,
        }) ?? undefined,
      replace: true,
    });
  }, [isDesktopLayout, navigate, safeReturnHash, safeReturnPath]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 1600); // i18n-ignore-line: clearing state
    return () => window.clearTimeout(timer);
  }, [toast]);

  function performBack() {
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
        title={t(msg`正在回到桌面朋友圈`)}
        description={t(msg`发朋友圈在桌面布局里已经并入朋友圈工作区，这里会自动带你返回桌面入口。`)}
        loadingLabel={t(msg`正在打开朋友圈...`)}
      />
    );
  }

  const canSubmit = composeDraft.hasContent && !createMutation.isPending;
  const errorMessage =
    composeDraft.mediaError ??
    (createMutation.isError && createMutation.error instanceof Error
      ? createMutation.error.message
      : null);

  const imageCount = composeDraft.imageDrafts.length;
  const showAddTile =
    !composeDraft.videoDraft && imageCount < 9 && composeDraft.canAddImages;
  const showVideoSlot = Boolean(composeDraft.videoDraft);
  const showImageGrid = imageCount > 0;

  return (
    <AppPage className="space-y-0 bg-[#F7F7F7] px-0 py-0">
      <TabPageTopBar
        title="" // i18n-ignore-line: intentionally empty
        className="mx-0 mb-0 mt-0 border-b border-[#ECECEC] bg-[#F7F7F7] px-3 pb-1.5 pt-1.5 text-[#1A1A1A] shadow-none"
        leftActions={
          <button
            type="button"
            onClick={handleBack}
            className="h-9 px-2 text-[15px] text-[#1A1A1A] active:opacity-70"
          >
            {t(msg`取消`)}
          </button>
        }
        rightActions={
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className={cn(
              "h-7 rounded-[3px] px-3 text-[14px] font-medium transition",
              canSubmit
                ? "bg-[#07C160] text-white active:bg-[#06AD56]"
                : "bg-[#9DD9B0] text-white",
            )}
          >
            {createMutation.isPending ? t(msg`发表中`) : t(msg`发表`)}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {errorMessage ? (
          <div className="px-4 pt-3">
            <InlineNotice
              tone="info"
              className="rounded-[8px] border border-[#ECECEC] bg-white px-3 py-2 text-[12px] shadow-none"
            >
              {errorMessage}
            </InlineNotice>
          </div>
        ) : null}

        <section className="bg-white px-4 pt-4">
          <textarea
            value={composeDraft.text}
            onChange={(event) => composeDraft.setText(event.target.value)}
            placeholder={t(msg`这一刻的想法...`)}
            rows={4}
            className="block w-full resize-none border-0 bg-transparent text-[17px] leading-[26px] text-[#1A1A1A] outline-none placeholder:text-[#B0B0B0]"
            autoFocus
          />

          {showImageGrid || showVideoSlot || showAddTile ? (
            <div
              className="mt-3 grid"
              style={{
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "4px",
              }}
            >
              {composeDraft.imageDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="relative overflow-hidden bg-[#EAEAEA]"
                  style={{ aspectRatio: "1 / 1" }}
                >
                  <img
                    src={draft.previewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => composeDraft.removeImageDraft(draft.id)}
                    aria-label={t(msg`移除图片`)}
                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {showVideoSlot && composeDraft.videoDraft ? (
                <div
                  className="relative overflow-hidden bg-black"
                  style={{ aspectRatio: "1 / 1" }}
                >
                  {composeDraft.videoDraft.posterPreviewUrl ? (
                    <img
                      src={composeDraft.videoDraft.posterPreviewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video
                      src={composeDraft.videoDraft.previewUrl}
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  )}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
                      <Play size={16} className="translate-x-[1px] fill-current" />
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => composeDraft.clearVideoDraft()}
                    aria-label={t(msg`移除视频`)}
                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/45 text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : null}

              {showAddTile && !showVideoSlot ? (
                <button
                  type="button"
                  onClick={() => {
                    if (imageCount === 0) {
                      setMediaPickerOpen(true);
                    } else {
                      imageInputRef.current?.click();
                    }
                  }}
                  className="flex items-center justify-center bg-[#F7F7F7] text-[#B0B0B0] active:bg-[#EFEFEF]"
                  style={{ aspectRatio: "1 / 1" }}
                  aria-label={t(msg`添加图片`)}
                >
                  <Plus size={28} strokeWidth={1.4} />
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setMediaPickerOpen(true)}
                className="flex h-[110px] w-[110px] items-center justify-center bg-[#F2F2F2] text-[#B0B0B0] active:bg-[#EAEAEA]"
                aria-label={t(msg`添加图片`)}
              >
                <Plus size={32} strokeWidth={1.4} />
              </button>
            </div>
          )}

          <div className="h-3" />
        </section>

        <section className="mt-2 bg-white">
          <SettingRow
            label={t(msg`所在位置`)}
            value={t(msg`不显示位置`)}
            onTap={() => setToast(t(msg`敬请期待`))}
          />
          <SettingRow
            label={t(msg`提醒谁看`)}
            value=""
            onTap={() => setToast(t(msg`敬请期待`))}
          />
          <SettingRow
            label={t(msg`谁可以看`)}
            value={t(msg`公开`)}
            onTap={() => setToast(t(msg`敬请期待`))}
            isLast
          />
        </section>

        <div className="px-4 pt-3 text-[11px] leading-5 text-[#9A9A9A]">
          {t(msg`图片最多 9 张，视频当前支持 1 条且不超过 5 分钟，暂不支持图片和视频混发。`)}
        </div>

        <div className="h-[calc(env(safe-area-inset-bottom,0px)+24px)]" />
      </div>

      {mediaPickerOpen ? (
        <MediaPickerSheet
          onPickImages={() => {
            setMediaPickerOpen(false);
            imageInputRef.current?.click();
          }}
          onPickVideo={() => {
            setMediaPickerOpen(false);
            videoInputRef.current?.click();
          }}
          onClose={() => setMediaPickerOpen(false)}
          videoDisabled={!composeDraft.canAddVideo}
        />
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-[1100] flex justify-center">
          <div className="rounded-[6px] bg-black/72 px-3 py-1.5 text-[13px] text-white">
            {toast}
          </div>
        </div>
      ) : null}

      {discardConfirmOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
          <button
            type="button"
            aria-label={t(msg`关闭提示`)}
            onClick={() => setDiscardConfirmOpen(false)}
            className="absolute inset-0"
          />
          <div className="relative w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-[12px] bg-white shadow-[var(--shadow-overlay)]">
            <div className="px-6 pb-3 pt-6 text-center">
              <div className="text-[16px] font-medium text-[#1A1A1A]">
                {t(msg`放弃发表`)}
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[#9A9A9A]">
                {t(msg`返回会丢失已编辑的文字与媒体，确定不发布吗？`)}
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-[#ECECEC]">
              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(false)}
                className="border-r border-[#ECECEC] py-3 text-[15px] text-[#576B95] active:bg-black/[0.04]"
              >
                {t(msg`继续编辑`)}
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                className="py-3 text-[15px] font-medium text-[#FA5151] active:bg-black/[0.04]"
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

function SettingRow({
  label,
  value,
  onTap,
  isLast,
}: {
  label: string;
  value: string;
  onTap: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-[#F2F2F2]",
        isLast ? "" : "border-b border-[#ECECEC]",
      )}
    >
      <span className="text-[15px] text-[#1A1A1A]">{label}</span>
      <span className="flex items-center gap-1 text-[14px] text-[#9A9A9A]">
        {value ? <span>{value}</span> : null}
        <ChevronRight size={16} className="text-[#C5C5C5]" />
      </span>
    </button>
  );
}

function MediaPickerSheet({
  onPickImages,
  onPickVideo,
  onClose,
  videoDisabled,
}: {
  onPickImages: () => void;
  onPickVideo: () => void;
  onClose: () => void;
  videoDisabled?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-black/40">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label={t(msg`关闭`)}
      />
      <div className="relative w-full max-w-[480px] rounded-t-[12px] bg-white pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        <button
          type="button"
          onClick={onPickImages}
          className="block w-full border-b border-[#ECECEC] py-3.5 text-center text-[16px] text-[#1A1A1A] active:bg-[#F2F2F2]"
        >
          {t(msg`从相册选择图片`)}
        </button>
        <button
          type="button"
          onClick={onPickVideo}
          disabled={videoDisabled}
          className={cn(
            "block w-full border-b border-[#ECECEC] py-3.5 text-center text-[16px] active:bg-[#F2F2F2]",
            videoDisabled ? "text-[#B0B0B0]" : "text-[#1A1A1A]",
          )}
        >
          {t(msg`选择视频`)}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 block w-full bg-[#F7F7F7] py-3.5 text-center text-[16px] text-[#1A1A1A] active:bg-[#EFEFEF]"
        >
          {t(msg`取消`)}
        </button>
      </div>
    </div>
  );
}
