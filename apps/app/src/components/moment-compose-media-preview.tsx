import { Play, X } from "lucide-react";
import { cn } from "@yinjie/ui";
import {
  formatMomentDurationLabel,
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../features/moments/moment-compose-media";

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
  if (videoDraft) {
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-black">
          {videoDraft.posterPreviewUrl ? (
            <img
              src={videoDraft.posterPreviewUrl}
              alt={videoDraft.file.name || "视频封面"}
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
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
              <Play size={12} className="fill-current" />
              视频
            </span>
            <span className="rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
              {formatMomentDurationLabel(videoDraft.durationMs)}
            </span>
          </div>
          <RemoveDraftButton
            ariaLabel="移除当前视频"
            onClick={onRemoveVideo}
          />
        </div>
        <div className="text-[12px] text-[color:var(--text-muted)]">
          已生成视频封面，发布后会按视频卡片展示。
        </div>
      </div>
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
    <div className="space-y-2">
      <div className={cn("grid gap-2.5", columnClassName)}>
        {imageDrafts.map((draft) => (
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
            <img
              src={draft.previewUrl}
              alt={draft.file.name || "朋友圈图片预览"}
              className={cn(
                imageDrafts.length === 1
                  ? `mx-auto w-auto max-w-full object-contain ${singlePreviewHeightClassName}`
                  : "h-full w-full object-cover",
              )}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.46))] px-3 py-2 text-[10px] text-white/88">
              {draft.width} × {draft.height}
            </div>
            <RemoveDraftButton
              ariaLabel={`移除图片 ${draft.file.name || ""}`}
              onClick={() => onRemoveImage(draft.id)}
            />
          </div>
        ))}
      </div>
      <div className="text-[12px] text-[color:var(--text-muted)]">
        已选择 {imageDrafts.length} 张图片
        {remainingCount > 0 ? `，还可以继续添加 ${remainingCount} 张。` : "。"}
      </div>
    </div>
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
      onClick={onClick}
      aria-label={ariaLabel}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/58 text-white transition hover:bg-black/72"
    >
      <X size={14} />
    </button>
  );
}
