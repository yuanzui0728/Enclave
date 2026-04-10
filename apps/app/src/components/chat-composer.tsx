import {
  FileText,
  ImageIcon,
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
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type ReactNode,
} from "react";
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
  replyPreview?: {
    senderName: string;
    text: string;
  } | null;
  onCancelReply?: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

type ImageDraft = {
  file: File;
  fileName: string;
  previewUrl: string;
  width?: number;
  height?: number;
};

type AttachmentDraft =
  | {
      kind: "images";
      items: ImageDraft[];
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
  replyPreview = null,
  onCancelReply,
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
  const desktopPlusRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [desktopPlusMenuOpen, setDesktopPlusMenuOpen] = useState(false);
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
    if (!isDesktop || !desktopPlusMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!desktopPlusRef.current?.contains(event.target as Node)) {
        setDesktopPlusMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [desktopPlusMenuOpen, isDesktop]);

  useEffect(() => {
    return () => {
      releaseAttachmentDraft(attachmentDraft);
    };
  }, [attachmentDraft]);

  const toggleStickerPanel = () => {
    if (!onSendSticker) {
      return;
    }

    if (speech.status === "listening") {
      speech.stop();
    }
    setDesktopPlusMenuOpen(false);
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

  const toggleDesktopPlusMenu = () => {
    if (!onSendAttachment || !isDesktop) {
      return;
    }

    if (speech.status === "listening") {
      speech.stop();
    }
    setStickerPanelOpen(false);
    setAttachmentError(null);
    setDesktopPlusMenuOpen((current) => !current);
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
    const files = [...(fileList ?? [])].slice(0, MAX_ALBUM_IMAGE_COUNT);
    if (!files.length) {
      return;
    }

    await applyImageDraftFiles(files);
  };

  const applyImageDraftFiles = async (files: File[]) => {
    try {
      const draftItems = await Promise.all(
        files.map((file) => createImageDraft(file)),
      );
      releaseAttachmentDraft(attachmentDraft);
      setAttachmentError(null);
      setPlusPanelOpen(false);
      setDesktopPlusMenuOpen(false);
      setAttachmentDraft({
        kind: "images",
        items: draftItems,
      });
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

    applyGenericFileDraft(file);
  };

  const applyGenericFileDraft = (file: File) => {
    releaseAttachmentDraft(attachmentDraft);

    setAttachmentError(null);
    setPlusPanelOpen(false);
    setDesktopPlusMenuOpen(false);
    setAttachmentDraft({
      kind: "file",
      file,
      fileName: file.name || "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
  };

  const handleDesktopPaste = async (
    event: ClipboardEvent<HTMLInputElement>,
  ) => {
    if (!isDesktop || !onSendAttachment || attachmentBusy) {
      return;
    }

    const pastedFiles = extractClipboardFiles(event.clipboardData);
    if (!pastedFiles.length) {
      return;
    }

    event.preventDefault();

    const imageFiles = pastedFiles.filter((file) =>
      file.type.startsWith("image/"),
    );

    if (imageFiles.length === pastedFiles.length) {
      await applyImageDraftFiles(imageFiles.slice(0, MAX_ALBUM_IMAGE_COUNT));
      return;
    }

    applyGenericFileDraft(pastedFiles[0]);
  };

  const handleCancelAttachmentDraft = () => {
    releaseAttachmentDraft(attachmentDraft);
    setAttachmentDraft(null);
  };

  const handleRemoveDraftImage = (index: number) => {
    setAttachmentDraft((currentDraft) => {
      if (!currentDraft || currentDraft.kind !== "images") {
        return currentDraft;
      }

      const target = currentDraft.items[index];
      if (!target) {
        return currentDraft;
      }

      URL.revokeObjectURL(target.previewUrl);
      const nextItems = currentDraft.items.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      if (!nextItems.length) {
        return null;
      }

      return {
        kind: "images",
        items: nextItems,
      };
    });
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
    if (currentDraft.kind === "images") {
      setAttachmentBusy(true);
      setAttachmentError(null);

      try {
        for (const item of currentDraft.items) {
          await onSendAttachment?.({
            type: "image",
            file: item.file,
            fileName: item.fileName,
            width: item.width,
            height: item.height,
          });
        }

        setPlusPanelOpen(false);
        handleCancelAttachmentDraft();
      } catch (attachmentActionError) {
        setAttachmentError(
          attachmentActionError instanceof Error
            ? attachmentActionError.message
            : "图片发送失败，请稍后再试。",
        );
      } finally {
        setAttachmentBusy(false);
      }

      return;
    }

    const sent = await handleSendAttachment({
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
            fileName={
              attachmentDraft.kind === "images"
                ? (attachmentDraft.items[0]?.fileName ?? "image")
                : attachmentDraft.fileName
            }
            imagePreviews={
              attachmentDraft.kind === "images"
                ? attachmentDraft.items.map((item) => ({
                    fileName: item.fileName,
                    previewUrl: item.previewUrl,
                  }))
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
            onRemoveImage={
              attachmentDraft.kind === "images"
                ? handleRemoveDraftImage
                : undefined
            }
            onSend={handleSendDraftAttachment}
          />
        ) : null}
        {isDesktop && attachmentDraft ? (
          <DesktopAttachmentDraftBar
            draft={attachmentDraft}
            pending={attachmentBusy}
            onCancel={handleCancelAttachmentDraft}
            onRemoveImage={
              attachmentDraft.kind === "images"
                ? handleRemoveDraftImage
                : undefined
            }
            onSend={handleSendDraftAttachment}
          />
        ) : null}
        {replyPreview ? (
          <ReplyPreviewBar
            senderName={replyPreview.senderName}
            text={replyPreview.text}
            onClose={onCancelReply}
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
              {onSendAttachment ? (
                <div ref={desktopPlusRef} className="relative">
                  <button
                    type="button"
                    onClick={toggleDesktopPlusMenu}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]",
                      desktopPlusMenuOpen
                        ? "bg-[color:var(--surface-soft)] text-[color:var(--brand-primary)]"
                        : "",
                    )}
                    aria-label="更多功能"
                  >
                    <Plus size={18} />
                  </button>

                  {desktopPlusMenuOpen ? (
                    <div className="absolute left-0 top-[calc(100%+0.55rem)] z-30 w-40 overflow-hidden rounded-[16px] border border-black/6 bg-white py-1.5 shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
                      <DesktopPlusMenuButton
                        label="发送图片"
                        icon={<ImageIcon size={15} />}
                        onClick={() => {
                          setDesktopPlusMenuOpen(false);
                          pickAlbum();
                        }}
                      />
                      <DesktopPlusMenuButton
                        label="发送文件"
                        icon={<FileText size={15} />}
                        onClick={() => {
                          setDesktopPlusMenuOpen(false);
                          pickFile();
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
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
              onPaste={(event) => {
                void handleDesktopPaste(event);
              }}
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
                  ? "h-10 rounded-[14px] bg-[var(--brand-gradient)] px-5 text-sm font-medium text-[color:var(--text-on-brand)] shadow-[0_6px_16px_rgba(160,90,10,0.18)] hover:opacity-95"
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
        {onSendAttachment ? (
          <>
            <input
              ref={albumInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                void handleImageSelection(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            {!isDesktop ? (
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
            ) : null}
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

function DesktopPlusMenuButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-[color:var(--text-primary)] transition hover:bg-[#f5f5f5]"
    >
      <span className="text-[color:var(--text-secondary)]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function DesktopAttachmentDraftBar({
  draft,
  pending,
  onCancel,
  onRemoveImage,
  onSend,
}: {
  draft: AttachmentDraft;
  pending: boolean;
  onCancel: () => void;
  onRemoveImage?: (index: number) => void;
  onSend: () => void;
}) {
  return (
    <div className="mb-3 rounded-[20px] border border-[color:var(--border-faint)] bg-white/92 px-4 py-3 shadow-[var(--shadow-soft)]">
      {draft.kind === "images" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {draft.items.map((item, index) => (
              <div
                key={`${item.previewUrl}-${index}`}
                className="relative h-16 w-16 overflow-hidden rounded-[14px] border border-black/6 bg-[#f4f4f4]"
              >
                <img
                  src={item.previewUrl}
                  alt={item.fileName}
                  className="h-full w-full object-cover"
                />
                {onRemoveImage ? (
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70"
                    aria-label={`移除 ${item.fileName}`}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3 text-[12px] text-[color:var(--text-muted)]">
            已选择 {draft.items.length} 张图片
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(249,115,22,0.10)] text-[color:var(--brand-primary)]">
            <FileText size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
              {draft.fileName}
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {formatDraftFileSize(draft.size)}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
          className="rounded-[14px]"
        >
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onSend}
          disabled={pending}
          className="rounded-[14px]"
        >
          {pending ? "正在发送..." : "发送附件"}
        </Button>
      </div>
    </div>
  );
}

function ReplyPreviewBar({
  senderName,
  text,
  onClose,
}: {
  senderName: string;
  text: string;
  onClose?: () => void;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-[18px] border border-black/6 bg-white/90 px-4 py-3 shadow-[var(--shadow-soft)]">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
          回复 {senderName}
        </div>
        <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-[color:var(--text-secondary)]">
          {text}
        </div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--text-primary)]"
          aria-label="取消回复"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}

async function createImageDraft(file: File): Promise<ImageDraft> {
  if (!file.type.startsWith("image/")) {
    throw new Error("当前只支持图片附件。");
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const size = await readImageDimensions(previewUrl);
    return {
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

function releaseAttachmentDraft(draft: AttachmentDraft | null) {
  if (!draft || draft.kind !== "images") {
    return;
  }

  for (const item of draft.items) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

function extractClipboardFiles(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return [];
  }

  const filesFromItems = [...clipboardData.items]
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (filesFromItems.length) {
    return filesFromItems;
  }

  return [...clipboardData.files];
}

const MAX_ALBUM_IMAGE_COUNT = 9;

function formatDraftFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}
