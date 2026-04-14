import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  type MomentContentType,
  type MomentImageAsset,
  type MomentMediaAsset,
  type MomentVideoAsset,
} from "@yinjie/contracts";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { cn } from "@yinjie/ui";
import { formatMomentDurationLabel } from "../features/moments/moment-compose-media";

type MomentMediaGalleryProps = {
  contentType: MomentContentType;
  media: MomentMediaAsset[];
  variant?: "desktop" | "detail" | "mobile";
  stopPropagation?: boolean;
};

type ViewerState =
  | {
      kind: "image";
      index: number;
    }
  | {
      kind: "video";
    };

export function MomentMediaGallery({
  contentType,
  media,
  variant = "desktop",
  stopPropagation = false,
}: MomentMediaGalleryProps) {
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);

  useEffect(() => {
    if (!viewerState) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewerState(null);
        return;
      }

      if (viewerState.kind !== "image") {
        return;
      }

      if (event.key === "ArrowLeft") {
        setViewerState((current) => {
          if (!current || current.kind !== "image") {
            return current;
          }

          return {
            kind: "image",
            index: current.index > 0 ? current.index - 1 : current.index,
          };
        });
      }

      if (event.key === "ArrowRight") {
        setViewerState((current) => {
          if (!current || current.kind !== "image") {
            return current;
          }

          return {
            kind: "image",
            index:
              current.index < media.length - 1 ? current.index + 1 : current.index,
          };
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [media.length, viewerState]);

  if (!media.length) {
    return null;
  }

  const images = media.filter(
    (asset): asset is MomentImageAsset => asset.kind === "image",
  );
  const handleRootClick = stopPropagation
    ? (event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
      }
    : undefined;

  if (contentType === "video" && media[0]?.kind === "video") {
    const video = media[0] as MomentVideoAsset;
    return (
      <>
        <div
          className={cn(
            "relative overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-black",
            variant === "detail"
              ? "max-w-full"
              : variant === "mobile"
                ? "max-w-[320px]"
                : "max-w-[360px]",
          )}
          onClick={handleRootClick}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setViewerState({ kind: "video" });
            }}
            className="group relative block w-full text-left"
            aria-label="打开视频预览"
          >
            {video.posterUrl ? (
              <img
                src={video.posterUrl}
                alt={video.fileName || "朋友圈视频"}
                className="w-full bg-black object-cover"
                style={{
                  aspectRatio:
                    video.width && video.height
                      ? `${video.width} / ${video.height}`
                      : "16 / 9",
                }}
              />
            ) : (
              <video
                src={video.url}
                className="w-full bg-black object-cover"
                style={{
                  aspectRatio:
                    video.width && video.height
                      ? `${video.width} / ${video.height}`
                      : "16 / 9",
                }}
                muted
                playsInline
                preload="metadata"
              />
            )}

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.42))]" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-black/56 text-white transition group-hover:scale-[1.04] group-active:scale-[0.98]">
                <Play size={22} className="translate-x-[1px] fill-current" />
              </span>
            </div>
            <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
              <Play size={12} className="fill-current" />
              视频
            </div>
            {video.durationMs ? (
              <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
                {formatMomentDurationLabel(video.durationMs)}
              </div>
            ) : null}
          </button>
        </div>

        {viewerState?.kind === "video" ? (
          <MomentVideoViewerOverlay
            video={video}
            onClose={() => setViewerState(null)}
          />
        ) : null}
      </>
    );
  }

  const columnClassName =
    images.length === 1
      ? "grid-cols-1"
      : images.length === 2 || images.length === 4
        ? "grid-cols-2"
        : "grid-cols-3";
  const activeImage =
    viewerState?.kind === "image" ? images[viewerState.index] ?? null : null;

  return (
    <>
      <div
        className={cn(
          "grid gap-2.5",
          columnClassName,
          variant === "detail"
            ? "max-w-full"
            : variant === "mobile"
              ? "max-w-[320px]"
              : "max-w-[360px]",
        )}
        onClick={handleRootClick}
      >
        {images.map((asset, index) => (
          <button
            key={asset.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setViewerState({
                kind: "image",
                index,
              });
            }}
            className="relative overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-left"
            style={{
              aspectRatio:
                images.length === 1 && asset.width && asset.height
                  ? `${asset.width} / ${asset.height}`
                  : "1 / 1",
            }}
          >
            <img
              src={asset.thumbnailUrl || asset.url}
              alt={asset.fileName || "朋友圈图片"}
              className="h-full w-full object-cover transition duration-200 hover:scale-[1.015]"
              loading="lazy"
            />
            {asset.livePhoto?.enabled ? (
              <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/58 px-2.5 py-1 text-[10px] font-medium text-white">
                实况
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {activeImage ? (
        <MomentImageViewerOverlay
          image={activeImage}
          activeIndex={viewerState?.kind === "image" ? viewerState.index : 0}
          total={images.length}
          onClose={() => setViewerState(null)}
          onPrevious={
            viewerState?.kind === "image" && viewerState.index > 0
              ? () =>
                  setViewerState((current) => {
                    if (!current || current.kind !== "image") {
                      return current;
                    }

                    return {
                      kind: "image",
                      index: Math.max(current.index - 1, 0),
                    };
                  })
              : undefined
          }
          onNext={
            viewerState?.kind === "image" && viewerState.index < images.length - 1
              ? () =>
                  setViewerState((current) => {
                    if (!current || current.kind !== "image") {
                      return current;
                    }

                    return {
                      kind: "image",
                      index: Math.min(current.index + 1, images.length - 1),
                    };
                  })
              : undefined
          }
          variant={variant}
        />
      ) : null}
    </>
  );
}

function MomentImageViewerOverlay({
  image,
  activeIndex,
  total,
  onClose,
  onPrevious,
  onNext,
  variant,
}: {
  image: MomentImageAsset;
  activeIndex: number;
  total: number;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  variant: "desktop" | "detail" | "mobile";
}) {
  const isMobile = variant === "mobile";

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.92)] backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label="关闭图片预览"
      />
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-10 flex items-center justify-between gap-3 px-4 text-white">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white"
          aria-label="关闭图片预览"
        >
          <X size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium">
            {image.fileName || "朋友圈图片"}
          </div>
          <div className="mt-1 text-xs text-white/70">
            {activeIndex + 1} / {total}
          </div>
        </div>
        <div className="w-10 shrink-0" aria-hidden="true" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]">
        <img
          src={image.url}
          alt={image.fileName || "朋友圈图片"}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {onPrevious ? (
        <ViewerNavButton
          position={isMobile ? "bottom-left" : "left"}
          label="上一张"
          onClick={onPrevious}
        >
          <ChevronLeft size={20} />
        </ViewerNavButton>
      ) : null}
      {onNext ? (
        <ViewerNavButton
          position={isMobile ? "bottom-right" : "right"}
          label="下一张"
          onClick={onNext}
        >
          <ChevronRight size={20} />
        </ViewerNavButton>
      ) : null}
    </div>
  );
}

function MomentVideoViewerOverlay({
  video,
  onClose,
}: {
  video: MomentVideoAsset;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.94)] backdrop-blur-sm">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label="关闭视频预览"
      />
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-10 flex items-center justify-between gap-3 px-4 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {video.fileName || "朋友圈视频"}
          </div>
          {video.durationMs ? (
            <div className="mt-1 text-xs text-white/70">
              时长 {formatMomentDurationLabel(video.durationMs)}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white"
          aria-label="关闭视频预览"
        >
          <X size={18} />
        </button>
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]">
        <video
          src={video.url}
          poster={video.posterUrl}
          className="max-h-full max-w-full rounded-[20px] bg-black"
          controls
          autoPlay
          playsInline
        />
      </div>
    </div>
  );
}

function ViewerNavButton({
  position,
  label,
  onClick,
  children,
}: {
  position: "left" | "right" | "bottom-left" | "bottom-right";
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/18",
        position === "left" ? "left-5 top-1/2 -translate-y-1/2" : "",
        position === "right" ? "right-5 top-1/2 -translate-y-1/2" : "",
        position === "bottom-left"
          ? "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-5"
          : "",
        position === "bottom-right"
          ? "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] right-5"
          : "",
      )}
    >
      {children}
    </button>
  );
}
