import {
  Mic,
  Plus,
  SendHorizontal,
  Smile,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { type StickerAttachment } from "@yinjie/contracts";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";
import { useEffect, useRef, useState } from "react";
import { type ChatComposerAttachmentPayload } from "../features/chat/chat-plus-types";
import { MobileSpeechInputSheet } from "./mobile-speech-input-sheet";
import { MobileChatPlusPanel } from "./mobile-chat-plus-panel";
import { MobileChatAttachmentPreview } from "./mobile-chat-attachment-preview";
import { useSpeechInput } from "../features/chat/use-speech-input";
import {
  loadRecentStickers,
  pushRecentSticker,
} from "../features/chat/stickers/recent-stickers";
import { StickerPanel } from "../features/chat/stickers/sticker-panel";

type ChatComposerProps = {
  value: string;
  placeholder: string;
  variant?: "mobile" | "desktop";
  pending?: boolean;
  error?: string | null;
  speechInput?: {
    baseUrl?: string;
    conversationId: string;
    enabled: boolean;
  };
  onSendSticker?: (sticker: StickerAttachment) => void | Promise<void>;
  onSendAttachment?: (
    payload: ChatComposerAttachmentPayload,
  ) => void | Promise<void>;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

type AttachmentDraft =
  | {
      kind: "image";
      file: File;
      fileName: string;
      previewUrl: string;
      width?: number;
      height?: number;
    }
  | {
      kind: "file";
      file: File;
      fileName: string;
      mimeType: string;
      size: number;
    };

export function ChatComposer({
  value,
  placeholder,
  variant = "mobile",
  pending = false,
  error,
  speechInput,
  onSendSticker,
  onSendAttachment,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const { keyboardInset, keyboardOpen } = useKeyboardInset();
  const isDesktop = variant === "desktop";
  const [mobileSpeechSheetOpen, setMobileSpeechSheetOpen] = useState(false);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [plusPanelOpen, setPlusPanelOpen] = useState(false);
  const [attachmentDraft, setAttachmentDraft] =
    useState<AttachmentDraft | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [activeStickerPackId, setActiveStickerPackId] =
    useState("yinjie-mochi");
  const [recentStickers, setRecentStickers] = useState(() =>
    loadRecentStickers(),
  );
  const desktopStickerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const showSpeechEntry = Boolean(
    speechInput?.enabled && speechInput?.conversationId,
  );
  const speech = useSpeechInput({
    baseUrl: speechInput?.baseUrl,
    conversationId: speechInput?.conversationId ?? "",
    enabled: showSpeechEntry,
  });
  const speechSupported = showSpeechEntry && speech.supported;
  const speechDisabledReason =
    showSpeechEntry && !speechSupported
      ? "当前浏览器不支持语音输入，请改用键盘输入。"
      : null;
  const speechButtonDisabled =
    !speechSupported ||
    speech.status === "requesting-permission" ||
    speech.status === "processing";
  const composerError = error ?? speech.error ?? attachmentError;
  const speechDisplayText = speech.displayText.trim();
  const composerPending = pending || attachmentBusy;

  const focusInput = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      const selection = input.value.length;
      input.setSelectionRange(selection, selection);
    });
  };

  const closeMobileTransientSurfaces = () => {
    setStickerPanelOpen(false);
    setPlusPanelOpen(false);
  };

  const commitSpeechInput = () => {
    const mergedValue = speech.commitToInput(value);
    onChange(mergedValue);
    setMobileSpeechSheetOpen(false);
    focusInput();
  };

  const toggleMobileSpeech = async () => {
    if (!speechSupported) {
      return;
    }

    blurActiveElement();
    closeMobileTransientSurfaces();
    setMobileSpeechSheetOpen(true);
    if (speech.status === "idle" || speech.status === "error") {
      await speech.start();
    }
  };

  useEffect(() => {
    if (showSpeechEntry) {
      return;
    }

    setMobileSpeechSheetOpen(false);
  }, [showSpeechEntry]);

  useEffect(() => {
    if (!isDesktop || !stickerPanelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!desktopStickerRef.current?.contains(event.target as Node)) {
        setStickerPanelOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isDesktop, stickerPanelOpen]);

  useEffect(() => {
    return () => {
      if (attachmentDraft?.kind === "image") {
        URL.revokeObjectURL(attachmentDraft.previewUrl);
      }
    };
  }, [attachmentDraft]);

  const toggleStickerPanel = () => {
    if (!onSendSticker) {
      return;
    }

    if (speech.status === "listening") {
      speech.stop();
    }
    setPlusPanelOpen(false);
    setAttachmentError(null);
    setStickerPanelOpen((current) => !current);
  };

  const togglePlusPanel = () => {
    if (!onSendAttachment || isDesktop) {
      return;
    }

    blurActiveElement();
    if (speech.status === "listening") {
      speech.stop();
    }
    setStickerPanelOpen(false);
    setAttachmentError(null);
    setPlusPanelOpen((current) => !current);
  };

  const handleSendSticker = async (sticker: StickerAttachment) => {
    if (!onSendSticker) {
      return;
    }

    setAttachmentError(null);
    await onSendSticker(sticker);
    setRecentStickers(pushRecentSticker(sticker.packId, sticker.stickerId));
    setStickerPanelOpen(false);
  };

  const pickAlbum = () => {
    if (attachmentBusy) {
      return;
    }

    setAttachmentError(null);
    albumInputRef.current?.click();
  };

  const pickCamera = () => {
    if (attachmentBusy) {
      return;
    }

    setAttachmentError(null);
    cameraInputRef.current?.click();
  };

  const pickFile = () => {
    if (attachmentBusy) {
      return;
    }

    setAttachmentError(null);
    fileInputRef.current?.click();
  };

  const handleImageSelection = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    try {
      const draft = await createImageDraft(file);
      if (attachmentDraft?.kind === "image") {
        URL.revokeObjectURL(attachmentDraft.previewUrl);
      }
      setAttachmentError(null);
      setPlusPanelOpen(false);
      setAttachmentDraft(draft);
    } catch (fileError) {
      setAttachmentError(
        fileError instanceof Error
          ? fileError.message
          : "读取图片失败，请换一张再试。",
      );
    }
  };

  const handleGenericFileSelection = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    if (attachmentDraft?.kind === "image") {
      URL.revokeObjectURL(attachmentDraft.previewUrl);
    }

    setAttachmentError(null);
    setPlusPanelOpen(false);
    setAttachmentDraft({
      kind: "file",
      file,
      fileName: file.name || "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
  };

  const handleCancelAttachmentDraft = () => {
    if (attachmentDraft?.kind === "image") {
      URL.revokeObjectURL(attachmentDraft.previewUrl);
    }
    setAttachmentDraft(null);
  };

  const handleSendAttachment = async (
    payload: ChatComposerAttachmentPayload,
  ) => {
    if (!onSendAttachment) {
      return false;
    }

    setAttachmentBusy(true);
    setAttachmentError(null);

    try {
      await onSendAttachment(payload);
      setPlusPanelOpen(false);
      return true;
    } catch (attachmentActionError) {
      setAttachmentError(
        attachmentActionError instanceof Error
          ? attachmentActionError.message
          : "附件发送失败，请稍后再试。",
      );
      return false;
    } finally {
      setAttachmentBusy(false);
    }
  };

  const handleSendDraftAttachment = async () => {
    if (!attachmentDraft) {
      return;
    }

    const currentDraft = attachmentDraft;
    const sent =
      currentDraft.kind === "image"
        ? await handleSendAttachment({
            type: "image",
            file: currentDraft.file,
            fileName: currentDraft.fileName,
            width: currentDraft.width,
            height: currentDraft.height,
          })
        : await handleSendAttachment({
            type: "file",
            file: currentDraft.file,
            fileName: currentDraft.fileName,
            mimeType: currentDraft.mimeType,
            size: currentDraft.size,
          });

    if (sent) {
      handleCancelAttachmentDraft();
    }
  };

  return (
    <>
      <div
        className={
          isDesktop
            ? "border-t border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,254,249,0.98),rgba(255,248,239,0.98))] px-4 py-3"
            : "border-t border-white/70 bg-[linear-gradient(180deg,rgba(255,254,250,0.90),rgba(255,248,236,0.94))] px-3 pt-2 backdrop-blur-xl"
        }
        style={{
          paddingBottom: keyboardOpen
            ? `${keyboardInset}px`
            : isDesktop
              ? "0.75rem"
              : "0.35rem",
        }}
      >
        {!isDesktop && attachmentDraft ? (
          <MobileChatAttachmentPreview
            kind={attachmentDraft.kind}
            fileName={attachmentDraft.fileName}
            previewUrl={
              attachmentDraft.kind === "image"
                ? attachmentDraft.previewUrl
                : undefined
            }
            mimeType={
              attachmentDraft.kind === "file"
                ? attachmentDraft.mimeType
                : undefined
            }
            size={
              attachmentDraft.kind === "file" ? attachmentDraft.size : undefined
            }
            pending={attachmentBusy}
            onCancel={handleCancelAttachmentDraft}
            onSend={handleSendDraftAttachment}
          />
        ) : null}
        <div
          ref={isDesktop ? desktopStickerRef : undefined}
          className={`relative flex items-center gap-2 ${isDesktop ? "rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 shadow-[var(--shadow-soft)]" : ""}`}
        >
          {isDesktop ? (
            <>
              <button
                type="button"
                onClick={toggleStickerPanel}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]",
                  stickerPanelOpen
                    ? "bg-[color:var(--surface-soft)] text-[color:var(--brand-primary)]"
                    : "",
                )}
                aria-label="表情"
              >
                <Smile size={18} />
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]"
                aria-label="更多功能"
              >
                <Plus size={18} />
              </button>
            </>
          ) : showSpeechEntry ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void toggleMobileSpeech()}
              disabled={speechButtonDisabled}
              title={speechDisabledReason ?? undefined}
              className={cn(
                "h-10 w-10 rounded-full border border-white/70 bg-white/80 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45",
                speech.status === "listening"
                  ? "border-[rgba(249,115,22,0.35)] text-[color:var(--brand-primary)]"
                  : "",
              )}
              aria-label={speechDisabledReason ?? "语音输入"}
            >
              {speech.status === "listening" ? (
                <Square size={16} fill="currentColor" />
              ) : (
                <Mic size={18} />
              )}
            </Button>
          ) : null}

          <div
            className={`flex min-w-0 flex-1 items-center gap-2 ${isDesktop ? "" : "rounded-[24px] border border-white/80 bg-white/90 px-3 py-2 shadow-[var(--shadow-soft)]"}`}
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onFocus={() => setPlusPanelOpen(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && value.trim()) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
            {!isDesktop ? (
              <button
                type="button"
                onClick={toggleStickerPanel}
                className="text-[color:var(--text-secondary)]"
                aria-label="表情"
              >
                <Smile size={18} />
              </button>
            ) : showSpeechEntry ? (
              <button
                type="button"
                onClick={() => {
                  if (speech.status === "listening") {
                    speech.stop();
                    return;
                  }
                  setStickerPanelOpen(false);
                  void speech.start();
                }}
                disabled={speechButtonDisabled && speech.status !== "listening"}
                title={speechDisabledReason ?? undefined}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-45",
                  speech.status === "listening"
                    ? "bg-[color:var(--surface-soft)] text-[color:var(--brand-primary)]"
                    : "",
                )}
                aria-label={
                  speechDisabledReason ??
                  (speech.status === "listening" ? "停止语音输入" : "语音输入")
                }
              >
                {speech.status === "listening" ? (
                  <Square size={15} fill="currentColor" />
                ) : (
                  <Mic size={18} />
                )}
              </button>
            ) : null}
          </div>

          {value.trim() ? (
            <Button
              onClick={onSubmit}
              disabled={composerPending}
              variant="primary"
              className={
                isDesktop
                  ? "h-10 rounded-[14px] bg-[var(--brand-gradient)] px-5 text-sm font-medium text-white shadow-[0_6px_16px_rgba(160,90,10,0.18)] hover:opacity-95"
                  : "h-10 rounded-[18px] bg-[linear-gradient(135deg,#fbbf24,#f97316)] px-4 text-sm font-medium shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
              }
            >
              发送
            </Button>
          ) : !isDesktop ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={togglePlusPanel}
              disabled={!onSendAttachment || attachmentBusy}
              className={cn(
                "h-10 w-10 rounded-full border border-white/70 bg-white/80 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)] hover:bg-white disabled:cursor-not-allowed disabled:opacity-45",
                plusPanelOpen
                  ? "border-[rgba(249,115,22,0.35)] text-[color:var(--brand-primary)]"
                  : "",
              )}
              aria-label="更多功能"
            >
              <Plus size={18} />
            </Button>
          ) : (
            <div className="h-10 w-[74px]" />
          )}

          {stickerPanelOpen && onSendSticker ? (
            <StickerPanel
              variant={variant}
              activePackId={activeStickerPackId}
              recentItems={recentStickers}
              onClose={() => setStickerPanelOpen(false)}
              onPackChange={setActiveStickerPackId}
              onSelect={(sticker) => void handleSendSticker(sticker)}
            />
          ) : null}
        </div>
        {!isDesktop && onSendAttachment ? (
          <MobileChatPlusPanel
            open={plusPanelOpen}
            busy={attachmentBusy}
            onPickAlbum={pickAlbum}
            onPickCamera={pickCamera}
            onPickFile={pickFile}
            onSelectContactCard={(attachment) =>
              void handleSendAttachment({
                type: "contact_card",
                attachment,
              })
            }
            onSelectLocationCard={(attachment) =>
              void handleSendAttachment({
                type: "location_card",
                attachment,
              })
            }
          />
        ) : null}
        {speechDisabledReason ? (
          <InlineNotice className="mt-2 text-xs" tone="muted">
            {speechDisabledReason}
          </InlineNotice>
        ) : null}
        {!isDesktop && speech.status === "ready" && speechDisplayText ? (
          <InlineNotice
            className="mt-2 flex items-center justify-between gap-3 text-xs"
            tone="info"
          >
            <span className="truncate">识别完成：{speechDisplayText}</span>
            <button
              type="button"
              onClick={commitSpeechInput}
              className="shrink-0 text-[color:var(--brand-primary)]"
            >
              插入输入框
            </button>
          </InlineNotice>
        ) : null}
        {isDesktop && (speech.status !== "idle" || speechDisplayText) ? (
          <InlineNotice
            className="mt-2 flex flex-wrap items-center gap-2 text-xs"
            tone={speech.error ? "danger" : "info"}
          >
            <span>
              {speech.status === "listening"
                ? "正在聆听..."
                : speech.status === "processing"
                  ? "正在转写语音..."
                  : speech.status === "ready"
                    ? `识别完成：${speechDisplayText}`
                    : speech.status === "requesting-permission"
                      ? "正在请求麦克风权限..."
                      : (composerError ?? "语音输入已停止")}
            </span>
            {speech.status === "ready" && speech.canCommit ? (
              <button
                type="button"
                onClick={commitSpeechInput}
                className="inline-flex items-center gap-1 text-[color:var(--brand-primary)]"
              >
                <WandSparkles size={12} />
                插入输入框
              </button>
            ) : null}
            {speech.status === "listening" ? (
              <button
                type="button"
                onClick={speech.stop}
                className="text-[color:var(--brand-primary)]"
              >
                停止
              </button>
            ) : null}
            {speech.status !== "idle" ? (
              <button
                type="button"
                onClick={speech.cancel}
                className="inline-flex items-center gap-1 text-[color:var(--text-secondary)]"
              >
                <X size={12} />
                取消
              </button>
            ) : null}
          </InlineNotice>
        ) : null}
        {composerError && !isDesktop ? (
          <InlineNotice className="mt-2 text-xs" tone="danger">
            {composerError}
          </InlineNotice>
        ) : null}
        {composerPending ? (
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[color:var(--text-muted)]">
            <SendHorizontal size={12} />
            <span>正在发送...</span>
          </div>
        ) : null}
        {!isDesktop ? (
          <>
            <input
              ref={albumInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void handleImageSelection(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                void handleImageSelection(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                handleGenericFileSelection(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </>
        ) : null}
      </div>
      <MobileSpeechInputSheet
        open={showSpeechEntry && mobileSpeechSheetOpen}
        supported={speech.supported}
        status={speech.status}
        text={speechDisplayText}
        error={speech.error}
        onClose={() => {
          if (
            speech.status === "listening" ||
            speech.status === "processing" ||
            speech.status === "requesting-permission"
          ) {
            speech.cancel();
          }
          setMobileSpeechSheetOpen(false);
        }}
        onStart={() => void speech.start()}
        onStop={speech.stop}
        onCancel={() => {
          speech.cancel();
          setMobileSpeechSheetOpen(false);
        }}
        onCommit={commitSpeechInput}
        canCommit={speech.canCommit}
      />
      {isDesktop && error ? (
        <div className="px-4 pb-3">
          <InlineNotice className="text-xs" tone="danger">
            {error}
          </InlineNotice>
        </div>
      ) : null}
    </>
  );
}

async function createImageDraft(
  file: File,
): Promise<Extract<AttachmentDraft, { kind: "image" }>> {
  if (!file.type.startsWith("image/")) {
    throw new Error("当前只支持图片附件。");
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const size = await readImageDimensions(previewUrl);
    return {
      kind: "image",
      file,
      fileName: file.name || "image",
      previewUrl,
      width: size.width,
      height: size.height,
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

function readImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error("图片解析失败，请换一张再试。"));
    image.src = url;
  });
}

function blurActiveElement() {
  if (typeof document === "undefined") {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}
