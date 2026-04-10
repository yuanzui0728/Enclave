import {
  FileText,
  ImageIcon,
  Keyboard,
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
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { type ChatComposerAttachmentPayload } from "../features/chat/chat-plus-types";
import { AvatarChip } from "./avatar-chip";
import { MobileSpeechInputSheet } from "./mobile-speech-input-sheet";
import { MobileChatPlusPanel } from "./mobile-chat-plus-panel";
import { MobileChatAttachmentPreview } from "./mobile-chat-attachment-preview";
import { MobileMentionPickerSheet } from "../features/chat/mobile-mention-picker-sheet";
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
  onSendPresetText?: (text: string) => void | Promise<void>;
  mentionCandidates?: Array<{
    id: string;
    name: string;
    subtitle?: string;
    avatar?: string | null;
  }>;
  replyPreview?: {
    senderName: string;
    text: string;
    modeLabel?: string;
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
  onSendPresetText,
  mentionCandidates,
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
  const [mobilePlusNotice, setMobilePlusNotice] = useState<string | null>(null);
  const [activeStickerPackId, setActiveStickerPackId] =
    useState("yinjie-mochi");
  const [recentStickers, setRecentStickers] = useState(() =>
    loadRecentStickers(),
  );
  const desktopStickerRef = useRef<HTMLDivElement | null>(null);
  const desktopPlusRef = useRef<HTMLDivElement | null>(null);
  const desktopDropDepthRef = useRef(0);
  const desktopInputRef = useRef<HTMLInputElement | null>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSpeechPointerIdRef = useRef<number | null>(null);
  const mobileSpeechStartYRef = useRef<number | null>(null);
  const mobileSpeechAutoCommitRef = useRef(false);
  const mobileSpeechCancelIntentRef = useRef(false);
  const [desktopPlusMenuOpen, setDesktopPlusMenuOpen] = useState(false);
  const [desktopDropActive, setDesktopDropActive] = useState(false);
  const [inputCursor, setInputCursor] = useState(0);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<number | null>(null);
  const [mobileMentionDismissed, setMobileMentionDismissed] = useState(false);
  const [mobileSpeechPressing, setMobileSpeechPressing] = useState(false);
  const [mobileSpeechCancelIntent, setMobileSpeechCancelIntent] =
    useState(false);
  const [mobileInputMode, setMobileInputMode] = useState<"text" | "speech">(
    "text",
  );
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
  const mobileSpeechMode =
    !isDesktop && showSpeechEntry && mobileInputMode === "speech";
  const activeMention = useMemo(
    () =>
      mentionCandidates?.length && !mobileSpeechMode
        ? findActiveMentionToken(value, inputCursor || value.length)
        : null,
    [inputCursor, mentionCandidates, mobileSpeechMode, value],
  );
  const filteredMentionCandidates = useMemo(() => {
    if (!activeMention || !mentionCandidates?.length) {
      return [];
    }

    const query = activeMention.query.trim().toLowerCase();
    const normalized = mentionCandidates.filter((candidate) => {
      if (!query) {
        return true;
      }

      return (
        candidate.name.toLowerCase().includes(query) ||
        (candidate.subtitle ?? "").toLowerCase().includes(query)
      );
    });

    return normalized
      .sort((left, right) => {
        const leftStartsWith = left.name.toLowerCase().startsWith(query);
        const rightStartsWith = right.name.toLowerCase().startsWith(query);
        if (leftStartsWith === rightStartsWith) {
          return left.name.localeCompare(right.name, "zh-CN");
        }
        return leftStartsWith ? -1 : 1;
      })
      .slice(0, 6);
  }, [activeMention, mentionCandidates]);
  const mentionPickerOpen = Boolean(filteredMentionCandidates.length);

  const getActiveInput = () =>
    (isDesktop ? desktopInputRef.current : mobileTextareaRef.current) ??
    desktopInputRef.current ??
    mobileTextareaRef.current;

  const focusInput = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      const input = getActiveInput();
      if (!input) {
        return;
      }

      input.focus();
      const selection = input.value.length;
      input.setSelectionRange(selection, selection);
    });
  };

  const syncInputCursor = () => {
    const input = getActiveInput();
    if (!input) {
      return;
    }

    setInputCursor(input.selectionStart ?? value.length);
  };

  const closeMobileTransientSurfaces = () => {
    setStickerPanelOpen(false);
    setPlusPanelOpen(false);
    setMobilePlusNotice(null);
  };

  const setMobileSpeechCancelState = (nextValue: boolean) => {
    mobileSpeechCancelIntentRef.current = nextValue;
    setMobileSpeechCancelIntent(nextValue);
  };

  const resetMobileSpeechGesture = () => {
    mobileSpeechPointerIdRef.current = null;
    mobileSpeechStartYRef.current = null;
    setMobileSpeechPressing(false);
    setMobileSpeechCancelState(false);
  };

  const closeMobileSpeechSheet = () => {
    mobileSpeechAutoCommitRef.current = false;
    resetMobileSpeechGesture();
    setMobileSpeechSheetOpen(false);
  };

  const cancelMobileSpeech = () => {
    speech.cancel();
    closeMobileSpeechSheet();
  };

  const commitSpeechInput = () => {
    const mergedValue = speech.commitToInput(value);
    onChange(mergedValue);
    setMobileInputMode("text");
    closeMobileSpeechSheet();
    focusInput();
  };

  const handleMobileSpeechPressStart = async (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (
      !mobileSpeechMode ||
      !speechSupported ||
      speech.status === "processing"
    ) {
      return;
    }

    blurActiveElement();
    closeMobileTransientSurfaces();
    if (speech.status !== "idle") {
      speech.cancel();
    }
    mobileSpeechAutoCommitRef.current = true;
    mobileSpeechPointerIdRef.current = event.pointerId;
    mobileSpeechStartYRef.current = event.clientY;
    setMobileSpeechPressing(true);
    setMobileSpeechCancelState(false);
    setMobileSpeechSheetOpen(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    await speech.start();
  };

  const handleMobileSpeechPressMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (mobileSpeechPointerIdRef.current !== event.pointerId) {
      return;
    }

    const startY = mobileSpeechStartYRef.current;
    if (startY === null) {
      return;
    }

    setMobileSpeechCancelState(
      startY - event.clientY >= MOBILE_SPEECH_CANCEL_DISTANCE,
    );
  };

  const releaseMobileSpeechPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (mobileSpeechPointerIdRef.current !== event.pointerId) {
      return false;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    mobileSpeechPointerIdRef.current = null;
    mobileSpeechStartYRef.current = null;
    setMobileSpeechPressing(false);
    return true;
  };

  const handleMobileSpeechPressEnd = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!releaseMobileSpeechPointer(event)) {
      return;
    }

    const shouldCancel = mobileSpeechCancelIntentRef.current;
    setMobileSpeechCancelState(false);

    if (shouldCancel) {
      cancelMobileSpeech();
      return;
    }

    if (
      speech.status === "listening" ||
      speech.status === "requesting-permission"
    ) {
      speech.stop();
      return;
    }

    if (speech.status === "idle") {
      closeMobileSpeechSheet();
    }
  };

  const handleMobileSpeechPressCancel = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!releaseMobileSpeechPointer(event)) {
      return;
    }

    cancelMobileSpeech();
  };

  const toggleMobileInputMode = () => {
    if (!showSpeechEntry) {
      return;
    }

    blurActiveElement();
    closeMobileTransientSurfaces();
    const nextMode = mobileInputMode === "text" ? "speech" : "text";
    if (nextMode === "text") {
      if (speech.status !== "idle") {
        speech.cancel();
      }
      closeMobileSpeechSheet();
      setMobileInputMode(nextMode);
      focusInput();
      return;
    }
    setMobileInputMode(nextMode);
  };

  useEffect(() => {
    if (showSpeechEntry) {
      return;
    }

    setMobileInputMode("text");
    closeMobileSpeechSheet();
  }, [showSpeechEntry]);

  useEffect(() => {
    if (
      isDesktop ||
      !mobileSpeechSheetOpen ||
      !mobileSpeechAutoCommitRef.current ||
      mobileSpeechPressing
    ) {
      return;
    }

    if (speech.status === "ready" && speech.canCommit) {
      commitSpeechInput();
      return;
    }

    if (speech.status === "idle" && !speech.canCommit) {
      closeMobileSpeechSheet();
    }
  }, [
    commitSpeechInput,
    isDesktop,
    mobileSpeechPressing,
    mobileSpeechSheetOpen,
    speech.canCommit,
    speech.status,
  ]);

  useEffect(() => {
    if (isDesktop) {
      return;
    }

    const input = mobileTextareaRef.current;
    if (!(input instanceof HTMLTextAreaElement)) {
      return;
    }

    input.style.height = "0px";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 38), 108)}px`;
  }, [isDesktop, value]);

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

  useEffect(() => {
    if (isDesktop && onSendAttachment && !attachmentBusy) {
      return;
    }

    desktopDropDepthRef.current = 0;
    setDesktopDropActive(false);
  }, [attachmentBusy, isDesktop, onSendAttachment]);

  useEffect(() => {
    if (!mentionPickerOpen) {
      setMentionActiveIndex(0);
      return;
    }

    setMentionActiveIndex((current) =>
      Math.min(current, filteredMentionCandidates.length - 1),
    );
  }, [filteredMentionCandidates.length, mentionPickerOpen]);

  useEffect(() => {
    if (!activeMention) {
      setMobileMentionDismissed(false);
      return;
    }

    setMobileMentionDismissed(false);
  }, [activeMention?.query, activeMention?.start]);

  useEffect(() => {
    if (pendingSelection === null) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const input = getActiveInput();
      if (!input) {
        setPendingSelection(null);
        return;
      }

      input.focus();
      input.setSelectionRange(pendingSelection, pendingSelection);
      setInputCursor(pendingSelection);
      setPendingSelection(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isDesktop, pendingSelection, value]);

  const toggleStickerPanel = () => {
    if (!onSendSticker) {
      return;
    }

    if (!isDesktop) {
      if (speech.status !== "idle") {
        speech.cancel();
      }
      closeMobileSpeechSheet();
      setMobileInputMode("text");
      setAttachmentError(null);
      setMobilePlusNotice(null);
      setPlusPanelOpen(false);

      if (stickerPanelOpen) {
        setStickerPanelOpen(false);
        focusInput();
        return;
      }

      blurActiveElement();
      setStickerPanelOpen(true);
      return;
    }

    if (speech.status === "listening") {
      speech.stop();
    }
    setDesktopPlusMenuOpen(false);
    setPlusPanelOpen(false);
    setAttachmentError(null);
    setMobilePlusNotice(null);
    setStickerPanelOpen((current) => !current);
  };

  const togglePlusPanel = () => {
    if (!onSendAttachment || isDesktop) {
      return;
    }

    blurActiveElement();
    if (speech.status !== "idle") {
      speech.cancel();
    }
    closeMobileSpeechSheet();
    setMobileInputMode("text");
    setStickerPanelOpen(false);
    setAttachmentError(null);
    setMobilePlusNotice(null);
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
    setMobilePlusNotice(null);
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
    setMobilePlusNotice(null);
    albumInputRef.current?.click();
  };

  const pickCamera = () => {
    if (attachmentBusy) {
      return;
    }

    setAttachmentError(null);
    setMobilePlusNotice(null);
    cameraInputRef.current?.click();
  };

  const pickFile = () => {
    if (attachmentBusy) {
      return;
    }

    setAttachmentError(null);
    setMobilePlusNotice(null);
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
      setMobilePlusNotice(null);
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
    setMobilePlusNotice(null);
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

  const handleDesktopDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!isDesktop || !onSendAttachment || attachmentBusy) {
      return;
    }

    const droppedFiles = extractClipboardFiles(event.dataTransfer);
    if (!droppedFiles.length) {
      return;
    }

    event.preventDefault();
    desktopDropDepthRef.current += 1;
    setDesktopDropActive(true);
  };

  const handleDesktopDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isDesktop || !onSendAttachment || attachmentBusy) {
      return;
    }

    const droppedFiles = extractClipboardFiles(event.dataTransfer);
    if (!droppedFiles.length) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDesktopDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!isDesktop || !onSendAttachment) {
      return;
    }

    const relatedTarget = event.relatedTarget;
    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    ) {
      return;
    }

    desktopDropDepthRef.current = Math.max(desktopDropDepthRef.current - 1, 0);
    if (desktopDropDepthRef.current === 0) {
      setDesktopDropActive(false);
    }
  };

  const handleDesktopDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (!isDesktop || !onSendAttachment || attachmentBusy) {
      return;
    }

    const droppedFiles = extractClipboardFiles(event.dataTransfer);
    if (!droppedFiles.length) {
      return;
    }

    event.preventDefault();
    desktopDropDepthRef.current = 0;
    setDesktopDropActive(false);

    const imageFiles = droppedFiles.filter((file) =>
      file.type.startsWith("image/"),
    );
    if (imageFiles.length === droppedFiles.length) {
      await applyImageDraftFiles(imageFiles.slice(0, MAX_ALBUM_IMAGE_COUNT));
      return;
    }

    applyGenericFileDraft(droppedFiles[0]);
  };

  const handleCancelAttachmentDraft = () => {
    releaseAttachmentDraft(attachmentDraft);
    setAttachmentDraft(null);
  };

  const applyMentionCandidate = (candidate: {
    id: string;
    name: string;
    subtitle?: string;
    avatar?: string | null;
  }) => {
    if (!activeMention) {
      return;
    }

    const mentionText = `@${candidate.name} `;
    const nextValue = `${value.slice(0, activeMention.start)}${mentionText}${value.slice(activeMention.end)}`;
    onChange(nextValue);
    setMentionActiveIndex(0);
    setMobileMentionDismissed(false);
    setPendingSelection(activeMention.start + mentionText.length);
  };

  const handleDesktopInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (mentionPickerOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionActiveIndex((current) =>
          current >= filteredMentionCandidates.length - 1 ? 0 : current + 1,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionActiveIndex((current) =>
          current <= 0 ? filteredMentionCandidates.length - 1 : current - 1,
        );
        return;
      }

      if (event.key === "Enter") {
        const targetCandidate = filteredMentionCandidates[mentionActiveIndex];
        if (targetCandidate) {
          event.preventDefault();
          applyMentionCandidate(targetCandidate);
          return;
        }
      }
    }

    if (event.key === "Enter" && value.trim()) {
      event.preventDefault();
      onSubmit();
    }
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
    setMobilePlusNotice(null);

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

  const handleSendPresetText = async (text: string) => {
    if (!onSendPresetText) {
      return false;
    }

    const normalized = text.trim();
    if (!normalized) {
      return false;
    }

    setAttachmentBusy(true);
    setAttachmentError(null);
    setMobilePlusNotice(null);

    try {
      await onSendPresetText(normalized);
      setPlusPanelOpen(false);
      return true;
    } catch (presetTextError) {
      setAttachmentError(
        presetTextError instanceof Error
          ? presetTextError.message
          : "发送失败，请稍后再试。",
      );
      return false;
    } finally {
      setAttachmentBusy(false);
    }
  };

  return (
    <>
      <div
        className={
          isDesktop
            ? "relative border-t border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,254,249,0.98),rgba(255,248,239,0.98))] px-4 py-3"
            : "border-t border-black/6 bg-[#f7f7f7] px-2 pb-2 pt-1.5"
        }
        style={{
          paddingBottom: keyboardOpen
            ? `${keyboardInset}px`
            : isDesktop
              ? "0.75rem"
              : "0.5rem",
        }}
        onDragEnter={handleDesktopDragEnter}
        onDragOver={handleDesktopDragOver}
        onDragLeave={handleDesktopDragLeave}
        onDrop={(event) => {
          void handleDesktopDrop(event);
        }}
      >
        {isDesktop && desktopDropActive ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[24px] border border-dashed border-[rgba(249,115,22,0.38)] bg-[rgba(255,248,239,0.96)] text-sm font-medium text-[color:var(--brand-primary)] shadow-[0_18px_40px_rgba(160,90,10,0.14)]">
            松开鼠标发送图片或文件
          </div>
        ) : null}
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
            variant={variant}
            senderName={replyPreview.senderName}
            text={replyPreview.text}
            modeLabel={replyPreview.modeLabel}
            onClose={onCancelReply}
          />
        ) : null}
        {isDesktop && mentionPickerOpen ? (
          <DesktopMentionPicker
            candidates={filteredMentionCandidates}
            activeIndex={mentionActiveIndex}
            onSelect={applyMentionCandidate}
          />
        ) : null}
        {!isDesktop && !mobileSpeechMode ? (
          <MobileMentionPickerSheet
            open={
              mentionPickerOpen &&
              !plusPanelOpen &&
              !stickerPanelOpen &&
              Boolean(activeMention) &&
              !mobileMentionDismissed
            }
            candidates={filteredMentionCandidates}
            onClose={() => setMobileMentionDismissed(true)}
            onSelect={applyMentionCandidate}
          />
        ) : null}
        <div
          ref={isDesktop ? desktopStickerRef : undefined}
          className={`relative ${isDesktop ? "flex items-center gap-2 rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 shadow-[var(--shadow-soft)]" : "space-y-2"}`}
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

              <div className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  ref={desktopInputRef}
                  value={value}
                  onChange={(event) => {
                    onChange(event.target.value);
                    setInputCursor(
                      event.target.selectionStart ?? event.target.value.length,
                    );
                  }}
                  onPaste={(event) => {
                    void handleDesktopPaste(event);
                  }}
                  onFocus={() => {
                    setPlusPanelOpen(false);
                    setStickerPanelOpen(false);
                    syncInputCursor();
                  }}
                  onClick={syncInputCursor}
                  onKeyUp={syncInputCursor}
                  onSelect={syncInputCursor}
                  onKeyDown={handleDesktopInputKeyDown}
                  placeholder={placeholder}
                  className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
                />
                {showSpeechEntry ? (
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
                    disabled={
                      speechButtonDisabled && speech.status !== "listening"
                    }
                    title={speechDisabledReason ?? undefined}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-45",
                      speech.status === "listening"
                        ? "bg-[color:var(--surface-soft)] text-[color:var(--brand-primary)]"
                        : "",
                    )}
                    aria-label={
                      speechDisabledReason ??
                      (speech.status === "listening"
                        ? "停止语音输入"
                        : "语音输入")
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
            </>
          ) : (
            <div className="flex items-end gap-1.5">
              {showSpeechEntry ? (
                <button
                  type="button"
                  onClick={toggleMobileInputMode}
                  disabled={
                    speech.status === "processing" || mobileSpeechPressing
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#606266] transition active:bg-black/5 disabled:opacity-45"
                  aria-label={
                    mobileSpeechMode ? "切换到键盘输入" : "切换到语音输入"
                  }
                >
                  {mobileSpeechMode ? (
                    <Keyboard size={20} />
                  ) : (
                    <Mic size={20} />
                  )}
                </button>
              ) : null}

              {mobileSpeechMode ? (
                <button
                  type="button"
                  onPointerDown={(event) => {
                    void handleMobileSpeechPressStart(event);
                  }}
                  onPointerMove={handleMobileSpeechPressMove}
                  onPointerUp={handleMobileSpeechPressEnd}
                  onPointerCancel={handleMobileSpeechPressCancel}
                  disabled={!speechSupported || speech.status === "processing"}
                  title={speechDisabledReason ?? undefined}
                  className={cn(
                    "flex min-h-[40px] min-w-0 flex-1 select-none items-center justify-center rounded-[7px] border border-black/8 bg-white px-4 py-2 text-[15px] transition touch-none",
                    mobileSpeechPressing
                      ? mobileSpeechCancelIntent
                        ? "border-[#ff4d4f]/45 bg-[#fff5f5] text-[#ff4d4f]"
                        : "border-[#07c160]/35 bg-[#f3fff8] text-[#07c160]"
                      : "text-[#7a7a7a]",
                    speech.status === "processing"
                      ? "border-black/12 bg-black/[0.03] text-[#8b8b8b]"
                      : "",
                  )}
                  aria-label="按住说话，松开后转成文字"
                >
                  {mobileSpeechPressing
                    ? mobileSpeechCancelIntent
                      ? "松开取消"
                      : "松开转文字"
                    : speech.status === "processing"
                      ? "正在转写..."
                      : "按住说话"}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-end rounded-[7px] border border-black/8 bg-white px-3 py-1">
                  <textarea
                    ref={mobileTextareaRef}
                    rows={1}
                    value={value}
                    onChange={(event) => {
                      onChange(event.target.value);
                      setInputCursor(
                        event.target.selectionStart ??
                          event.target.value.length,
                      );
                    }}
                    onFocus={() => {
                      setPlusPanelOpen(false);
                      setStickerPanelOpen(false);
                      setMobileInputMode("text");
                      syncInputCursor();
                    }}
                    onClick={syncInputCursor}
                    onKeyUp={syncInputCursor}
                    onSelect={syncInputCursor}
                    placeholder={placeholder}
                    className="min-h-[38px] max-h-[108px] flex-1 resize-none bg-transparent py-1 text-[16px] leading-6 text-[#111827] outline-none placeholder:text-[#a3a3a3]"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={toggleStickerPanel}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#606266] transition active:bg-black/5",
                  stickerPanelOpen ? "bg-black/5 text-[#111827]" : "",
                )}
                aria-label={stickerPanelOpen ? "切换到键盘输入" : "表情"}
              >
                {stickerPanelOpen ? (
                  <Keyboard size={20} />
                ) : (
                  <Smile size={20} />
                )}
              </button>

              {!mobileSpeechMode && value.trim() ? (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={composerPending}
                  className="flex h-9 shrink-0 items-center justify-center rounded-[6px] bg-[#07c160] px-3.5 text-[15px] font-medium text-white disabled:opacity-45"
                >
                  发送
                </button>
              ) : (
                <button
                  type="button"
                  onClick={togglePlusPanel}
                  disabled={!onSendAttachment || attachmentBusy}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#606266] transition active:bg-black/5 disabled:opacity-45",
                    plusPanelOpen ? "bg-black/5 text-[#111827]" : "",
                  )}
                  aria-label="更多功能"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>
          )}

          {isDesktop && value.trim() ? (
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
          ) : isDesktop ? (
            <div className="h-10 w-[74px]" />
          ) : null}

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
            onSelectFavoriteText={(text) => void handleSendPresetText(text)}
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
            onUnavailableAction={(message) => {
              setPlusPanelOpen(false);
              setAttachmentError(null);
              setMobilePlusNotice(message);
            }}
          />
        ) : null}
        {mobilePlusNotice && !isDesktop ? (
          <InlineNotice className="mt-2 text-xs" tone="info">
            {mobilePlusNotice}
          </InlineNotice>
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
        status={speech.status}
        text={speechDisplayText}
        error={speech.error}
        holding={mobileSpeechPressing}
        cancelIntent={mobileSpeechCancelIntent}
        onClose={cancelMobileSpeech}
        onCancel={cancelMobileSpeech}
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
  variant,
  senderName,
  text,
  modeLabel,
  onClose,
}: {
  variant: "mobile" | "desktop";
  senderName: string;
  text: string;
  modeLabel?: string;
  onClose?: () => void;
}) {
  const isDesktop = variant === "desktop";
  return (
    <div
      className={`mb-3 flex items-start justify-between gap-3 ${
        isDesktop
          ? "rounded-[18px] border border-black/6 bg-white/90 px-4 py-3 shadow-[var(--shadow-soft)]"
          : "rounded-[10px] border-l-[3px] border-l-[#07c160] bg-white px-3 py-2.5"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div
            className={`text-[11px] font-medium ${
              isDesktop
                ? "uppercase tracking-[0.14em] text-[color:var(--text-dim)]"
                : "text-[#07c160]"
            }`}
          >
            回复 {senderName}
          </div>
          {modeLabel ? (
            <div
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                isDesktop
                  ? "bg-[rgba(160,90,10,0.08)] text-[color:var(--brand-primary)]"
                  : "bg-[rgba(7,193,96,0.12)] text-[#07c160]"
              }`}
            >
              {modeLabel}
            </div>
          ) : null}
        </div>
        <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-[color:var(--text-secondary)]">
          {text}
        </div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition ${
            isDesktop
              ? "hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--text-primary)]"
              : "active:bg-black/5"
          }`}
          aria-label="取消回复"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  );
}

function DesktopMentionPicker({
  candidates,
  activeIndex,
  onSelect,
}: {
  candidates: Array<{
    id: string;
    name: string;
    subtitle?: string;
    avatar?: string | null;
  }>;
  activeIndex: number;
  onSelect: (candidate: {
    id: string;
    name: string;
    subtitle?: string;
    avatar?: string | null;
  }) => void;
}) {
  return (
    <div className="mb-3 overflow-hidden rounded-[18px] border border-black/6 bg-white/94 py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
      <div className="px-4 pb-1 pt-1 text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
        选择要提到的成员
      </div>
      <div className="space-y-0.5">
        {candidates.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(candidate)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
              index === activeIndex ? "bg-[#f5f5f5]" : "hover:bg-[#fafafa]",
            )}
          >
            <AvatarChip
              name={candidate.name}
              src={candidate.avatar}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                {candidate.name}
              </div>
              {candidate.subtitle ? (
                <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
                  {candidate.subtitle}
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-[13px] text-[color:var(--text-dim)]">
              @
            </div>
          </button>
        ))}
      </div>
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

function findActiveMentionToken(value: string, cursor: number) {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  let atIndex = safeCursor - 1;

  while (atIndex >= 0) {
    const current = value[atIndex];
    if (current === "@") {
      break;
    }

    if (/\s/.test(current)) {
      return null;
    }

    atIndex -= 1;
  }

  if (atIndex < 0 || value[atIndex] !== "@") {
    return null;
  }

  if (atIndex > 0 && !/\s/.test(value[atIndex - 1] ?? "")) {
    return null;
  }

  let endIndex = atIndex + 1;
  while (endIndex < value.length && !/\s/.test(value[endIndex] ?? "")) {
    endIndex += 1;
  }

  if (safeCursor < atIndex + 1 || safeCursor > endIndex) {
    return null;
  }

  return {
    start: atIndex,
    end: endIndex,
    query: value.slice(atIndex + 1, safeCursor),
  };
}

const MAX_ALBUM_IMAGE_COUNT = 9;
const MOBILE_SPEECH_CANCEL_DISTANCE = 72;

function formatDraftFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${size} B`;
}
