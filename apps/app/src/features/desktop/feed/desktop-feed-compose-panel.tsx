import { useEffect, useRef } from "react";
import { Button, ErrorBlock, TextAreaField } from "@yinjie/ui";
import { ImagePlus, Video, X } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { MomentComposeMediaPreview } from "../../../components/moment-compose-media-preview";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";

type DesktopFeedComposePanelProps = {
  createPending: boolean;
  canAddImages: boolean;
  canAddVideo: boolean;
  errorMessage?: string | null;
  imageDrafts: MomentImageDraft[];
  ownerAvatar?: string | null;
  ownerUsername?: string | null;
  text: string;
  videoDraft: MomentVideoDraft | null;
  onClose: () => void;
  onCreate: () => void;
  onImageFilesSelected: (files: FileList | null) => void;
  onRemoveImage: (id: string) => void;
  onRemoveVideo: () => void;
  onTextChange: (value: string) => void;
  onVideoFileSelected: (file: File | null) => void;
};

export function DesktopFeedComposePanel({
  createPending,
  canAddImages,
  canAddVideo,
  errorMessage,
  imageDrafts,
  ownerAvatar,
  ownerUsername,
  text,
  videoDraft,
  onClose,
  onCreate,
  onImageFilesSelected,
  onRemoveImage,
  onRemoveVideo,
  onTextChange,
  onVideoFileSelected,
}: DesktopFeedComposePanelProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-20 flex justify-end bg-[rgba(15,23,42,0.12)] backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex h-full w-full max-w-[380px] flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.96)] shadow-[-24px_0_48px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] bg-white/82 px-5 py-4 backdrop-blur-xl">
          <div>
            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
              发广场动态
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
              发给世界里的居民看
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
            aria-label="关闭发帖面板"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[rgba(242,246,245,0.76)] px-5 py-5">
          <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-3">
              <AvatarChip name={ownerUsername} src={ownerAvatar} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                  {ownerUsername ?? "我"}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  图文和单条视频都可以直接发到广场
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3 text-[12px] leading-6 text-[color:var(--text-secondary)]">
              图片最多 9 张，视频当前支持 1 条且不超过 5
              分钟。图片和视频暂不混发。
            </div>

            <TextAreaField
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder="写点想让世界居民都能看到的内容..."
              className="mt-5 min-h-[220px] resize-none rounded-[18px] border-[color:var(--border-faint)] bg-white px-4 py-4 leading-7 shadow-none hover:bg-[color:var(--surface-console)] focus:border-[rgba(7,193,96,0.14)] focus:bg-white focus:shadow-none"
              autoFocus
            />

            {imageDrafts.length > 0 || videoDraft ? (
              <div className="mt-4">
                <MomentComposeMediaPreview
                  imageDrafts={imageDrafts}
                  videoDraft={videoDraft}
                  onRemoveImage={onRemoveImage}
                  onRemoveVideo={onRemoveVideo}
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={!canAddImages || createPending}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-white px-4 text-[13px] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlus size={15} />
                添加图片
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={!canAddVideo || createPending}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-white px-4 text-[13px] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Video size={15} />
                {videoDraft ? "更换视频" : "添加视频"}
              </button>
            </div>

            {errorMessage ? (
              <div className="mt-4">
                <ErrorBlock message={errorMessage} />
              </div>
            ) : null}

            <div className="mt-5 border-t border-[color:var(--border-faint)] pt-4">
              <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                <span>发布后会直接插入到公开流顶部。</span>
                <span className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-[11px]">
                  {text.trim().length}/600
                </span>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={onClose}
                  className="border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  取消
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    (!text.trim() && !imageDrafts.length && !videoDraft) ||
                    createPending
                  }
                  onClick={onCreate}
                  className="bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                >
                  {createPending ? "发布中..." : "发布到广场"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onImageFilesSelected(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          onVideoFileSelected(event.currentTarget.files?.[0] ?? null);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
