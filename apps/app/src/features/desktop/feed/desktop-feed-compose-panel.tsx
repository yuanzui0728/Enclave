import { useEffect, useRef } from "react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, TextAreaField, cn } from "@yinjie/ui";
import { ImagePlus, Video, X } from "lucide-react";
import { AvatarChip } from "../../../components/avatar-chip";
import { MomentComposeMediaPreview } from "../../../components/moment-compose-media-preview";
import {
  type MomentImageDraft,
  type MomentVideoDraft,
} from "../../moments/moment-compose-media";

// 跟 DesktopMomentComposePanel 对齐：UI 写 N/600 就得把它执行起来，
// 否则用户能看到 1000/600 然后正常发出去——服务端也不卡，UI 自己在撒谎。
const FEED_TEXT_MAX_LENGTH = 600;

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
  const t = useRuntimeTranslator();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const trimmedTextLength = text.trim().length;
  // 仅当 pointerdown 起点就在 backdrop 上时才允许后续 click 关闭面板。
  // 旧逻辑只判断 click 的 event.target===currentTarget，但 click 是 (down → up)
  // 的合成事件，鼠标按在 textarea 上选中文字 → 拖出面板边界 → 释放 → click
  // 事件冒到 backdrop 上 → target===backdrop → 误关闭，用户输入大半的草稿被这层
  // 弱判定吃掉（草稿本身留着，但要重开还得多一步）。
  const downedOnBackdropRef = useRef(false);
  // 走查新一轮 R1：父组件 DesktopFeedWorkspace 把 inline `onClose={() =>
  // setShowCompose(false)}` 当 prop 直传过来 — workspace 在用户敲 compose 文本
  // (onTextChange → composeDraft.setText → page 重渲) / 评论 row 敲键 (commentDrafts
  // 变) / like optimistic 写 cache 等高频路径上都重渲，每次都换一份 onClose
  // identity。原 effect deps=[onClose] → 每次都 removeEventListener("keydown")
  // → addEventListener("keydown") 一圈，跟 wechat-comment-bar R1 (b630be4d3) /
  // wechat-action-bubble R1 (630be4d3) 同款 cleanup-storm。
  // ref 兜最新 onClose；effect deps 走 [] 让 listener 全程只挂一次。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // 走查新一轮 Round 1：用户在 textarea 用中文 / 日文 IME 输入到一半按 ESC
      // 想关候选窗（拼音输入法的常规交互），window 级 ESC 监听器也跟着 fire
      // 把整个发帖面板关掉——还没提交的文字、刚加的图片/视频草稿都看不见了
      // （草稿本身在 composeDraft store 里留着，但用户得重开面板才能看到，
      // 视感上是"打到一半全没了"，与 moment-comment-composer 已加的 isComposing
      // 守卫不一致）。原生 KeyboardEvent 直接有 isComposing；同时也兜 keyCode=229
      // 防个别 IME 在 composing 期间不正确暴露 isComposing。
      if (
        event.isComposing ||
        (event as KeyboardEvent & { keyCode?: number }).keyCode === 229
      ) {
        return;
      }
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div
      className="absolute inset-0 z-20 flex justify-end bg-[rgba(15,23,42,0.12)] backdrop-blur-[2px]"
      onPointerDown={(event) => {
        downedOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (
          downedOnBackdropRef.current &&
          event.target === event.currentTarget
        ) {
          onClose();
        }
        downedOnBackdropRef.current = false;
      }}
    >
      <div className="flex h-full w-full max-w-[380px] flex-col border-l border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.96)] shadow-[-24px_0_48px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] bg-white/82 px-5 py-4 backdrop-blur-xl">
          <div>
            <div className="text-[11px] font-medium tracking-[0.12em] text-[color:var(--text-muted)]">
              {t(msg`发广场动态`)}
            </div>
            <div className="mt-1 text-[16px] font-semibold text-[color:var(--text-primary)]">
              {t(msg`发给世界里的居民看`)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
            aria-label={t(msg`关闭发帖面板`)}
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
                  {ownerUsername ?? t(msg`我`)}
                </div>
                <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                  {t(msg`图文和单条视频都可以直接发到广场`)}
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 py-3 text-[12px] leading-6 text-[color:var(--text-secondary)]">
              {t(msg`图片最多 9 张，视频当前支持 1 条且不超过 5 分钟。图片和视频暂不混发。`)}
            </div>

            <TextAreaField
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder={t(msg`写点想让世界居民都能看到的内容...`)}
              className="mt-5 min-h-[220px] resize-none rounded-[18px] border-[color:var(--border-faint)] bg-white px-4 py-4 leading-7 shadow-none hover:bg-[color:var(--surface-console)] focus:border-[rgba(7,193,96,0.14)] focus:bg-white focus:shadow-none"
              maxLength={FEED_TEXT_MAX_LENGTH}
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
                {t(msg`添加图片`)}
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={!canAddVideo || createPending}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-white px-4 text-[13px] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Video size={15} />
                {videoDraft ? t(msg`更换视频`) : t(msg`添加视频`)}
              </button>
            </div>

            {errorMessage ? (
              <div className="mt-4">
                <ErrorBlock message={errorMessage} />
              </div>
            ) : null}

            <div className="mt-5 border-t border-[color:var(--border-faint)] pt-4">
              <div className="flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                <span>{t(msg`发布后会直接插入到公开流顶部。`)}</span>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    trimmedTextLength > FEED_TEXT_MAX_LENGTH
                      ? "border-[#fdb6b6] bg-[#fff2f2] text-[#d23535]"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
                  )}
                >
                  {trimmedTextLength}/{FEED_TEXT_MAX_LENGTH}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={onClose}
                  className="border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] shadow-none hover:bg-[color:var(--surface-console)]"
                >
                  {t(msg`取消`)}
                </Button>
                <Button
                  variant="primary"
                  disabled={
                    (!text.trim() && !imageDrafts.length && !videoDraft) ||
                    trimmedTextLength > FEED_TEXT_MAX_LENGTH ||
                    createPending
                  }
                  onClick={onCreate}
                  className="bg-[color:var(--brand-primary)] text-white shadow-none hover:opacity-95"
                >
                  {createPending ? t(msg`发布中...`) : t(msg`发布到广场`)}
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
