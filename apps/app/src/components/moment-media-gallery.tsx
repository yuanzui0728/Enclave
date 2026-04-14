import type { MouseEvent } from "react";
import {
  type MomentContentType,
  type MomentMediaAsset,
  type MomentVideoAsset,
} from "@yinjie/contracts";
import { Play } from "lucide-react";
import { cn } from "@yinjie/ui";
import { formatMomentDurationLabel } from "../features/moments/moment-compose-media";

type MomentMediaGalleryProps = {
  contentType: MomentContentType;
  media: MomentMediaAsset[];
  variant?: "desktop" | "detail" | "mobile";
  stopPropagation?: boolean;
};

export function MomentMediaGallery({
  contentType,
  media,
  variant = "desktop",
  stopPropagation = false,
}: MomentMediaGalleryProps) {
  if (!media.length) {
    return null;
  }

  const handleClick = stopPropagation
    ? (event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
      }
    : undefined;

  if (contentType === "video" && media[0]?.kind === "video") {
    const video = media[0] as MomentVideoAsset;
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-black",
          variant === "detail"
            ? "max-w-full"
            : variant === "mobile"
              ? "max-w-[320px]"
              : "max-w-[360px]",
        )}
        onClick={handleClick}
      >
        <video
          src={video.url}
          poster={video.posterUrl}
          className="w-full bg-black object-cover"
          style={{
            aspectRatio:
              video.width && video.height
                ? `${video.width} / ${video.height}`
                : "16 / 9",
          }}
          controls
          playsInline
          preload="metadata"
        />
        <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
          <Play size={12} className="fill-current" />
          视频
        </div>
        {video.durationMs ? (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
            {formatMomentDurationLabel(video.durationMs)}
          </div>
        ) : null}
      </div>
    );
  }

  const images = media.filter((asset) => asset.kind === "image");
  const columnClassName =
    images.length === 1
      ? "grid-cols-1"
      : images.length === 2 || images.length === 4
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
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
      onClick={handleClick}
    >
      {images.map((asset) => (
        <div
          key={asset.id}
          className="relative overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
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
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {asset.livePhoto?.enabled ? (
            <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/58 px-2.5 py-1 text-[10px] font-medium text-white">
              实况
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
