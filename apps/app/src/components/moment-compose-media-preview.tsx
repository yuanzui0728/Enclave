import { useEffect, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import {
  formatMomentDurationLabel,
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../features/moments/moment-compose-media";

const t = translateRuntimeMessage;

type MomentComposeMediaPreviewProps = {
  imageDrafts: MomentImageDraft[];
  videoDraft: MomentVideoDraft | null;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  variant?: "desktop" | "mobile";
};

export function MomentComposeMediaPreview({
  imageDrafts,
  videoDraft,
  onRemoveImage,
  onRemoveVideo,
  variant = "desktop",
}: MomentComposeMediaPreviewProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [showVideoViewer, setShowVideoViewer] = useState(false);

  useEffect(() => {
    if (viewerIndex === null && !showVideoViewer) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // 走查电脑端 R5：以前用默认 bubble-phase + 不 stopPropagation —— compose 面板
        // (desktop-moment-compose-panel.tsx 行 59-70) 在面板 mount 时也挂了 window
        // keydown Esc 关闭。用户在 compose 里打开图片/视频预览全屏 viewer 后按 Esc，
        // compose 面板的 listener 先注册先 fire 关掉整个 compose 面板（连带把图
        // 片选择 + 文字草稿藏起来；草稿 state 留在 useMomentComposeDraft 不丢，
        // 但用户视觉上"我只想关预览，怎么 compose 整个不见了"），viewer 自己的
        // setViewerIndex(null) 也跑但已无意义。CDP 实测复现。
        // 解决：在 Esc 上 stopPropagation + preventDefault，并把 listener 注册到
        // capture phase，让本 viewer handler 在 compose 面板的 bubble handler 之前
        // 跑掉，stopPropagation 把 bubble phase 一并掐断 → compose 不会跟着关。
        event.stopPropagation();
        event.preventDefault();
        setViewerIndex(null);
        setShowVideoViewer(false);
        return;
      }

      if (viewerIndex === null) {
        return;
      }

      if (event.key === "ArrowLeft") {
        setViewerIndex((current) =>
          current === null ? current : Math.max(current - 1, 0),
        );
      }

      if (event.key === "ArrowRight") {
        setViewerIndex((current) =>
          current === null ? current : Math.min(current + 1, imageDrafts.length - 1),
        );
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [imageDrafts.length, showVideoViewer, viewerIndex]);

  if (videoDraft) {
    return (
      <>
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-black">
            <button
              type="button"
              onClick={() => setShowVideoViewer(true)}
              className="group relative block w-full text-left"
              aria-label={t(msg`打开视频预览`)}
            >
              {videoDraft.posterPreviewUrl ? (
                <img
                  src={videoDraft.posterPreviewUrl}
                  alt={videoDraft.file.name || t(msg`视频封面`)}
                  className={cn(
                    "w-full object-cover",
                    variant === "mobile" ? "max-h-[220px]" : "max-h-[260px]",
                  )}
                  style={{
                    aspectRatio:
                      videoDraft.width > 0 && videoDraft.height > 0
                        ? `${videoDraft.width} / ${videoDraft.height}`
                        : "16 / 9",
                  }}
                />
              ) : (
                <video
                  src={videoDraft.previewUrl}
                  className={cn(
                    "w-full object-cover",
                    variant === "mobile" ? "max-h-[220px]" : "max-h-[260px]",
                  )}
                  style={{
                    aspectRatio:
                      videoDraft.width > 0 && videoDraft.height > 0
                        ? `${videoDraft.width} / ${videoDraft.height}`
                        : "16 / 9",
                  }}
                  muted
                  playsInline
                  preload="metadata"
                />
              )}

              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.02),rgba(15,23,42,0.36))]" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-black/56 text-white transition group-hover:scale-[1.04]">
                  <Play size={22} className="translate-x-[1px] fill-current" />
                </span>
              </div>
              <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
                  <Play size={12} className="fill-current" />
                  {t(msg`视频`)}
                </span>
                <span className="rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
                  {formatMomentDurationLabel(videoDraft.durationMs)}
                </span>
              </div>
            </button>
            <RemoveDraftButton
              ariaLabel={t(msg`移除当前视频`)}
              onClick={onRemoveVideo}
            />
          </div>
          <div className="text-[12px] text-[color:var(--text-muted)]">
            {t(msg`已生成视频封面，发布后会按视频卡片展示。`)}
          </div>
        </div>
        {showVideoViewer ? (
          <ComposeVideoViewer
            draft={videoDraft}
            onClose={() => setShowVideoViewer(false)}
          />
        ) : null}
      </>
    );
  }

  if (!imageDrafts.length) {
    return null;
  }

  const columnClassName =
    imageDrafts.length === 1
      ? "grid-cols-1"
      : imageDrafts.length === 2 || imageDrafts.length === 4
        ? "grid-cols-2"
        : "grid-cols-3";
  const remainingCount = Math.max(9 - imageDrafts.length, 0);
  const singlePreviewHeightClassName =
    variant === "mobile" ? "max-h-[240px]" : "max-h-[280px]";

  return (
    <>
      <div className="space-y-2">
        <div className={cn("grid gap-2.5", columnClassName)}>
          {imageDrafts.map((draft, index) => (
            <div
              key={draft.id}
              className="group relative overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
              style={
                imageDrafts.length === 1
                  ? undefined
                  : {
                      aspectRatio: "1 / 1",
                    }
              }
            >
              <button
                type="button"
                onClick={() => setViewerIndex(index)}
                className="block w-full text-left"
                aria-label={t(msg`预览图片 ${draft.file.name || index + 1}`)}
              >
                <img
                  src={draft.previewUrl}
                  alt={draft.file.name || t(msg`朋友圈图片预览`)}
                  className={cn(
                    imageDrafts.length === 1
                      ? `mx-auto w-auto max-w-full object-contain ${singlePreviewHeightClassName}`
                      : "h-full w-full object-cover",
                  )}
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.46))] px-3 py-2 text-[10px] text-white/88">
                  {draft.width} × {draft.height}
                </div>
              </button>
              <RemoveDraftButton
                ariaLabel={t(msg`移除图片 ${draft.file.name || ""}`)}
                onClick={() => onRemoveImage(draft.id)}
              />
            </div>
          ))}
        </div>
        <div className="text-[12px] text-[color:var(--text-muted)]">
          {t(msg`已选择 ${imageDrafts.length} 张图片`)}
          {remainingCount > 0 ? t(msg`，还可以继续添加 ${remainingCount} 张。`) : t(msg`。`)}
        </div>
      </div>
      {viewerIndex !== null ? (
        <ComposeImageViewer
          draft={imageDrafts[viewerIndex] ?? null}
          activeIndex={viewerIndex}
          total={imageDrafts.length}
          onClose={() => setViewerIndex(null)}
          onPrevious={
            viewerIndex > 0 ? () => setViewerIndex((current) => (current === null ? current : current - 1)) : undefined
          }
          onNext={
            viewerIndex < imageDrafts.length - 1
              ? () => setViewerIndex((current) => (current === null ? current : current + 1))
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function RemoveDraftButton({
  ariaLabel,
  onClick,
}: {
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={ariaLabel}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/58 text-white transition hover:bg-black/72"
    >
      <X size={14} />
    </button>
  );
}

function ComposeImageViewer({
  draft,
  activeIndex,
  total,
  onClose,
  onPrevious,
  onNext,
}: {
  draft: MomentImageDraft | null;
  activeIndex: number;
  total: number;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  if (!draft) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.92)] backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label={t(msg`关闭图片预览`)}
      />
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-10 flex items-center justify-between gap-3 px-4 text-white">
        <IconOverlayButton label={t(msg`关闭图片预览`)} onClick={onClose}>
          <X size={18} />
        </IconOverlayButton>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium">
            {draft.file.name || t(msg`朋友圈图片`)}
          </div>
          <div className="mt-1 text-xs text-white/70">
            {activeIndex + 1} / {total}
          </div>
        </div>
        <div className="w-10 shrink-0" aria-hidden="true" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]">
        <img
          src={draft.previewUrl}
          alt={draft.file.name || t(msg`朋友圈图片`)}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {onPrevious ? (
        <IconOverlayButton
          label={t(msg`上一张`)}
          onClick={onPrevious}
          className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-5"
        >
          <ChevronLeft size={20} />
        </IconOverlayButton>
      ) : null}
      {onNext ? (
        <IconOverlayButton
          label={t(msg`下一张`)}
          onClick={onNext}
          className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] right-5"
        >
          <ChevronRight size={20} />
        </IconOverlayButton>
      ) : null}
    </div>
  );
}

function ComposeVideoViewer({
  draft,
  onClose,
}: {
  draft: MomentVideoDraft;
  onClose: () => void;
}) {
  // 走查电脑端 R5：和 MomentVideoViewerOverlay (moment-media-gallery.tsx 行
  // 650-658 / 视频号 ChannelVideoSurface 51b8980a) 同款 Chromium/Firefox bug
  // ——React 在 unmount 时把 `<video autoPlay>` 从 DOM 摘掉后浏览器不会自动
  // pause，音轨在后台一直跑直到刷整页（实测桌面 Chrome 起音 → 关 viewer，
  // 音乐还在响）。compose 预览 viewer 漏掉了同款 cleanup pause。
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    return () => {
      videoRef.current?.pause();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.94)] backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label={t(msg`关闭视频预览`)}
      />
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-10 flex items-center justify-between gap-3 px-4 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {draft.file.name || t(msg`朋友圈视频`)}
          </div>
          <div className="mt-1 text-xs text-white/70">
            {t(msg`时长 ${formatMomentDurationLabel(draft.durationMs)}`)}
          </div>
        </div>
        <IconOverlayButton label={t(msg`关闭视频预览`)} onClick={onClose}>
          <X size={18} />
        </IconOverlayButton>
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]">
        <video
          ref={videoRef}
          src={draft.previewUrl}
          poster={draft.posterPreviewUrl ?? undefined}
          className="max-h-full max-w-full rounded-[20px] bg-black"
          controls
          autoPlay
          playsInline
        />
      </div>
    </div>
  );
}

function IconOverlayButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={cn(
        "z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/18",
        className,
      )}
    >
      {children}
    </button>
  );
}
