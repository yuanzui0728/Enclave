import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  FileText,
  History,
  ImageIcon,
  Keyboard,
  Mic,
  Monitor,
  Plus,
  Scissors,
  SendHorizontal,
  Smile,
  Star,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { getFavorites, type StickerAttachment } from "@yinjie/contracts";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { type ChatComposerAttachmentPayload } from "../features/chat/chat-plus-types";
import { AvatarChip } from "./avatar-chip";
import { MobileSpeechInputSheet } from "./mobile-speech-input-sheet";
import { MobileChatPlusPanel } from "./mobile-chat-plus-panel";
import { MobileChatAttachmentPreview } from "./mobile-chat-attachment-preview";
import { MobileMentionPickerSheet } from "../features/chat/mobile-mention-picker-sheet";
import { useSpeechInput } from "../features/chat/use-speech-input";
import {
  buildFavoriteShareText,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  type DesktopFavoriteRecord,
} from "../features/desktop/favorites/desktop-favorites-storage";
import {
  loadRecentStickers,
  pushRecentSticker,
} from "../features/chat/stickers/recent-stickers";
import { StickerPanel } from "../features/chat/stickers/sticker-panel";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

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
  mobileShortcutRequest?: {
    action: "voice-message" | "camera" | "album";
    nonce: number;
  } | null;
  onMobileShortcutHandled?: () => void;
  onStartVoiceCall?: () => void;
  onStartVideoCall?: () => void;
  onCancelReply?: () => void;
  onOpenDesktopHistory?: () => void;
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

type NormalizedCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ScreenshotSelectionDraft = {
  mode: "crop" | "rect" | "arrow" | "text";
  anchorX: number;
  anchorY: number;
  currentX: number;
  currentY: number;
  boundsWidth: number;
  boundsHeight: number;
};

type ScreenshotAnnotationColor = "amber" | "cyan" | "rose" | "lime";

type ScreenshotAnnotation = {
  id: string;
  kind: "rect" | "arrow" | "text";
  color: ScreenshotAnnotationColor;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text?: string;
};

type ScreenshotShortcutHelpGroupId =
  | "send"
  | "view"
  | "draw"
  | "history";

const SCREENSHOT_ANNOTATION_PALETTE = [
  {
    id: "amber",
    label: "琥珀",
    stroke: "#f59e0b",
    fill: "rgba(245,158,11,0.12)",
  },
  {
    id: "cyan",
    label: "青蓝",
    stroke: "#38bdf8",
    fill: "rgba(56,189,248,0.14)",
  },
  {
    id: "rose",
    label: "玫红",
    stroke: "#fb7185",
    fill: "rgba(251,113,133,0.14)",
  },
  {
    id: "lime",
    label: "青柠",
    stroke: "#84cc16",
    fill: "rgba(132,204,22,0.14)",
  },
] satisfies Array<{
  id: ScreenshotAnnotationColor;
  label: string;
  stroke: string;
  fill: string;
}>;

const SCREENSHOT_SHORTCUT_HELP_GROUPS = [
  {
    id: "draw",
    label: "绘制",
    primary: "C / R / A / T",
    secondary: "颜色 1-4",
  },
  {
    id: "history",
    label: "撤销与删除",
    primary: "⌘/Ctrl + Z / Shift+Z / Y",
    secondary: "Delete / Esc",
  },
  {
    id: "view",
    label: "视图",
    primary: "⌘/Ctrl + 滚轮 / 双击",
    secondary: "Space / ?",
  },
  {
    id: "send",
    label: "发送",
    primary: "Enter 发送",
    secondary: "原图 ⌘/Ctrl + Enter",
  },
] as const;

type ScreenshotCropResizeDraft = {
  pointerId: number;
  handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
  startX: number;
  startY: number;
  boundsWidth: number;
  boundsHeight: number;
  crop: NormalizedCropRect;
};

type ScreenshotCropMoveDraft = {
  pointerId: number;
  startX: number;
  startY: number;
  boundsWidth: number;
  boundsHeight: number;
  crop: NormalizedCropRect;
};

type ScreenshotAnnotationResizeDraft = {
  pointerId: number;
  handle: "nw" | "ne" | "sw" | "se";
  startX: number;
  startY: number;
  boundsWidth: number;
  boundsHeight: number;
  annotationId: string;
  annotations: ScreenshotAnnotation[];
};

type ScreenshotAnnotationMoveDraft = {
  pointerId: number;
  startX: number;
  startY: number;
  boundsWidth: number;
  boundsHeight: number;
  annotationId: string;
  annotations: ScreenshotAnnotation[];
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
  mobileShortcutRequest = null,
  onMobileShortcutHandled,
  onStartVoiceCall,
  onStartVideoCall,
  onCancelReply,
  onOpenDesktopHistory,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = speechInput?.baseUrl ?? runtimeConfig.apiBaseUrl;
  const { keyboardInset, keyboardOpen } = useKeyboardInset();
  const isDesktop = variant === "desktop";
  const [mobileSpeechSheetOpen, setMobileSpeechSheetOpen] = useState(false);
  const [stickerPanelOpen, setStickerPanelOpen] = useState(false);
  const [plusPanelOpen, setPlusPanelOpen] = useState(false);
  const [attachmentDraft, setAttachmentDraft] =
    useState<AttachmentDraft | null>(null);
  const [desktopScreenshotDraft, setDesktopScreenshotDraft] =
    useState<ImageDraft | null>(null);
  const [desktopScreenshotCrop, setDesktopScreenshotCrop] =
    useState<NormalizedCropRect | null>(null);
  const [desktopScreenshotTool, setDesktopScreenshotTool] = useState<
    "crop" | "rect" | "arrow" | "text"
  >("crop");
  const [desktopScreenshotAnnotationColor, setDesktopScreenshotAnnotationColor] =
    useState<ScreenshotAnnotationColor>("amber");
  const [desktopScreenshotAnnotations, setDesktopScreenshotAnnotations] =
    useState<ScreenshotAnnotation[]>([]);
  const [
    desktopScreenshotSelectedAnnotationId,
    setDesktopScreenshotSelectedAnnotationId,
  ] = useState<string | null>(null);
  const [
    desktopScreenshotAnnotationHistory,
    setDesktopScreenshotAnnotationHistory,
  ] = useState<ScreenshotAnnotation[][]>([]);
  const [
    desktopScreenshotAnnotationFuture,
    setDesktopScreenshotAnnotationFuture,
  ] = useState<ScreenshotAnnotation[][]>([]);
  const [desktopScreenshotSelection, setDesktopScreenshotSelection] =
    useState<ScreenshotSelectionDraft | null>(null);
  const [desktopScreenshotCropResize, setDesktopScreenshotCropResize] =
    useState<ScreenshotCropResizeDraft | null>(null);
  const [desktopScreenshotCropMove, setDesktopScreenshotCropMove] =
    useState<ScreenshotCropMoveDraft | null>(null);
  const [desktopScreenshotAnnotationResize, setDesktopScreenshotAnnotationResize] =
    useState<ScreenshotAnnotationResizeDraft | null>(null);
  const [desktopScreenshotAnnotationMove, setDesktopScreenshotAnnotationMove] =
    useState<ScreenshotAnnotationMoveDraft | null>(null);
  const [desktopScreenshotNotice, setDesktopScreenshotNotice] = useState<
    string | null
  >(null);
  const [desktopScreenshotShortcutHelpOpen, setDesktopScreenshotShortcutHelpOpen] =
    useState(false);
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
  const desktopScreenshotImageRef = useRef<HTMLImageElement | null>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const albumInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSpeechPointerIdRef = useRef<number | null>(null);
  const mobileSpeechStartYRef = useRef<number | null>(null);
  const mobileSpeechAutoCommitRef = useRef(false);
  const mobileSpeechCancelIntentRef = useRef(false);
  const [desktopPlusMenuOpen, setDesktopPlusMenuOpen] = useState(false);
  const [desktopPlusMenuView, setDesktopPlusMenuView] = useState<
    "root" | "favorites"
  >("root");
  const [desktopFavoriteRecords, setDesktopFavoriteRecords] = useState<
    DesktopFavoriteRecord[]
  >([]);
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
    mode: isDesktop ? "dictation" : "voice",
  });
  const speechSupported = showSpeechEntry && speech.supported;
  const speechDisabledReason =
    showSpeechEntry && !speechSupported
      ? isDesktop
        ? "当前浏览器不支持语音输入，请改用键盘输入。"
        : "当前浏览器不支持语音发送，请改用键盘输入。"
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
  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
    enabled:
      isDesktop && desktopPlusMenuOpen && desktopPlusMenuView === "favorites",
  });

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

  const sendRecordedVoice = async () => {
    if (!onSendAttachment || !speech.recordedAudio || attachmentBusy) {
      return false;
    }

    const sent = await handleSendAttachment({
      type: "voice",
      file: speech.recordedAudio.blob,
      fileName: speech.recordedAudio.fileName,
      mimeType: speech.recordedAudio.mimeType,
      size: speech.recordedAudio.size,
      durationMs: speech.recordedAudio.durationMs,
    });

    if (!sent) {
      return false;
    }

    speech.clearResult();
    closeMobileSpeechSheet();
    return true;
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
    setAttachmentError(null);
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
      mobileSpeechAutoCommitRef.current = false;
      if (speech.mode === "voice") {
        void sendRecordedVoice();
        return;
      }

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
    speech.mode,
    speech.status,
    sendRecordedVoice,
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
    if (!desktopPlusMenuOpen) {
      setDesktopPlusMenuView("root");
      return;
    }

    if (desktopPlusMenuView !== "favorites") {
      return;
    }

    setDesktopFavoriteRecords(
      mergeDesktopFavoriteRecords(
        favoritesQuery.data ?? [],
        readDesktopFavorites(),
      ),
    );
  }, [desktopPlusMenuOpen, desktopPlusMenuView, favoritesQuery.data]);

  useEffect(() => {
    return () => {
      releaseAttachmentDraft(attachmentDraft);
    };
  }, [attachmentDraft]);

  useEffect(() => {
    return () => {
      releaseImageDraft(desktopScreenshotDraft);
    };
  }, [desktopScreenshotDraft]);

  useEffect(() => {
    if (!isDesktop || !desktopScreenshotDraft) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || attachmentBusy) {
        return;
      }

      event.preventDefault();
      if (desktopScreenshotShortcutHelpOpen) {
        setDesktopScreenshotShortcutHelpOpen(false);
        return;
      }

      if (desktopScreenshotSelectedAnnotationId) {
        setDesktopScreenshotSelectedAnnotationId(null);
        return;
      }

      closeDesktopScreenshotEditor();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    attachmentBusy,
    desktopScreenshotDraft,
    desktopScreenshotShortcutHelpOpen,
    desktopScreenshotSelectedAnnotationId,
    isDesktop,
  ]);

  useEffect(() => {
    if (
      !isDesktop ||
      !onSendAttachment ||
      attachmentBusy ||
      desktopScreenshotDraft
    ) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (event.key.toLowerCase() !== "s") {
        return;
      }

      event.preventDefault();
      void captureDesktopScreenshot();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [attachmentBusy, desktopScreenshotDraft, isDesktop, onSendAttachment]);

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

  const closeDesktopPlusMenu = () => {
    setDesktopPlusMenuOpen(false);
    setDesktopPlusMenuView("root");
  };

  const toggleDesktopFavoritePicker = () => {
    if (desktopPlusMenuOpen && desktopPlusMenuView === "favorites") {
      closeDesktopPlusMenu();
      return;
    }

    setDesktopFavoriteRecords(
      mergeDesktopFavoriteRecords(
        favoritesQuery.data ?? [],
        readDesktopFavorites(),
      ),
    );
    setDesktopPlusMenuView("favorites");
    setDesktopPlusMenuOpen(true);
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

  const captureDesktopScreenshot = async () => {
    if (!isDesktop || !onSendAttachment || attachmentBusy) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      setAttachmentError("当前浏览器不支持桌面截图，请改用图片或文件发送。");
      return;
    }

    let stream: MediaStream | null = null;

    try {
      setAttachmentError(null);
      setMobilePlusNotice(null);
      setStickerPanelOpen(false);
      closeDesktopPlusMenu();

      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) {
        throw new Error("没有拿到可用的屏幕画面。");
      }

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await waitForCaptureVideo(video);

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        throw new Error("截图尺寸异常，请重试。");
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("截图画布初始化失败。");
      }

      context.drawImage(video, 0, 0, width, height);
      const blob = await canvasToBlob(canvas);
      const file = new File([blob], buildDesktopScreenshotFileName(), {
        type: "image/png",
      });
      const screenshotDraft = await createImageDraft(file);

      video.pause();
      video.srcObject = null;
      releaseAttachmentDraft(attachmentDraft);
      setAttachmentDraft(null);
      releaseImageDraft(desktopScreenshotDraft);
      setDesktopScreenshotDraft(screenshotDraft);
      setDesktopScreenshotCrop(null);
      setDesktopScreenshotTool("crop");
      setDesktopScreenshotAnnotationColor("amber");
      setDesktopScreenshotAnnotations([]);
      setDesktopScreenshotSelectedAnnotationId(null);
      setDesktopScreenshotAnnotationHistory([]);
      setDesktopScreenshotAnnotationFuture([]);
      setDesktopScreenshotSelection(null);
      setDesktopScreenshotCropResize(null);
      setDesktopScreenshotCropMove(null);
      setDesktopScreenshotAnnotationResize(null);
      setDesktopScreenshotAnnotationMove(null);
      setDesktopScreenshotNotice(null);
    } catch (captureError) {
      const name =
        captureError instanceof DOMException ? captureError.name : undefined;

      if (name === "AbortError" || name === "NotAllowedError") {
        return;
      }

      setAttachmentError(
        captureError instanceof Error
          ? captureError.message
          : "截图失败，请稍后再试。",
      );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  };

  const activateMobileSpeechFallback = () => {
    if (isDesktop || !showSpeechEntry) {
      return;
    }

    blurActiveElement();
    if (speech.status !== "idle") {
      speech.cancel();
    }
    closeMobileSpeechSheet();
    setStickerPanelOpen(false);
    setAttachmentError(null);
    setMobilePlusNotice(null);
    setPlusPanelOpen(false);
    setMobileInputMode("speech");
  };

  const handleUnavailableFallback = (
    action: "voice-message" | "camera" | "album",
  ) => {
    if (action === "voice-message") {
      activateMobileSpeechFallback();
      return;
    }

    setPlusPanelOpen(false);
    if (action === "camera") {
      pickCamera();
      return;
    }

    pickAlbum();
  };

  const handleMobileShortcutRequest = useEffectEvent(
    (action: "voice-message" | "camera" | "album") => {
      if (action === "voice-message") {
        activateMobileSpeechFallback();
        return;
      }

      setPlusPanelOpen(false);
      if (action === "camera") {
        pickCamera();
        return;
      }

      pickAlbum();
    },
  );

  useEffect(() => {
    if (isDesktop || !mobileShortcutRequest) {
      return;
    }

    handleMobileShortcutRequest(mobileShortcutRequest.action);
    onMobileShortcutHandled?.();
  }, [
    handleMobileShortcutRequest,
    isDesktop,
    mobileShortcutRequest,
    onMobileShortcutHandled,
  ]);

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

  const closeDesktopScreenshotEditor = () => {
    releaseImageDraft(desktopScreenshotDraft);
    setDesktopScreenshotDraft(null);
    setDesktopScreenshotCrop(null);
    setDesktopScreenshotTool("crop");
    setDesktopScreenshotAnnotationColor("amber");
    setDesktopScreenshotAnnotations([]);
    setDesktopScreenshotSelectedAnnotationId(null);
    setDesktopScreenshotAnnotationHistory([]);
    setDesktopScreenshotAnnotationFuture([]);
    setDesktopScreenshotSelection(null);
    setDesktopScreenshotCropResize(null);
    setDesktopScreenshotCropMove(null);
    setDesktopScreenshotAnnotationResize(null);
    setDesktopScreenshotAnnotationMove(null);
    setDesktopScreenshotNotice(null);
    setDesktopScreenshotShortcutHelpOpen(false);
  };

  const handleDesktopScreenshotPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!desktopScreenshotDraft || attachmentBusy) {
      return;
    }

    setDesktopScreenshotSelectedAnnotationId(null);

    const bounds = desktopScreenshotImageRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) {
      return;
    }

    const x = clamp(event.clientX - bounds.left, 0, bounds.width);
    const y = clamp(event.clientY - bounds.top, 0, bounds.height);

    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDesktopScreenshotSelection({
      mode: desktopScreenshotTool,
      anchorX: x,
      anchorY: y,
      currentX: x,
      currentY: y,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
    });
  };

  const handleDesktopScreenshotPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    setDesktopScreenshotSelection((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        currentX: clamp(event.nativeEvent.offsetX, 0, current.boundsWidth),
        currentY: clamp(event.nativeEvent.offsetY, 0, current.boundsHeight),
      };
    });
  };

  const handleDesktopScreenshotCropResizeStart = (
    handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!desktopScreenshotCrop || attachmentBusy) {
      return;
    }

    const bounds = desktopScreenshotImageRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDesktopScreenshotCropResize({
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      crop: desktopScreenshotCrop,
    });
  };

  const handleDesktopScreenshotCropResizeMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    setDesktopScreenshotCropResize((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }

      event.preventDefault();
      const deltaX =
        (event.clientX - current.startX) / Math.max(1, current.boundsWidth);
      const deltaY =
        (event.clientY - current.startY) / Math.max(1, current.boundsHeight);
      setDesktopScreenshotCrop(
        resizeScreenshotCrop(current.crop, current.handle, deltaX, deltaY),
      );
      return current;
    });
  };

  const handleDesktopScreenshotCropMoveStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!desktopScreenshotCrop || attachmentBusy) {
      return;
    }

    const bounds = desktopScreenshotImageRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDesktopScreenshotCropMove({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      crop: desktopScreenshotCrop,
    });
  };

  const handleDesktopScreenshotCropMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    setDesktopScreenshotCropMove((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }

      event.preventDefault();
      const deltaX =
        (event.clientX - current.startX) / Math.max(1, current.boundsWidth);
      const deltaY =
        (event.clientY - current.startY) / Math.max(1, current.boundsHeight);
      setDesktopScreenshotCrop(
        moveScreenshotCrop(current.crop, deltaX, deltaY),
      );
      return current;
    });
  };

  const finishDesktopScreenshotCropResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDesktopScreenshotCropResize((current) =>
      current?.pointerId === event.pointerId ? null : current,
    );
  };

  const finishDesktopScreenshotCropMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDesktopScreenshotCropMove((current) =>
      current?.pointerId === event.pointerId ? null : current,
    );
  };

  const handleDesktopScreenshotAnnotationResizeStart = (
    handle: "nw" | "ne" | "sw" | "se",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (
      attachmentBusy ||
      !desktopScreenshotSelectedAnnotationId ||
      !desktopScreenshotAnnotations.some(
        (annotation) =>
          annotation.id === desktopScreenshotSelectedAnnotationId &&
          annotation.kind === "text",
      )
    ) {
      return;
    }

    const bounds = desktopScreenshotImageRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDesktopScreenshotAnnotationResize({
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      annotationId: desktopScreenshotSelectedAnnotationId,
      annotations: desktopScreenshotAnnotations,
    });
  };

  const handleDesktopScreenshotAnnotationResizeMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    setDesktopScreenshotAnnotationResize((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }

      event.preventDefault();
      event.stopPropagation();
      const deltaX =
        (event.clientX - current.startX) / Math.max(1, current.boundsWidth);
      const deltaY =
        (event.clientY - current.startY) / Math.max(1, current.boundsHeight);

      setDesktopScreenshotAnnotations(
        current.annotations.map((annotation) =>
          annotation.id === current.annotationId && annotation.kind === "text"
            ? resizeScreenshotTextAnnotation(
                annotation,
                current.handle,
                deltaX,
                deltaY,
              )
            : annotation,
        ),
      );
      return current;
    });
  };

  const finishDesktopScreenshotAnnotationResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDesktopScreenshotAnnotationResize((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }

      if (
        !areScreenshotAnnotationsEqual(
          current.annotations,
          desktopScreenshotAnnotations,
        )
      ) {
        setDesktopScreenshotAnnotationHistory((history) => [
          ...history,
          current.annotations,
        ]);
        setDesktopScreenshotAnnotationFuture([]);
      }

      return null;
    });
  };

  const handleDesktopScreenshotAnnotationMoveStart = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (
      attachmentBusy ||
      !desktopScreenshotSelectedAnnotationId ||
      !desktopScreenshotAnnotations.some(
        (annotation) =>
          annotation.id === desktopScreenshotSelectedAnnotationId &&
          annotation.kind === "text",
      )
    ) {
      return;
    }

    const bounds = desktopScreenshotImageRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDesktopScreenshotAnnotationMove({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      boundsWidth: bounds.width,
      boundsHeight: bounds.height,
      annotationId: desktopScreenshotSelectedAnnotationId,
      annotations: desktopScreenshotAnnotations,
    });
  };

  const handleDesktopScreenshotAnnotationMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    setDesktopScreenshotAnnotationMove((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }

      event.preventDefault();
      event.stopPropagation();
      const deltaX =
        (event.clientX - current.startX) / Math.max(1, current.boundsWidth);
      const deltaY =
        (event.clientY - current.startY) / Math.max(1, current.boundsHeight);

      setDesktopScreenshotAnnotations(
        current.annotations.map((annotation) =>
          annotation.id === current.annotationId && annotation.kind === "text"
            ? moveScreenshotTextAnnotation(annotation, deltaX, deltaY)
            : annotation,
        ),
      );
      return current;
    });
  };

  const finishDesktopScreenshotAnnotationMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDesktopScreenshotAnnotationMove((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }

      if (
        !areScreenshotAnnotationsEqual(
          current.annotations,
          desktopScreenshotAnnotations,
        )
      ) {
        setDesktopScreenshotAnnotationHistory((history) => [
          ...history,
          current.annotations,
        ]);
        setDesktopScreenshotAnnotationFuture([]);
      }

      return null;
    });
  };

  const commitDesktopScreenshotAnnotations = (
    next: ScreenshotAnnotation[],
    options?: {
      selectedAnnotationId?: string | null;
      preserveFuture?: boolean;
    },
  ) => {
    if (areScreenshotAnnotationsEqual(desktopScreenshotAnnotations, next)) {
      return;
    }

    setDesktopScreenshotAnnotationHistory((history) => [
      ...history,
      desktopScreenshotAnnotations,
    ]);
    if (!options?.preserveFuture) {
      setDesktopScreenshotAnnotationFuture([]);
    }
    setDesktopScreenshotAnnotations(next);

    const requestedSelection =
      options && "selectedAnnotationId" in options
        ? options.selectedAnnotationId
        : desktopScreenshotSelectedAnnotationId;
    setDesktopScreenshotSelectedAnnotationId(
      requestedSelection && next.some((annotation) => annotation.id === requestedSelection)
        ? requestedSelection
        : null,
    );
  };

  const finalizeDesktopScreenshotSelection = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setDesktopScreenshotSelection((current) => {
      if (!current) {
        return current;
      }

      const normalizedCrop = normalizeSelectionRect(current);
      const validSelection =
        normalizedCrop &&
        normalizedCrop.width >= 0.02 &&
        normalizedCrop.height >= 0.02
          ? normalizedCrop
          : null;
      const arrowLength = Math.hypot(
        current.currentX - current.anchorX,
        current.currentY - current.anchorY,
      );
      const validArrow =
        arrowLength >=
        Math.min(current.boundsWidth, current.boundsHeight) * 0.03;

      if (current.mode === "crop") {
        setDesktopScreenshotCrop(validSelection);
      } else if (
        ((current.mode === "rect" || current.mode === "text") &&
          validSelection) ||
        (current.mode === "arrow" && validArrow)
      ) {
        const rectSelection = validSelection;
        const nextAnnotation =
          (current.mode === "rect" || current.mode === "text") && rectSelection
            ? {
                id: createScreenshotAnnotationId(),
                kind:
                  current.mode === "text"
                    ? ("text" as const)
                    : ("rect" as const),
                color: desktopScreenshotAnnotationColor,
                x1: rectSelection.x,
                y1: rectSelection.y,
                x2: rectSelection.x + rectSelection.width,
                y2: rectSelection.y + rectSelection.height,
                text:
                  current.mode === "text" ? "输入文字" : undefined,
              }
            : {
                id: createScreenshotAnnotationId(),
                kind: "arrow" as const,
                color: desktopScreenshotAnnotationColor,
                x1: current.anchorX / current.boundsWidth,
                y1: current.anchorY / current.boundsHeight,
                x2: current.currentX / current.boundsWidth,
                y2: current.currentY / current.boundsHeight,
              };
        commitDesktopScreenshotAnnotations(
          [...desktopScreenshotAnnotations, nextAnnotation],
          {
            selectedAnnotationId: nextAnnotation.id,
          },
        );
      }
      return null;
    });
  };

  const buildDesktopScreenshotResult = async (mode: "original" | "cropped") => {
    if (!desktopScreenshotDraft) {
      return null;
    }

    if (
      desktopScreenshotAnnotations.length ||
      (mode === "cropped" && desktopScreenshotCrop)
    ) {
      return createEditedScreenshotPayload(desktopScreenshotDraft, {
        crop: mode === "cropped" ? desktopScreenshotCrop : null,
        annotations: desktopScreenshotAnnotations,
      });
    }

    return {
      file: desktopScreenshotDraft.file,
      fileName: desktopScreenshotDraft.fileName,
      width: desktopScreenshotDraft.width,
      height: desktopScreenshotDraft.height,
    };
  };

  const handleSendDesktopScreenshot = async (mode: "original" | "cropped") => {
    if (!desktopScreenshotDraft || !onSendAttachment || attachmentBusy) {
      return;
    }

    try {
      const imagePayload = await buildDesktopScreenshotResult(mode);
      if (!imagePayload) {
        return;
      }

      const sent = await handleSendAttachment({
        type: "image",
        file: imagePayload.file,
        fileName: imagePayload.fileName,
        width: imagePayload.width,
        height: imagePayload.height,
      });

      if (sent) {
        closeDesktopScreenshotEditor();
      }
    } catch (screenshotError) {
      setAttachmentError(
        screenshotError instanceof Error
          ? screenshotError.message
          : "截图处理失败，请稍后再试。",
      );
    }
  };

  const handleCopyDesktopScreenshot = async (mode: "original" | "cropped") => {
    if (!desktopScreenshotDraft || attachmentBusy) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === "undefined"
    ) {
      setAttachmentError("当前浏览器不支持复制截图到剪贴板。");
      return;
    }

    try {
      const imagePayload = await buildDesktopScreenshotResult(mode);
      if (!imagePayload) {
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          [imagePayload.file.type || "image/png"]: imagePayload.file,
        }),
      ]);
      setAttachmentError(null);
      setDesktopScreenshotNotice(
        mode === "cropped" ? "裁剪后的截图已复制。" : "截图已复制到剪贴板。",
      );
    } catch (copyError) {
      setDesktopScreenshotNotice(null);
      setAttachmentError(
        copyError instanceof Error
          ? copyError.message
          : "复制截图失败，请稍后再试。",
      );
    }
  };

  const handleClearScreenshotAnnotations = () => {
    if (!desktopScreenshotAnnotations.length) {
      return;
    }

    commitDesktopScreenshotAnnotations([], {
      selectedAnnotationId: null,
    });
  };

  const handleSelectScreenshotAnnotation = (annotationId: string) => {
    setDesktopScreenshotSelectedAnnotationId(annotationId);
  };

  const handleDeleteSelectedScreenshotAnnotation = () => {
    if (!desktopScreenshotSelectedAnnotationId) {
      return;
    }

    commitDesktopScreenshotAnnotations(
      desktopScreenshotAnnotations.filter(
        (annotation) =>
          annotation.id !== desktopScreenshotSelectedAnnotationId,
      ),
      {
        selectedAnnotationId: null,
      },
    );
  };

  const selectedScreenshotTextAnnotation = desktopScreenshotAnnotations.find(
    (annotation) =>
      annotation.id === desktopScreenshotSelectedAnnotationId &&
      annotation.kind === "text",
  );

  const handleUpdateSelectedScreenshotText = (text: string) => {
    if (!selectedScreenshotTextAnnotation) {
      return;
    }

    commitDesktopScreenshotAnnotations(
      desktopScreenshotAnnotations.map((annotation) =>
        annotation.id === selectedScreenshotTextAnnotation.id
          ? {
              ...annotation,
              text,
            }
          : annotation,
      ),
      {
        selectedAnnotationId: selectedScreenshotTextAnnotation.id,
      },
    );
  };

  const handleRedoScreenshotAnnotation = () => {
    const next = desktopScreenshotAnnotationFuture[0];
    if (!next) {
      return;
    }

    setDesktopScreenshotAnnotationHistory((history) => [
      ...history,
      desktopScreenshotAnnotations,
    ]);
    setDesktopScreenshotAnnotationFuture((future) => future.slice(1));
    setDesktopScreenshotAnnotations(next);
    setDesktopScreenshotSelectedAnnotationId(null);
  };

  const handleUndoScreenshotAnnotation = () => {
    const previous =
      desktopScreenshotAnnotationHistory[
        desktopScreenshotAnnotationHistory.length - 1
      ];
    if (!previous) {
      return;
    }

    setDesktopScreenshotAnnotationHistory((history) => history.slice(0, -1));
    setDesktopScreenshotAnnotationFuture((future) => [
      desktopScreenshotAnnotations,
      ...future,
    ]);
    setDesktopScreenshotAnnotations(previous);
    setDesktopScreenshotSelectedAnnotationId(null);
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
            ? "relative border-t border-black/6 bg-[#f3f3f3] px-4 py-3"
            : "border-t border-black/8 bg-[#f1f1f1] px-2 pb-2 pt-1"
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
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[14px] border border-dashed border-[#07c160]/35 bg-[rgba(247,247,247,0.96)] text-sm font-medium text-[#07a35a]">
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
        {isDesktop && desktopScreenshotDraft ? (
          <DesktopScreenshotEditor
            draft={desktopScreenshotDraft}
            crop={desktopScreenshotCrop}
            tool={desktopScreenshotTool}
            annotations={desktopScreenshotAnnotations}
            selection={desktopScreenshotSelection}
            imageRef={desktopScreenshotImageRef}
            pending={attachmentBusy}
            error={attachmentError}
            notice={desktopScreenshotNotice}
            onCancel={closeDesktopScreenshotEditor}
            onToolChange={setDesktopScreenshotTool}
            annotationColor={desktopScreenshotAnnotationColor}
            shortcutHelpOpen={desktopScreenshotShortcutHelpOpen}
            selectedAnnotationId={desktopScreenshotSelectedAnnotationId}
            canRedoAnnotations={desktopScreenshotAnnotationFuture.length > 0}
            onAnnotationColorChange={setDesktopScreenshotAnnotationColor}
            onShortcutHelpOpenChange={setDesktopScreenshotShortcutHelpOpen}
            onClearCrop={() => {
              setDesktopScreenshotCrop(null);
              setDesktopScreenshotCropResize(null);
              setDesktopScreenshotCropMove(null);
            }}
            onClearAnnotations={handleClearScreenshotAnnotations}
            onDeleteSelectedAnnotation={handleDeleteSelectedScreenshotAnnotation}
            onRedoAnnotation={handleRedoScreenshotAnnotation}
            onSelectAnnotation={handleSelectScreenshotAnnotation}
            onSelectedTextChange={handleUpdateSelectedScreenshotText}
            onSelectedTextMove={handleDesktopScreenshotAnnotationMove}
            onSelectedTextMoveEnd={finishDesktopScreenshotAnnotationMove}
            onSelectedTextMoveStart={handleDesktopScreenshotAnnotationMoveStart}
            onSelectedTextResizeEnd={finishDesktopScreenshotAnnotationResize}
            onSelectedTextResizeMove={handleDesktopScreenshotAnnotationResizeMove}
            onSelectedTextResizeStart={
              handleDesktopScreenshotAnnotationResizeStart
            }
            onUndoAnnotation={handleUndoScreenshotAnnotation}
            onPointerDown={handleDesktopScreenshotPointerDown}
            onPointerMove={handleDesktopScreenshotPointerMove}
            onPointerUp={finalizeDesktopScreenshotSelection}
            onPointerCancel={finalizeDesktopScreenshotSelection}
            onCropMoveStart={handleDesktopScreenshotCropMoveStart}
            onCropMove={handleDesktopScreenshotCropMove}
            onCropMoveEnd={finishDesktopScreenshotCropMove}
            onCropResizeStart={handleDesktopScreenshotCropResizeStart}
            onCropResizeMove={handleDesktopScreenshotCropResizeMove}
            onCropResizeEnd={finishDesktopScreenshotCropResize}
            onSendOriginal={() => {
              void handleSendDesktopScreenshot("original");
            }}
            onSendCropped={() => {
              void handleSendDesktopScreenshot("cropped");
            }}
            onCopyOriginal={() => {
              void handleCopyDesktopScreenshot("original");
            }}
            onCopyCropped={() => {
              void handleCopyDesktopScreenshot("cropped");
            }}
            selectedTextValue={selectedScreenshotTextAnnotation?.text ?? ""}
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
          className={`relative ${isDesktop ? "space-y-2.5 rounded-[10px] border border-black/6 bg-white px-2.5 py-2" : "space-y-1.5"}`}
        >
          {isDesktop ? (
            <>
              <div className="flex flex-wrap items-center gap-1 border-b border-black/6 pb-2">
                <DesktopToolbarButton
                  label="表情"
                  icon={<Smile size={16} />}
                  active={stickerPanelOpen}
                  onClick={toggleStickerPanel}
                />
                {onSendAttachment ? (
                  <>
                    <DesktopToolbarButton
                      label="图片"
                      icon={<ImageIcon size={16} />}
                      onClick={pickAlbum}
                    />
                    <DesktopToolbarButton
                      label="文件"
                      icon={<FileText size={16} />}
                      onClick={pickFile}
                    />
                    <DesktopToolbarButton
                      label="截图"
                      icon={<Monitor size={16} />}
                      title="截图（Ctrl/⌘ + Shift + S）"
                      onClick={() => {
                        void captureDesktopScreenshot();
                      }}
                    />
                    <div ref={desktopPlusRef} className="relative">
                      <DesktopToolbarButton
                        label="收藏"
                        icon={<Star size={16} />}
                        active={
                          desktopPlusMenuOpen &&
                          desktopPlusMenuView === "favorites"
                        }
                        onClick={toggleDesktopFavoritePicker}
                      />
                      {desktopPlusMenuOpen &&
                      desktopPlusMenuView === "favorites" ? (
                        <div className="absolute left-0 top-[calc(100%+0.4rem)] z-30 w-80 overflow-hidden rounded-[12px] border border-black/8 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.14)]">
                          <DesktopFavoritePicker
                            favorites={desktopFavoriteRecords}
                            busy={composerPending}
                            onBack={closeDesktopPlusMenu}
                            onSelect={(item) => {
                              closeDesktopPlusMenu();
                              void handleSendPresetText(
                                buildFavoriteShareText(item),
                              );
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
                {onOpenDesktopHistory ? (
                  <DesktopToolbarButton
                    label="聊天记录"
                    icon={<History size={16} />}
                    onClick={onOpenDesktopHistory}
                  />
                ) : null}
                {showSpeechEntry ? (
                  <DesktopToolbarButton
                    label={
                      speech.status === "listening" ? "停止语音" : "语音输入"
                    }
                    icon={
                      speech.status === "listening" ? (
                        <Square size={14} fill="currentColor" />
                      ) : (
                        <Mic size={16} />
                      )
                    }
                    active={speech.status === "listening"}
                    disabled={
                      speechButtonDisabled && speech.status !== "listening"
                    }
                    title={speechDisabledReason ?? undefined}
                    onClick={() => {
                      if (speech.status === "listening") {
                        speech.stop();
                        return;
                      }

                      setStickerPanelOpen(false);
                      closeDesktopPlusMenu();
                      void speech.start();
                    }}
                  />
                ) : null}
              </div>

              <div className="flex min-w-0 items-center gap-2 rounded-[8px] bg-[#f7f7f7] px-3 py-2">
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
                    setStickerPanelOpen(false);
                    closeDesktopPlusMenu();
                    syncInputCursor();
                  }}
                  onClick={syncInputCursor}
                  onKeyUp={syncInputCursor}
                  onSelect={syncInputCursor}
                  onKeyDown={handleDesktopInputKeyDown}
                  placeholder={placeholder}
                  className="min-w-0 flex-1 bg-transparent py-1 text-[14px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
                />
                {value.trim() ? (
                  <Button
                    onClick={onSubmit}
                    disabled={composerPending}
                    variant="primary"
                    className="h-[34px] rounded-[8px] bg-[#07c160] px-4 text-[13px] font-medium text-white shadow-none hover:bg-[#06ad56]"
                  >
                    发送
                  </Button>
                ) : (
                  <div className="h-[34px] w-[64px]" />
                )}
              </div>
            </>
          ) : (
            <div className="flex items-end gap-1">
              {showSpeechEntry ? (
                <button
                  type="button"
                  onClick={toggleMobileInputMode}
                  disabled={
                    speech.status === "processing" || mobileSpeechPressing
                  }
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#606266] transition active:bg-[#e3e3e3] disabled:opacity-45"
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
                  disabled={
                    !speechSupported ||
                    speech.status === "processing" ||
                    attachmentBusy
                  }
                  title={speechDisabledReason ?? undefined}
                  className={cn(
                    "flex min-h-[36px] min-w-0 flex-1 select-none items-center justify-center rounded-[6px] border border-black/[0.09] bg-white px-4 py-2 text-[15px] transition touch-none",
                    mobileSpeechPressing
                      ? mobileSpeechCancelIntent
                        ? "border-[#ff4d4f]/45 bg-[#fff5f5] text-[#ff4d4f]"
                        : "border-[#07c160]/35 bg-[#f3fff8] text-[#07c160]"
                      : "text-[#7a7a7a]",
                    speech.status === "processing"
                      ? "border-black/12 bg-black/[0.03] text-[#8b8b8b]"
                      : "",
                  )}
                  aria-label="按住说话，松开发送"
                >
                  {mobileSpeechPressing
                    ? mobileSpeechCancelIntent
                      ? "松开取消"
                      : "松开发送"
                    : speech.status === "processing"
                      ? "正在整理..."
                      : "按住说话"}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-end rounded-[6px] border border-black/[0.09] bg-white px-3 py-0.5">
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
                    className="min-h-[36px] max-h-[108px] flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-[#111827] outline-none placeholder:text-[#a3a3a3]"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={toggleStickerPanel}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#606266] transition active:bg-[#e3e3e3]",
                  stickerPanelOpen ? "bg-[#e3e3e3] text-[#111827]" : "",
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
                  className="flex h-8 min-w-[52px] shrink-0 items-center justify-center rounded-[4px] bg-[#07c160] px-3 text-[15px] font-medium text-white disabled:opacity-45"
                >
                  发送
                </button>
              ) : (
                <button
                  type="button"
                  onClick={togglePlusPanel}
                  disabled={!onSendAttachment || attachmentBusy}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#606266] transition active:bg-[#e3e3e3] disabled:opacity-45",
                    plusPanelOpen ? "bg-[#e3e3e3] text-[#111827]" : "",
                  )}
                  aria-label="更多功能"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>
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
            onStartVoiceCall={onStartVoiceCall}
            onStartVideoCall={onStartVideoCall}
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
              setAttachmentError(null);
              setMobilePlusNotice(message);
            }}
            onUnavailableFallback={handleUnavailableFallback}
          />
        ) : null}
        {mobilePlusNotice && !isDesktop && !plusPanelOpen ? (
          <InlineNotice className="mt-2 text-xs" tone="info">
            {mobilePlusNotice}
          </InlineNotice>
        ) : null}
        {speechDisabledReason ? (
          <InlineNotice className="mt-2 text-xs" tone="muted">
            {speechDisabledReason}
          </InlineNotice>
        ) : null}
        {!isDesktop &&
        speech.mode !== "voice" &&
        speech.status === "ready" &&
        speechDisplayText ? (
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
            className="mt-2 flex flex-wrap items-center gap-2 border-black/6 bg-white text-xs"
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
        mode={speech.mode}
        status={speech.status}
        text={speechDisplayText}
        error={composerError}
        holding={mobileSpeechPressing}
        cancelIntent={mobileSpeechCancelIntent}
        onClose={
          speech.mode === "voice" ? cancelMobileSpeech : closeMobileSpeechSheet
        }
        onCancel={cancelMobileSpeech}
        onCommit={() => {
          if (speech.mode === "voice") {
            void sendRecordedVoice();
            return;
          }

          commitSpeechInput();
        }}
        canCommit={speech.canCommit && !attachmentBusy}
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

function DesktopFavoritePicker({
  favorites,
  busy,
  onBack,
  onSelect,
}: {
  favorites: DesktopFavoriteRecord[];
  busy: boolean;
  onBack: () => void;
  onSelect: (item: DesktopFavoriteRecord) => void;
}) {
  return (
    <div className="flex max-h-[360px] min-h-[220px] flex-col">
      <div className="relative border-b border-black/6 px-4 py-3 text-center">
        <button
          type="button"
          onClick={onBack}
          className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)]"
          aria-label="关闭发送收藏"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          发送收藏
        </div>
      </div>

      {favorites.length ? (
        <div className="min-h-0 flex-1 overflow-auto py-1.5">
          {favorites.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              disabled={busy}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-60",
                index > 0 ? "border-t border-black/[0.06]" : "",
              )}
            >
              <AvatarChip
                name={item.avatarName ?? item.title}
                src={item.avatarSrc}
                size="wechat"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm text-[color:var(--text-primary)]">
                    {item.title}
                  </div>
                  <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2 py-0.5 text-[10px] text-[#07c160]">
                    {item.badge}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                  {item.meta}
                </div>
                <div className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                  {item.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-sm leading-6 text-[color:var(--text-muted)]">
          还没有可发送的收藏内容，先把消息或内容加入收藏。
        </div>
      )}
    </div>
  );
}

function DesktopToolbarButton({
  icon,
  label,
  active = false,
  disabled = false,
  title,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
      className={cn(
        "inline-flex h-[30px] items-center gap-1 rounded-[7px] px-2 text-[12px] transition disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "bg-[#ededed] text-[color:var(--text-primary)]"
          : "text-[color:var(--text-secondary)] hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)]",
      )}
    >
      <span>{icon}</span>
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
    <div className="mb-3 rounded-[12px] border border-black/6 bg-white px-4 py-3">
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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#f3f4f6] text-[color:var(--text-secondary)]">
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
          className="rounded-[8px]"
        >
          取消
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onSend}
          disabled={pending}
          className="rounded-[8px] bg-[#07c160] text-white hover:bg-[#06ad56]"
        >
          {pending ? "正在发送..." : "发送附件"}
        </Button>
      </div>
    </div>
  );
}

function DesktopScreenshotToolButton({
  active,
  label,
  onClick,
  shortcut,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12px] transition",
        active
          ? "bg-white text-[#111827]"
          : "bg-white/8 text-white/78 hover:bg-white/12 hover:text-white",
      )}
    >
      <span>{label}</span>
      {shortcut ? (
        <span
          className={cn(
            "ml-1 rounded-full px-1.5 py-0.5 text-[10px]",
            active ? "bg-[#e5e7eb] text-[#374151]" : "bg-white/10 text-white/46",
          )}
        >
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

function DesktopScreenshotEditor({
  annotationColor,
  annotations,
  canRedoAnnotations,
  crop,
  draft,
  error,
  imageRef,
  notice,
  pending,
  selection,
  shortcutHelpOpen,
  tool,
  onCancel,
  onClearAnnotations,
  onClearCrop,
  onCopyCropped,
  onCopyOriginal,
  onCropMove,
  onCropMoveEnd,
  onCropMoveStart,
  onCropResizeEnd,
  onCropResizeMove,
  onCropResizeStart,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSendCropped,
  onSendOriginal,
  onAnnotationColorChange,
  onShortcutHelpOpenChange,
  onToolChange,
  onDeleteSelectedAnnotation,
  onRedoAnnotation,
  onSelectAnnotation,
  onSelectedTextChange,
  onSelectedTextMove,
  onSelectedTextMoveEnd,
  onSelectedTextMoveStart,
  onSelectedTextResizeEnd,
  onSelectedTextResizeMove,
  onSelectedTextResizeStart,
  onUndoAnnotation,
  selectedAnnotationId,
  selectedTextValue,
}: {
  annotationColor: ScreenshotAnnotationColor;
  annotations: ScreenshotAnnotation[];
  canRedoAnnotations: boolean;
  crop: NormalizedCropRect | null;
  draft: ImageDraft;
  error: string | null;
  imageRef: React.RefObject<HTMLImageElement | null>;
  notice: string | null;
  pending: boolean;
  selection: ScreenshotSelectionDraft | null;
  shortcutHelpOpen: boolean;
  tool: "crop" | "rect" | "arrow" | "text";
  onCancel: () => void;
  onClearAnnotations: () => void;
  onClearCrop: () => void;
  onCopyCropped: () => void;
  onCopyOriginal: () => void;
  onCropMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCropMoveEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCropMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCropResizeEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCropResizeMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onCropResizeStart: (
    handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSendCropped: () => void;
  onSendOriginal: () => void;
  onAnnotationColorChange: (color: ScreenshotAnnotationColor) => void;
  onShortcutHelpOpenChange: (open: boolean) => void;
  onToolChange: (tool: "crop" | "rect" | "arrow" | "text") => void;
  onDeleteSelectedAnnotation: () => void;
  onRedoAnnotation: () => void;
  onSelectAnnotation: (annotationId: string) => void;
  onSelectedTextChange: (text: string) => void;
  onSelectedTextMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectedTextMoveEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectedTextMoveStart: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onSelectedTextResizeEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectedTextResizeMove: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onSelectedTextResizeStart: (
    handle: "nw" | "ne" | "sw" | "se",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onUndoAnnotation: () => void;
  selectedAnnotationId: string | null;
  selectedTextValue: string;
}) {
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const selectedTextInputRef = useRef<HTMLInputElement | null>(null);
  const shortcutHelpRef = useRef<HTMLDivElement | null>(null);
  const shortcutDemoTimeoutRef = useRef<number | null>(null);
  const shortcutHelpTimeoutRef = useRef<number | null>(null);
  const [previewViewportSize, setPreviewViewportSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewSpacePressed, setPreviewSpacePressed] = useState(false);
  const [shortcutHelpVisible, setShortcutHelpVisible] = useState(false);
  const [shortcutHelpEntered, setShortcutHelpEntered] = useState(false);
  const [shortcutDemoGroup, setShortcutDemoGroup] =
    useState<ScreenshotShortcutHelpGroupId | null>(null);
  const [previewPanDrag, setPreviewPanDrag] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const previewZoomLabel = `${Math.round(previewZoom * 100)}%`;
  const selectionRect = selection ? getSelectionPreviewRect(selection) : null;
  const cropRect = crop ? getNormalizedCropPreviewRect(crop) : null;
  const previewRect =
    selectionRect && selection?.mode !== "arrow" ? selectionRect : null;
  const previewArrow =
    selection && selection.mode === "arrow"
      ? getSelectionArrowPreview(selection)
      : null;
  const cropPixelSize =
    crop && draft.width && draft.height
      ? {
          width: Math.max(1, Math.round(crop.width * draft.width)),
          height: Math.max(1, Math.round(crop.height * draft.height)),
        }
      : null;
  const previewPixelSize =
    previewRect && draft.width && draft.height
      ? {
          width: Math.max(1, Math.round(previewRect.width * draft.width)),
          height: Math.max(1, Math.round(previewRect.height * draft.height)),
        }
      : null;
  const zoomedViewportSize = previewViewportSize
    ? {
        width: previewViewportSize.width * previewZoom,
        height: previewViewportSize.height * previewZoom,
      }
    : null;
  const previewPanEnabled = previewZoom > 1 && previewSpacePressed;
  const previewPanVisible =
    previewZoom > 1 && Boolean(previewSpacePressed || previewPanDrag);
  const activeAnnotationPalette = getScreenshotAnnotationPaletteEntry(
    annotationColor,
  );
  const selectedTextAnnotationActive = Boolean(
    selectedAnnotationId &&
      annotations.some(
        (annotation) =>
          annotation.id === selectedAnnotationId && annotation.kind === "text",
      ),
  );
  const selectedTextAnnotation =
    selectedAnnotationId && selectedTextAnnotationActive
      ? annotations.find(
          (annotation) =>
            annotation.id === selectedAnnotationId &&
            annotation.kind === "text",
        ) ?? null
      : null;
  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(
      target.closest(
        'input, textarea, select, button, a, [contenteditable="true"], [role="button"]',
      ),
    );
  };

  useEffect(() => {
    if (!selectedTextAnnotationActive) {
      return;
    }

    selectedTextInputRef.current?.focus();
    selectedTextInputRef.current?.select();
  }, [selectedAnnotationId, selectedTextAnnotationActive]);

  useEffect(() => {
    return () => {
      if (shortcutDemoTimeoutRef.current) {
        window.clearTimeout(shortcutDemoTimeoutRef.current);
      }
      if (shortcutHelpTimeoutRef.current) {
        window.clearTimeout(shortcutHelpTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPreviewZoom(1);
    setPreviewViewportSize(null);
    setPreviewSpacePressed(false);
    setPreviewPanDrag(null);
    setShortcutHelpVisible(false);
    setShortcutHelpEntered(false);
    setShortcutDemoGroup(null);
    if (shortcutDemoTimeoutRef.current) {
      window.clearTimeout(shortcutDemoTimeoutRef.current);
      shortcutDemoTimeoutRef.current = null;
    }
    if (shortcutHelpTimeoutRef.current) {
      window.clearTimeout(shortcutHelpTimeoutRef.current);
      shortcutHelpTimeoutRef.current = null;
    }
    onShortcutHelpOpenChange(false);
  }, [draft.previewUrl, onShortcutHelpOpenChange]);

  useEffect(() => {
    if (!shortcutHelpOpen && !shortcutHelpVisible) {
      setShortcutHelpEntered(false);
      return;
    }

    if (!shortcutHelpOpen) {
      setShortcutHelpEntered(false);
      if (shortcutHelpTimeoutRef.current) {
        window.clearTimeout(shortcutHelpTimeoutRef.current);
      }
      shortcutHelpTimeoutRef.current = window.setTimeout(() => {
        setShortcutHelpVisible(false);
        shortcutHelpTimeoutRef.current = null;
      }, 150);
      return;
    }

    let animationFrameId = 0;
    if (shortcutHelpTimeoutRef.current) {
      window.clearTimeout(shortcutHelpTimeoutRef.current);
      shortcutHelpTimeoutRef.current = null;
    }
    setShortcutHelpVisible(true);
    setShortcutHelpEntered(false);
    animationFrameId = window.requestAnimationFrame(() => {
      setShortcutHelpEntered(true);
    });

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        shortcutHelpRef.current &&
        target instanceof Node &&
        !shortcutHelpRef.current.contains(target)
      ) {
        onShortcutHelpOpenChange(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [onShortcutHelpOpenChange, shortcutHelpOpen, shortcutHelpVisible]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isInteractiveTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      setPreviewSpacePressed(true);
    };

    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      setPreviewSpacePressed(false);
      setPreviewPanDrag(null);
    };

    const handleWindowBlur = () => {
      setPreviewSpacePressed(false);
      setPreviewPanDrag(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  const handleEditorShortcut = useEffectEvent(
    (event: globalThis.KeyboardEvent) => {
      if (pending || event.isComposing) {
        return;
      }

      const interactive = isInteractiveTarget(event.target);
      const key = event.key.toLowerCase();
      const commandKey = event.metaKey || event.ctrlKey;

      if (event.key === "Escape" && shortcutHelpOpen) {
        event.preventDefault();
        onShortcutHelpOpenChange(false);
        return;
      }

      if (key === "enter" && !event.altKey) {
        event.preventDefault();
        if (commandKey) {
          onSendOriginal();
          return;
        }

        if (crop) {
          onSendCropped();
          return;
        }

        onSendOriginal();
        return;
      }

      if (
        !interactive &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        event.key === "?"
      ) {
        event.preventDefault();
        onShortcutHelpOpenChange(!shortcutHelpOpen);
        return;
      }

      if (
        !interactive &&
        !event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedAnnotationId
      ) {
        event.preventDefault();
        onDeleteSelectedAnnotation();
        return;
      }

      if (
        !interactive &&
        commandKey &&
        !event.altKey &&
        key === "z" &&
        event.shiftKey
      ) {
        event.preventDefault();
        onRedoAnnotation();
        return;
      }

      if (!interactive && commandKey && !event.altKey && key === "y") {
        event.preventDefault();
        onRedoAnnotation();
        return;
      }

      if (
        !interactive &&
        commandKey &&
        !event.altKey &&
        key === "z" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        onUndoAnnotation();
        return;
      }

      if (interactive || event.altKey || event.metaKey || event.ctrlKey) {
        return;
      }

      if (key === "c") {
        event.preventDefault();
        onToolChange("crop");
        return;
      }

      if (key === "r") {
        event.preventDefault();
        onToolChange("rect");
        return;
      }

      if (key === "a") {
        event.preventDefault();
        onToolChange("arrow");
        return;
      }

      if (key === "t") {
        event.preventDefault();
        onToolChange("text");
        return;
      }

      if (key === "1") {
        event.preventDefault();
        onAnnotationColorChange("amber");
        return;
      }

      if (key === "2") {
        event.preventDefault();
        onAnnotationColorChange("cyan");
        return;
      }

      if (key === "3") {
        event.preventDefault();
        onAnnotationColorChange("rose");
        return;
      }

      if (key === "4") {
        event.preventDefault();
        onAnnotationColorChange("lime");
      }
    },
  );

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      handleEditorShortcut(event);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleEditorShortcut]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) {
      return;
    }

    const updateSize = () => {
      if (!image.clientWidth || !image.clientHeight) {
        return;
      }

      setPreviewViewportSize({
        width: image.clientWidth,
        height: image.clientHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(() => {
      if (previewZoom <= 1) {
        updateSize();
      }
    });
    observer.observe(image);

    return () => {
      observer.disconnect();
    };
  }, [imageRef, draft.previewUrl, previewZoom]);

  const updatePreviewZoom = (
    nextZoom: number,
    focusPoint?: {
      x: number;
      y: number;
    },
  ) => {
    const viewport = previewViewportRef.current;
    const clampedZoom = clamp(nextZoom, 1, 3);
    if (!viewport || Math.abs(clampedZoom - previewZoom) < 0.001) {
      setPreviewZoom(clampedZoom);
      return;
    }

    const viewportFocusX = focusPoint?.x ?? viewport.clientWidth / 2;
    const viewportFocusY = focusPoint?.y ?? viewport.clientHeight / 2;
    const contentFocusX = viewport.scrollLeft + viewportFocusX;
    const contentFocusY = viewport.scrollTop + viewportFocusY;
    const zoomRatio = clampedZoom / previewZoom;

    setPreviewZoom(clampedZoom);
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(
        0,
        contentFocusX * zoomRatio - viewportFocusX,
      );
      viewport.scrollTop = Math.max(
        0,
        contentFocusY * zoomRatio - viewportFocusY,
      );
    });
  };

  const handlePreviewWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    const step = event.deltaY < 0 ? 0.1 : -0.1;
    updatePreviewZoom(previewZoom + step);
  };

  const handlePreviewDoubleClick = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button")
    ) {
      return;
    }

    const viewport = previewViewportRef.current;
    if (!viewport) {
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const nextZoom = previewZoom >= 1.5 ? 1 : 2;
    updatePreviewZoom(nextZoom, {
      x: clamp(event.clientX - bounds.left, 0, viewport.clientWidth),
      y: clamp(event.clientY - bounds.top, 0, viewport.clientHeight),
    });
  };

  const triggerShortcutDemo = (groupId: ScreenshotShortcutHelpGroupId) => {
    setShortcutDemoGroup(groupId);
    if (shortcutDemoTimeoutRef.current) {
      window.clearTimeout(shortcutDemoTimeoutRef.current);
    }

    shortcutDemoTimeoutRef.current = window.setTimeout(() => {
      setShortcutDemoGroup((current) => (current === groupId ? null : current));
      shortcutDemoTimeoutRef.current = null;
    }, 1800);
  };

  const handlePreviewPanStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!previewPanEnabled) {
      return;
    }

    const viewport = previewViewportRef.current;
    if (!viewport) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPreviewPanDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
  };

  const handlePreviewPanMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    setPreviewPanDrag((current) => {
      if (!current || current.pointerId !== event.pointerId) {
        return current;
      }

      const viewport = previewViewportRef.current;
      if (!viewport) {
        return current;
      }

      event.preventDefault();
      event.stopPropagation();
      viewport.scrollLeft = Math.max(
        0,
        current.scrollLeft - (event.clientX - current.startX),
      );
      viewport.scrollTop = Math.max(
        0,
        current.scrollTop - (event.clientY - current.startY),
      );
      return current;
    });
  };

  const getShortcutDemoClass = (groupId: ScreenshotShortcutHelpGroupId) =>
    shortcutDemoGroup === groupId
      ? "border-[#2d8f5b] bg-[rgba(7,193,96,0.12)] shadow-[0_0_0_1px_rgba(152,245,186,0.2),0_12px_28px_rgba(7,193,96,0.14)]"
      : "border-transparent";

  const finishPreviewPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setPreviewPanDrag((current) =>
      current?.pointerId === event.pointerId ? null : current,
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(15,23,42,0.52)] p-6 backdrop-blur-sm">
      <div className="flex h-[min(86vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/12 bg-[#1f1f1f] text-white shadow-[0_32px_80px_rgba(0,0,0,0.32)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[16px] font-medium">截图预览</div>
            <div className="mt-1 text-[12px] text-white/58">
              拖拽框选裁剪范围，不框选时会按原图发送。
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="关闭截图预览"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/12 bg-white/6 text-white transition hover:bg-white/10 disabled:opacity-45"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 px-5 py-4">
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/62">
              <span className="rounded-full bg-white/8 px-2.5 py-1">
                {draft.width && draft.height
                  ? `${draft.width} × ${draft.height}`
                  : "截图"}
              </span>
              {cropPixelSize ? (
                <span className="rounded-full bg-[#153726] px-2.5 py-1 text-[#8ef0b2]">
                  裁剪后 {cropPixelSize.width} × {cropPixelSize.height}
                </span>
              ) : (
                <span className="rounded-full bg-white/8 px-2.5 py-1">
                  暂未裁剪
                </span>
              )}
              <span className="rounded-full bg-white/8 px-2.5 py-1">
                标注 {annotations.length} 条
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-white/6 px-4 py-3">
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-[12px] border px-2 py-1 transition",
                  getShortcutDemoClass("draw"),
                )}
              >
                <DesktopScreenshotToolButton
                  label="裁剪"
                  active={tool === "crop"}
                  shortcut="C"
                  onClick={() => onToolChange("crop")}
                />
                <DesktopScreenshotToolButton
                  label="矩形"
                  active={tool === "rect"}
                  shortcut="R"
                  onClick={() => onToolChange("rect")}
                />
                <DesktopScreenshotToolButton
                  label="箭头"
                  active={tool === "arrow"}
                  shortcut="A"
                  onClick={() => onToolChange("arrow")}
                />
                <DesktopScreenshotToolButton
                  label="文字"
                  active={tool === "text"}
                  shortcut="T"
                  onClick={() => onToolChange("text")}
                />
                {tool !== "crop" ? (
                  <div className="ml-1 flex items-center gap-2 rounded-full bg-white/6 px-2 py-1">
                    {SCREENSHOT_ANNOTATION_PALETTE.map((palette, index) => (
                      <button
                        key={palette.id}
                        type="button"
                        onClick={() => onAnnotationColorChange(palette.id)}
                        title={`切换为${palette.label}标注 (${index + 1})`}
                        className={cn(
                          "relative h-5 w-5 rounded-full border transition",
                          palette.id === annotationColor
                            ? "scale-110 border-white shadow-[0_0_0_2px_rgba(255,255,255,0.16)]"
                            : "border-white/20 hover:border-white/60",
                        )}
                        style={{ backgroundColor: palette.stroke }}
                        aria-label={`切换为${palette.label}标注`}
                      >
                        <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#111827] px-1 text-[9px] font-medium text-white/85 shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
                          {index + 1}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {selectedTextAnnotationActive ? (
                  <input
                    ref={selectedTextInputRef}
                    type="text"
                    value={selectedTextValue}
                    onChange={(event) => onSelectedTextChange(event.target.value)}
                    placeholder="输入标注文字"
                    className="ml-2 h-9 min-w-[180px] rounded-[10px] border border-white/12 bg-white/8 px-3 text-[12px] text-white outline-none placeholder:text-white/28 focus:border-white/30"
                  />
                ) : null}
              </div>

              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-[12px] border px-2 py-1 transition",
                  getShortcutDemoClass("view"),
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => updatePreviewZoom(previewZoom - 0.25)}
                  disabled={pending || previewZoom <= 1}
                  className="rounded-[9px] border-white/12 bg-white/6 px-3 text-white hover:bg-white/10"
                >
                  -
                </Button>
                <span className="rounded-full bg-white/8 px-2.5 py-1 text-[12px] text-white/72">
                  {previewZoomLabel}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => updatePreviewZoom(previewZoom + 0.25)}
                  disabled={pending || previewZoom >= 3}
                  className="rounded-[9px] border-white/12 bg-white/6 px-3 text-white hover:bg-white/10"
                >
                  +
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => updatePreviewZoom(1)}
                  disabled={pending || previewZoom === 1}
                  className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  适应
                </Button>
              </div>
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-[12px] border px-2 py-1 transition",
                  getShortcutDemoClass("history"),
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onUndoAnnotation}
                  disabled={pending || !annotations.length}
                  title="撤销标注 (Cmd/Ctrl+Z)"
                  className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  撤销标注
                  <span className="text-[10px] text-white/50">⌘/Ctrl+Z</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onRedoAnnotation}
                  disabled={pending || !canRedoAnnotations}
                  title="重做标注 (Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y)"
                  className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  重做标注
                  <span className="text-[10px] text-white/50">⌘/Ctrl+Shift+Z</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onDeleteSelectedAnnotation}
                  disabled={pending || !selectedAnnotationId}
                  title="删除标注 (Delete / Backspace)"
                  className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  删除标注
                  <span className="text-[10px] text-white/50">Del</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClearAnnotations}
                  disabled={pending || !annotations.length}
                  className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  清空标注
                </Button>
              </div>
              <div ref={shortcutHelpRef} className="relative">
                <button
                  type="button"
                  onClick={() => onShortcutHelpOpenChange(!shortcutHelpOpen)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition",
                    shortcutHelpOpen
                      ? "border-white/18 bg-white/8 text-white/88"
                      : "border-white/8 bg-transparent text-white/46 hover:border-white/14 hover:bg-white/6 hover:text-white/72",
                  )}
                  title="查看截图快捷键 (?)"
                >
                  <span className="rounded-full border border-white/12 bg-white/6 px-1.5 py-0.5 text-[10px] leading-none text-white/72">
                    ?
                  </span>
                  <span>快捷键</span>
                </button>
                {shortcutHelpVisible ? (
                  <div
                    className={cn(
                      "absolute -right-1 top-full z-30 mt-1.5 w-[288px] origin-top-right rounded-[14px] border border-white/12 bg-[#181818] p-2.5 text-[11px] text-white/72 shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition duration-150 ease-out",
                      shortcutHelpEntered
                        ? "translate-y-0 opacity-100"
                        : "-translate-y-0.5 opacity-0",
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-[10px] text-white/44">
                      <span className="rounded-full border border-white/10 bg-white/6 px-1.5 py-0.5 leading-none text-white/62">
                        ?
                      </span>
                      <span>按 ? 开关，点下面分组可高亮对应区域。</span>
                    </div>
                    <div className="grid gap-1.5">
                      {SCREENSHOT_SHORTCUT_HELP_GROUPS.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => triggerShortcutDemo(item.id)}
                          className={cn(
                            "flex items-start justify-between gap-2.5 rounded-[9px] border px-2.5 py-1.5 text-left transition",
                            shortcutDemoGroup === item.id
                              ? "border-[#2d8f5b] bg-[rgba(7,193,96,0.14)] text-white"
                              : "border-transparent bg-white/[0.045] hover:border-white/8 hover:bg-white/[0.065]",
                          )}
                        >
                          <span className="min-w-[56px] pt-0.5 text-[10px] font-medium text-white/38">
                            {item.label}
                          </span>
                          <span className="text-right">
                            <span className="inline-flex rounded-[7px] border border-white/10 bg-white/8 px-2 py-1 text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                              {item.primary}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-white/50">
                              {item.secondary}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div
              ref={previewViewportRef}
              onWheel={handlePreviewWheel}
              onDoubleClick={handlePreviewDoubleClick}
              className="relative min-h-0 flex-1 overflow-auto rounded-[18px] border border-white/8 bg-[#111]"
            >
              <div className="flex min-h-full min-w-full items-center justify-center p-5">
                <div
                  className="relative shrink-0"
                  style={
                    zoomedViewportSize
                      ? {
                          width: `${zoomedViewportSize.width}px`,
                          height: `${zoomedViewportSize.height}px`,
                        }
                      : undefined
                  }
                >
                  <img
                    ref={imageRef}
                    src={draft.previewUrl}
                    alt={draft.fileName}
                    draggable={false}
                    className={cn(
                      "block rounded-[14px] shadow-[0_24px_64px_rgba(0,0,0,0.32)]",
                      zoomedViewportSize
                        ? "h-full w-full object-fill"
                        : "max-h-[calc(86vh-240px)] max-w-full object-contain",
                    )}
                  />
                  <div
                    className={cn(
                      "absolute inset-0",
                      previewPanVisible
                        ? previewPanDrag
                          ? "cursor-grabbing"
                          : "cursor-grab"
                        : "cursor-crosshair",
                    )}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
                  >
                    {previewPanVisible ? (
                      <div
                        className="absolute inset-0 z-20"
                        onPointerDown={handlePreviewPanStart}
                        onPointerMove={handlePreviewPanMove}
                        onPointerUp={finishPreviewPan}
                        onPointerCancel={finishPreviewPan}
                      />
                    ) : null}
                    {cropRect ? (
                      <div
                        className="absolute border-2 border-[#07c160] bg-[rgba(7,193,96,0.12)] shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
                        style={{
                          left: `${cropRect.x * 100}%`,
                          top: `${cropRect.y * 100}%`,
                          width: `${cropRect.width * 100}%`,
                          height: `${cropRect.height * 100}%`,
                        }}
                      >
                      {cropPixelSize ? (
                        <div className="pointer-events-none absolute -top-10 left-0 rounded-full border border-[#0a7d45] bg-[rgba(6,48,27,0.9)] px-2.5 py-1 text-[11px] font-medium text-[#98f5ba] shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                          {cropPixelSize.width} × {cropPixelSize.height}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onPointerDown={onCropMoveStart}
                        onPointerMove={onCropMove}
                        onPointerUp={onCropMoveEnd}
                        onPointerCancel={onCropMoveEnd}
                        className="absolute inset-2 cursor-move rounded-[10px] border border-white/14 bg-white/0 text-transparent"
                        aria-label="移动裁剪区域"
                      />
                      {(
                        ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const
                      ).map((handle) => (
                        <button
                          key={handle}
                          type="button"
                          onPointerDown={(event) =>
                            onCropResizeStart(handle, event)
                          }
                          onPointerMove={onCropResizeMove}
                          onPointerUp={onCropResizeEnd}
                          onPointerCancel={onCropResizeEnd}
                          className={cn(
                            "absolute border-2 border-white bg-[#07c160] shadow-[0_6px_14px_rgba(7,193,96,0.28)]",
                            handle === "nw"
                              ? "-left-2 -top-2 h-3.5 w-3.5 rounded-full cursor-nwse-resize"
                              : "",
                            handle === "n"
                              ? "left-1/2 -top-2 h-3.5 w-8 -translate-x-1/2 rounded-full cursor-ns-resize"
                              : "",
                            handle === "ne"
                              ? "-right-2 -top-2 h-3.5 w-3.5 rounded-full cursor-nesw-resize"
                              : "",
                            handle === "e"
                              ? "right-[-8px] top-1/2 h-8 w-3.5 -translate-y-1/2 rounded-full cursor-ew-resize"
                              : "",
                            handle === "sw"
                              ? "-bottom-2 -left-2 h-3.5 w-3.5 rounded-full cursor-nesw-resize"
                              : "",
                            handle === "s"
                              ? "bottom-[-8px] left-1/2 h-3.5 w-8 -translate-x-1/2 rounded-full cursor-ns-resize"
                              : "",
                            handle === "se"
                              ? "-bottom-2 -right-2 h-3.5 w-3.5 rounded-full cursor-nwse-resize"
                              : "",
                            handle === "w"
                              ? "left-[-8px] top-1/2 h-8 w-3.5 -translate-y-1/2 rounded-full cursor-ew-resize"
                              : "",
                          )}
                          aria-label="调整裁剪区域"
                        />
                      ))}
                      </div>
                    ) : null}
                    {previewRect ? (
                      <div
                        className="absolute border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
                        style={{
                          left: `${previewRect.x * 100}%`,
                          top: `${previewRect.y * 100}%`,
                          width: `${previewRect.width * 100}%`,
                          height: `${previewRect.height * 100}%`,
                          borderColor:
                            selection?.mode === "crop"
                              ? "#07c160"
                              : activeAnnotationPalette.stroke,
                          backgroundColor:
                            selection?.mode === "crop"
                              ? "rgba(7,193,96,0.14)"
                              : activeAnnotationPalette.fill,
                        }}
                      >
                        {selection?.mode === "crop" && previewPixelSize ? (
                          <div className="pointer-events-none absolute -top-10 left-0 rounded-full border border-[#0a7d45] bg-[rgba(6,48,27,0.88)] px-2.5 py-1 text-[11px] font-medium text-[#98f5ba] shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                            {previewPixelSize.width} × {previewPixelSize.height}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {selectedTextAnnotation ? (
                      <div
                        className="absolute border border-white/85"
                        style={{
                          left: `${Math.min(selectedTextAnnotation.x1, selectedTextAnnotation.x2) * 100}%`,
                          top: `${Math.min(selectedTextAnnotation.y1, selectedTextAnnotation.y2) * 100}%`,
                          width: `${Math.abs(selectedTextAnnotation.x2 - selectedTextAnnotation.x1) * 100}%`,
                          height: `${Math.abs(selectedTextAnnotation.y2 - selectedTextAnnotation.y1) * 100}%`,
                          boxShadow: "0 0 0 1px rgba(0,0,0,0.2)",
                        }}
                      >
                        <button
                          type="button"
                          onPointerDown={onSelectedTextMoveStart}
                          onPointerMove={onSelectedTextMove}
                          onPointerUp={onSelectedTextMoveEnd}
                          onPointerCancel={onSelectedTextMoveEnd}
                          className="absolute inset-2 cursor-move rounded-[8px] border border-white/14 bg-white/0 text-transparent"
                          aria-label="移动文字标注"
                        />
                        {(["nw", "ne", "sw", "se"] as const).map((handle) => (
                          <button
                            key={`text-resize-${handle}`}
                            type="button"
                            onPointerDown={(event) =>
                              onSelectedTextResizeStart(handle, event)
                            }
                            onPointerMove={onSelectedTextResizeMove}
                            onPointerUp={onSelectedTextResizeEnd}
                            onPointerCancel={onSelectedTextResizeEnd}
                            className={cn(
                              "absolute h-3.5 w-3.5 rounded-full border-2 border-white bg-[#111] shadow-[0_6px_14px_rgba(0,0,0,0.24)]",
                              handle === "nw"
                                ? "-left-2 -top-2 cursor-nwse-resize"
                                : "",
                              handle === "ne"
                                ? "-right-2 -top-2 cursor-nesw-resize"
                                : "",
                              handle === "sw"
                                ? "-bottom-2 -left-2 cursor-nesw-resize"
                                : "",
                              handle === "se"
                                ? "-bottom-2 -right-2 cursor-nwse-resize"
                                : "",
                            )}
                            aria-label="调整文字标注大小"
                          />
                        ))}
                      </div>
                    ) : null}
                    <svg
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                      className="pointer-events-none absolute inset-0 h-full w-full"
                    >
                      {annotations.map((annotation) =>
                        annotation.kind === "rect" ? (
                          <rect
                            key={annotation.id}
                            x={Math.min(annotation.x1, annotation.x2)}
                            y={Math.min(annotation.y1, annotation.y2)}
                            width={Math.abs(annotation.x2 - annotation.x1)}
                            height={Math.abs(annotation.y2 - annotation.y1)}
                            fill={
                              getScreenshotAnnotationPaletteEntry(
                                annotation.color,
                              ).fill
                            }
                            stroke={
                              getScreenshotAnnotationPaletteEntry(
                                annotation.color,
                              ).stroke
                            }
                            strokeWidth="0.006"
                          />
                        ) : annotation.kind === "text" ? (
                          <g key={annotation.id}>
                            <rect
                              x={Math.min(annotation.x1, annotation.x2)}
                              y={Math.min(annotation.y1, annotation.y2)}
                              width={Math.abs(annotation.x2 - annotation.x1)}
                              height={Math.abs(annotation.y2 - annotation.y1)}
                              rx="0.01"
                              fill={
                                getScreenshotAnnotationPaletteEntry(
                                  annotation.color,
                                ).fill
                              }
                              stroke="rgba(255,255,255,0.12)"
                              strokeWidth="0.003"
                            />
                            {buildScreenshotTextPreviewLines(annotation).map(
                              (line, index) => (
                                <text
                                  key={`${annotation.id}-${index}`}
                                  x={line.x}
                                  y={line.y}
                                  fill={
                                    getScreenshotAnnotationPaletteEntry(
                                      annotation.color,
                                    ).stroke
                                  }
                                  fontSize={line.fontSize}
                                  fontWeight="600"
                                >
                                  {line.text}
                                </text>
                              ),
                            )}
                          </g>
                        ) : (
                          <g key={annotation.id}>
                            <line
                              x1={annotation.x1}
                              y1={annotation.y1}
                              x2={annotation.x2}
                              y2={annotation.y2}
                              stroke={
                                getScreenshotAnnotationPaletteEntry(
                                  annotation.color,
                                ).stroke
                              }
                              strokeWidth="0.007"
                              strokeLinecap="round"
                            />
                            <polygon
                              points={buildArrowHeadPoints(
                                annotation.x1,
                                annotation.y1,
                                annotation.x2,
                                annotation.y2,
                              )}
                              fill={
                                getScreenshotAnnotationPaletteEntry(
                                  annotation.color,
                                ).stroke
                              }
                            />
                          </g>
                        ),
                      )}
                      {previewArrow ? (
                        <g>
                          <line
                          x1={previewArrow.x1}
                          y1={previewArrow.y1}
                          x2={previewArrow.x2}
                          y2={previewArrow.y2}
                          stroke={activeAnnotationPalette.stroke}
                          strokeWidth="0.007"
                          strokeLinecap="round"
                        />
                          <polygon
                            points={buildArrowHeadPoints(
                              previewArrow.x1,
                              previewArrow.y1,
                              previewArrow.x2,
                              previewArrow.y2,
                            )}
                            fill={activeAnnotationPalette.stroke}
                          />
                        </g>
                      ) : null}
                    </svg>
                    <svg
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                      className="absolute inset-0 h-full w-full"
                    >
                      {annotations.map((annotation) =>
                        annotation.kind === "rect" || annotation.kind === "text" ? (
                          <rect
                            key={`hit-${annotation.id}`}
                            x={Math.min(annotation.x1, annotation.x2)}
                            y={Math.min(annotation.y1, annotation.y2)}
                            width={Math.abs(annotation.x2 - annotation.x1)}
                            height={Math.abs(annotation.y2 - annotation.y1)}
                            fill="transparent"
                            stroke="transparent"
                            strokeWidth="0.03"
                            className="cursor-pointer"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              onSelectAnnotation(annotation.id);
                            }}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              onSelectAnnotation(annotation.id);
                            }}
                          />
                        ) : (
                          <g key={`hit-${annotation.id}`}>
                            <line
                              x1={annotation.x1}
                              y1={annotation.y1}
                              x2={annotation.x2}
                              y2={annotation.y2}
                              stroke="transparent"
                              strokeWidth="0.04"
                              strokeLinecap="round"
                              className="cursor-pointer"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                onSelectAnnotation(annotation.id);
                              }}
                            />
                            <circle
                              cx={annotation.x2}
                              cy={annotation.y2}
                              r="0.025"
                              fill="transparent"
                              className="cursor-pointer"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                onSelectAnnotation(annotation.id);
                              }}
                            />
                          </g>
                        ),
                      )}
                      {annotations.map((annotation) => {
                        if (annotation.id !== selectedAnnotationId) {
                          return null;
                        }

                        if (
                          annotation.kind === "rect" ||
                          annotation.kind === "text"
                        ) {
                          return (
                            <rect
                              key={`selected-${annotation.id}`}
                              x={Math.min(annotation.x1, annotation.x2)}
                              y={Math.min(annotation.y1, annotation.y2)}
                              width={Math.abs(annotation.x2 - annotation.x1)}
                              height={Math.abs(annotation.y2 - annotation.y1)}
                              fill="none"
                              stroke="rgba(255,255,255,0.92)"
                              strokeWidth="0.012"
                              strokeDasharray="0.03 0.02"
                            />
                          );
                        }

                        const palette = getScreenshotAnnotationPaletteEntry(
                          annotation.color,
                        );
                        return (
                          <g key={`selected-${annotation.id}`}>
                            <line
                              x1={annotation.x1}
                              y1={annotation.y1}
                              x2={annotation.x2}
                              y2={annotation.y2}
                              stroke="rgba(255,255,255,0.92)"
                              strokeWidth="0.015"
                              strokeLinecap="round"
                            />
                            <line
                              x1={annotation.x1}
                              y1={annotation.y1}
                              x2={annotation.x2}
                              y2={annotation.y2}
                              stroke={palette.stroke}
                              strokeWidth="0.009"
                              strokeLinecap="round"
                            />
                            <circle
                              cx={annotation.x2}
                              cy={annotation.y2}
                              r="0.014"
                              fill="rgba(255,255,255,0.92)"
                            />
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {notice ? (
              <InlineNotice
                className="border-white/10 bg-white/8 text-xs text-white"
                tone="info"
              >
                {notice}
              </InlineNotice>
            ) : null}
            {error ? (
              <InlineNotice
                className="border-white/10 bg-white/8 text-xs text-white"
                tone="danger"
              >
                {error}
              </InlineNotice>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/8 px-5 py-4">
          <div className="text-[12px] text-white/54">
            {tool === "crop"
              ? crop
                ? "重新拖拽可修改裁剪区域。"
                : "拖拽图片区域即可创建裁剪选区。"
              : tool === "rect"
                ? "拖拽即可添加高亮矩形框。"
                : tool === "arrow"
                  ? "拖拽即可添加箭头标注。"
                  : "拖拽框选文字区域，随后在工具栏输入内容。"}
          </div>

          <div className="flex items-center gap-2">
            {crop ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onClearCrop}
                disabled={pending}
                className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
              >
                还原
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={onCopyOriginal}
              disabled={pending}
              className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
            >
              复制原图
            </Button>
            {crop ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onCopyCropped}
                disabled={pending}
                className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
              >
                复制裁剪图
              </Button>
            ) : null}
            <div
              className={cn(
                "flex items-center gap-2 rounded-[12px] border px-2 py-1 transition",
                getShortcutDemoClass("send"),
              )}
            >
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={pending}
              title="关闭截图预览 (Esc)"
              className="rounded-[9px] border-white/12 bg-white/6 text-white hover:bg-white/10"
            >
              取消
              <span className="text-[10px] text-white/50">Esc</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={onSendOriginal}
              disabled={pending}
              title="按原图发送 (Cmd/Ctrl+Enter)"
              className="rounded-[9px] bg-[#2f855a] text-white hover:bg-[#276749]"
            >
              {pending ? "发送中..." : "按原图发送"}
              {pending ? null : (
                <span className="text-[10px] text-white/70">⌘/Ctrl+Enter</span>
              )}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={onSendCropped}
              disabled={pending || !crop}
              title="裁剪后发送 (Enter)"
              className="rounded-[9px] bg-[#07c160] text-white hover:bg-[#06ad56]"
            >
              <Scissors size={14} />
              {pending ? "发送中..." : "裁剪后发送"}
              {pending ? null : (
                <span className="text-[10px] text-white/70">Enter</span>
              )}
            </Button>
            </div>
          </div>
        </div>
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
          ? "rounded-[10px] border border-black/6 bg-[#f7f7f7] px-4 py-2.5"
          : "rounded-[8px] border-l-[2px] border-l-[#07c160] bg-[#e9e9e9] px-3 py-2"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div
            className={`text-[11px] font-medium ${
              isDesktop ? "text-[#07a35a]" : "text-[#07c160]"
            }`}
          >
            回复 {senderName}
          </div>
          {modeLabel ? (
            <div
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                isDesktop
                  ? "bg-white text-[color:var(--text-dim)]"
                  : "bg-[rgba(7,193,96,0.12)] text-[#07c160]"
              }`}
            >
              {modeLabel}
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            "mt-1 text-[13px] leading-5",
            isDesktop
              ? "line-clamp-2 text-[color:var(--text-secondary)]"
              : "line-clamp-1 text-[#5f6368]",
          )}
        >
          {text}
        </div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition ${
            isDesktop
              ? "h-7 w-7 rounded-[7px] hover:bg-white hover:text-[color:var(--text-primary)]"
              : "h-7 w-7 active:bg-[#dcdcdc]"
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
    <div className="mb-3 overflow-hidden rounded-[12px] border border-black/6 bg-white py-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.10)]">
      <div className="px-4 pb-1 pt-1 text-[11px] text-[color:var(--text-dim)]">
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

function waitForCaptureVideo(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      void video
        .play()
        .then(() => resolve())
        .catch((error) => reject(error));
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("截图视频流初始化失败。"));
    };
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("截图生成失败，请重试。"));
    }, "image/png");
  });
}

function buildDesktopScreenshotFileName() {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  return `screenshot-${stamp}.png`;
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

function releaseImageDraft(draft: ImageDraft | null) {
  if (!draft) {
    return;
  }

  URL.revokeObjectURL(draft.previewUrl);
}

function getSelectionPreviewRect(selection: ScreenshotSelectionDraft) {
  const left = Math.min(selection.anchorX, selection.currentX);
  const top = Math.min(selection.anchorY, selection.currentY);
  const width = Math.abs(selection.currentX - selection.anchorX);
  const height = Math.abs(selection.currentY - selection.anchorY);

  return {
    x: left / selection.boundsWidth,
    y: top / selection.boundsHeight,
    width: width / selection.boundsWidth,
    height: height / selection.boundsHeight,
  } satisfies NormalizedCropRect;
}

function getNormalizedCropPreviewRect(crop: NormalizedCropRect) {
  return crop;
}

function resizeScreenshotCrop(
  crop: NormalizedCropRect,
  handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w",
  deltaX: number,
  deltaY: number,
) {
  return resizeNormalizedRect(crop, handle, deltaX, deltaY, 0.02);
}

function resizeScreenshotTextAnnotation(
  annotation: ScreenshotAnnotation,
  handle: "nw" | "ne" | "sw" | "se",
  deltaX: number,
  deltaY: number,
) {
  const nextRect = resizeNormalizedRect(
    getScreenshotAnnotationRect(annotation),
    handle,
    deltaX,
    deltaY,
    0.04,
  );

  return {
    ...annotation,
    x1: nextRect.x,
    y1: nextRect.y,
    x2: nextRect.x + nextRect.width,
    y2: nextRect.y + nextRect.height,
  };
}

function moveScreenshotTextAnnotation(
  annotation: ScreenshotAnnotation,
  deltaX: number,
  deltaY: number,
) {
  const rect = getScreenshotAnnotationRect(annotation);
  const maxX = Math.max(0, 1 - rect.width);
  const maxY = Math.max(0, 1 - rect.height);
  const nextX = clamp(rect.x + deltaX, 0, maxX);
  const nextY = clamp(rect.y + deltaY, 0, maxY);

  return {
    ...annotation,
    x1: nextX,
    y1: nextY,
    x2: nextX + rect.width,
    y2: nextY + rect.height,
  };
}

function resizeNormalizedRect(
  rect: NormalizedCropRect,
  handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w",
  deltaX: number,
  deltaY: number,
  minSize: number,
) {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  if (handle === "nw" || handle === "w" || handle === "sw") {
    left = clamp(left + deltaX, 0, right - minSize);
  }

  if (handle === "ne" || handle === "e" || handle === "se") {
    right = clamp(right + deltaX, left + minSize, 1);
  }

  if (handle === "nw" || handle === "n" || handle === "ne") {
    top = clamp(top + deltaY, 0, bottom - minSize);
  }

  if (handle === "sw" || handle === "s" || handle === "se") {
    bottom = clamp(bottom + deltaY, top + minSize, 1);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  } satisfies NormalizedCropRect;
}

function moveScreenshotCrop(
  crop: NormalizedCropRect,
  deltaX: number,
  deltaY: number,
) {
  const maxX = Math.max(0, 1 - crop.width);
  const maxY = Math.max(0, 1 - crop.height);

  return {
    x: clamp(crop.x + deltaX, 0, maxX),
    y: clamp(crop.y + deltaY, 0, maxY),
    width: crop.width,
    height: crop.height,
  } satisfies NormalizedCropRect;
}

function normalizeSelectionRect(selection: ScreenshotSelectionDraft) {
  if (!selection.boundsWidth || !selection.boundsHeight) {
    return null;
  }

  return getSelectionPreviewRect(selection);
}

function getSelectionArrowPreview(selection: ScreenshotSelectionDraft) {
  return {
    x1: selection.anchorX / selection.boundsWidth,
    y1: selection.anchorY / selection.boundsHeight,
    x2: selection.currentX / selection.boundsWidth,
    y2: selection.currentY / selection.boundsHeight,
  };
}

async function createEditedScreenshotPayload(
  draft: ImageDraft,
  input: {
    crop: NormalizedCropRect | null;
    annotations: ScreenshotAnnotation[];
  },
) {
  const width = draft.width ?? 0;
  const height = draft.height ?? 0;
  if (!width || !height) {
    throw new Error("截图尺寸异常，请重新截图。");
  }

  const crop = input.crop;
  const sourceX = crop ? Math.max(0, Math.floor(crop.x * width)) : 0;
  const sourceY = crop ? Math.max(0, Math.floor(crop.y * height)) : 0;
  const sourceWidth = crop
    ? Math.max(1, Math.round(crop.width * width))
    : width;
  const sourceHeight = crop
    ? Math.max(1, Math.round(crop.height * height))
    : height;
  const image = await loadImageElement(draft.previewUrl);
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("截图画布初始化失败。");
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );
  drawScreenshotAnnotations(context, input.annotations, {
    crop,
    width: sourceWidth,
    height: sourceHeight,
  });

  const blob = await canvasToBlob(canvas);
  const nextFileName = buildEditedScreenshotFileName(draft.fileName, {
    cropped: Boolean(crop),
    annotated: input.annotations.length > 0,
  });

  return {
    file: new File([blob], nextFileName, {
      type: "image/png",
    }),
    fileName: nextFileName,
    width: sourceWidth,
    height: sourceHeight,
  };
}

function drawScreenshotAnnotations(
  context: CanvasRenderingContext2D,
  annotations: ScreenshotAnnotation[],
  options: {
    crop: NormalizedCropRect | null;
    width: number;
    height: number;
  },
) {
  for (const annotation of annotations) {
    const palette = getScreenshotAnnotationPaletteEntry(annotation.color);
    if (annotation.kind === "rect") {
      const rect = projectNormalizedRectToCanvas(annotation, options);
      if (!rect) {
        continue;
      }

      context.save();
      context.strokeStyle = palette.stroke;
      context.fillStyle = palette.fill;
      context.lineWidth = Math.max(3, Math.round(options.width * 0.004));
      context.strokeRect(rect.x, rect.y, rect.width, rect.height);
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      context.restore();
      continue;
    }

    if (annotation.kind === "text") {
      const rect = projectNormalizedRectToCanvas(annotation, options);
      if (!rect) {
        continue;
      }

      const lines = buildScreenshotTextCanvasLines(annotation, rect.width);
      const fontSize = resolveScreenshotTextCanvasFontSize(rect);
      const lineHeight = fontSize * 1.35;
      const paddingX = Math.max(10, fontSize * 0.45);
      const paddingY = Math.max(8, fontSize * 0.35);
      const boxHeight = Math.max(
        rect.height,
        paddingY * 2 + lineHeight * Math.max(1, lines.length),
      );

      context.save();
      context.fillStyle = palette.fill;
      context.strokeStyle = "rgba(255,255,255,0.18)";
      context.lineWidth = Math.max(1.5, Math.round(options.width * 0.0016));
      roundRect(context, rect.x, rect.y, rect.width, boxHeight, 12);
      context.fill();
      context.stroke();
      context.fillStyle = palette.stroke;
      context.font = `600 ${fontSize}px sans-serif`;
      context.textBaseline = "top";
      for (const [index, line] of lines.entries()) {
        context.fillText(
          line,
          rect.x + paddingX,
          rect.y + paddingY + index * lineHeight,
          Math.max(0, rect.width - paddingX * 2),
        );
      }
      context.restore();
      continue;
    }

    const arrow = projectNormalizedLineToCanvas(annotation, options);
    if (!arrow) {
      continue;
    }

    context.save();
    context.strokeStyle = palette.stroke;
    context.fillStyle = palette.stroke;
    context.lineWidth = Math.max(4, Math.round(options.width * 0.005));
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(arrow.x1, arrow.y1);
    context.lineTo(arrow.x2, arrow.y2);
    context.stroke();

    const head = getArrowHeadGeometry(
      arrow.x1,
      arrow.y1,
      arrow.x2,
      arrow.y2,
      Math.max(14, options.width * 0.018),
    );
    context.beginPath();
    context.moveTo(head.tipX, head.tipY);
    context.lineTo(head.leftX, head.leftY);
    context.lineTo(head.rightX, head.rightY);
    context.closePath();
    context.fill();
    context.restore();
  }
}

function getScreenshotAnnotationPaletteEntry(color: ScreenshotAnnotationColor) {
  return (
    SCREENSHOT_ANNOTATION_PALETTE.find((palette) => palette.id === color) ??
    SCREENSHOT_ANNOTATION_PALETTE[0]
  );
}

function areScreenshotAnnotationsEqual(
  left: ScreenshotAnnotation[],
  right: ScreenshotAnnotation[],
) {
  return (
    left.length === right.length &&
    left.every(
      (annotation, index) =>
        annotation.id === right[index]?.id &&
        annotation.kind === right[index]?.kind &&
        annotation.color === right[index]?.color &&
        annotation.x1 === right[index]?.x1 &&
        annotation.y1 === right[index]?.y1 &&
        annotation.x2 === right[index]?.x2 &&
        annotation.y2 === right[index]?.y2 &&
        annotation.text === right[index]?.text,
    )
  );
}

function buildScreenshotTextPreviewLines(annotation: ScreenshotAnnotation) {
  const rect = getScreenshotAnnotationRect(annotation);
  const fontSize = resolveScreenshotTextPreviewFontSize(rect);
  const paddingX = Math.max(0.012, fontSize * 0.42);
  const paddingY = Math.max(0.01, fontSize * 0.35);
  const maxWidth = Math.max(0.04, rect.width - paddingX * 2);
  const maxLines = Math.max(
    1,
    Math.floor((rect.height - paddingY * 2) / (fontSize * 1.32)),
  );

  return buildWrappedScreenshotText(annotation.text ?? "输入文字", maxWidth, {
    averageCharWidth: fontSize * 0.62,
    maxLines,
  }).map((line, index) => ({
    text: line,
    x: rect.x + paddingX,
    y: rect.y + paddingY + fontSize + index * fontSize * 1.32,
    fontSize,
  }));
}

function buildScreenshotTextCanvasLines(
  annotation: ScreenshotAnnotation,
  width: number,
) {
  const fontSize = resolveScreenshotTextCanvasFontSize({
    width,
    height: Math.abs(annotation.y2 - annotation.y1) * 1000,
  });
  const maxWidth = Math.max(24, width - Math.max(20, fontSize * 0.9));
  const maxLines = Math.max(
    1,
    Math.floor(
      (Math.abs(annotation.y2 - annotation.y1) * 1000 - fontSize * 0.7) /
        (fontSize * 1.35),
    ),
  );

  return buildWrappedScreenshotText(annotation.text ?? "输入文字", maxWidth, {
    averageCharWidth: fontSize * 0.62,
    maxLines,
  });
}

function buildWrappedScreenshotText(
  value: string,
  maxWidth: number,
  options: {
    averageCharWidth: number;
    maxLines: number;
  },
) {
  const source = value.trim() || "输入文字";
  const maxCharsPerLine = Math.max(
    1,
    Math.floor(maxWidth / Math.max(1, options.averageCharWidth)),
  );
  const rawLines = source.split("\n");
  const wrapped: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine || " ";
    for (let index = 0; index < line.length; index += maxCharsPerLine) {
      wrapped.push(line.slice(index, index + maxCharsPerLine));
      if (wrapped.length >= options.maxLines) {
        return wrapped;
      }
    }
  }

  return wrapped.slice(0, options.maxLines);
}

function getScreenshotAnnotationRect(annotation: ScreenshotAnnotation) {
  return {
    x: Math.min(annotation.x1, annotation.x2),
    y: Math.min(annotation.y1, annotation.y2),
    width: Math.abs(annotation.x2 - annotation.x1),
    height: Math.abs(annotation.y2 - annotation.y1),
  };
}

function resolveScreenshotTextPreviewFontSize(rect: NormalizedCropRect) {
  return clamp(Math.min(rect.height * 0.45, 0.04), 0.016, 0.04);
}

function resolveScreenshotTextCanvasFontSize(rect: {
  width: number;
  height: number;
}) {
  return clamp(Math.min(rect.height * 0.42, 30), 14, 30);
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + nextRadius, y);
  context.arcTo(x + width, y, x + width, y + height, nextRadius);
  context.arcTo(x + width, y + height, x, y + height, nextRadius);
  context.arcTo(x, y + height, x, y, nextRadius);
  context.arcTo(x, y, x + width, y, nextRadius);
  context.closePath();
}

function projectNormalizedRectToCanvas(
  annotation: ScreenshotAnnotation,
  options: {
    crop: NormalizedCropRect | null;
    width: number;
    height: number;
  },
) {
  const x = Math.min(annotation.x1, annotation.x2);
  const y = Math.min(annotation.y1, annotation.y2);
  const width = Math.abs(annotation.x2 - annotation.x1);
  const height = Math.abs(annotation.y2 - annotation.y1);

  return projectRectToCanvas({ x, y, width, height }, options);
}

function projectNormalizedLineToCanvas(
  annotation: ScreenshotAnnotation,
  options: {
    crop: NormalizedCropRect | null;
    width: number;
    height: number;
  },
) {
  const start = projectPointToCanvas(annotation.x1, annotation.y1, options);
  const end = projectPointToCanvas(annotation.x2, annotation.y2, options);
  if (!start || !end) {
    return null;
  }

  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  };
}

function projectRectToCanvas(
  rect: NormalizedCropRect,
  options: {
    crop: NormalizedCropRect | null;
    width: number;
    height: number;
  },
) {
  const topLeft = projectPointToCanvas(rect.x, rect.y, options);
  const bottomRight = projectPointToCanvas(
    rect.x + rect.width,
    rect.y + rect.height,
    options,
  );
  if (!topLeft || !bottomRight) {
    return null;
  }

  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  };
}

function projectPointToCanvas(
  x: number,
  y: number,
  options: {
    crop: NormalizedCropRect | null;
    width: number;
    height: number;
  },
) {
  const crop = options.crop;
  if (!crop) {
    return {
      x: x * options.width,
      y: y * options.height,
    };
  }

  const projectedX = ((x - crop.x) / crop.width) * options.width;
  const projectedY = ((y - crop.y) / crop.height) * options.height;
  if (
    projectedX < -options.width ||
    projectedX > options.width * 2 ||
    projectedY < -options.height ||
    projectedY > options.height * 2
  ) {
    return null;
  }

  return {
    x: projectedX,
    y: projectedY,
  };
}

function buildEditedScreenshotFileName(
  fileName: string,
  options: {
    cropped: boolean;
    annotated: boolean;
  },
) {
  const normalized = fileName.trim() || buildDesktopScreenshotFileName();
  const extensionIndex = normalized.lastIndexOf(".");
  let suffix = "";

  if (options.cropped && options.annotated) {
    suffix = "-edited";
  } else if (options.cropped) {
    suffix = "-cropped";
  } else if (options.annotated) {
    suffix = "-annotated";
  }

  if (extensionIndex <= 0) {
    return `${normalized}${suffix || "-edited"}.png`;
  }

  return `${normalized.slice(0, extensionIndex)}${suffix || "-edited"}.png`;
}

function loadImageElement(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("截图解析失败，请重新截图。"));
    image.src = url;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildArrowHeadPoints(x1: number, y1: number, x2: number, y2: number) {
  const head = getArrowHeadGeometry(x1, y1, x2, y2, 0.024);
  return `${head.tipX},${head.tipY} ${head.leftX},${head.leftY} ${head.rightX},${head.rightY}`;
}

function getArrowHeadGeometry(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  headLength: number,
) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const leftAngle = angle + Math.PI * 0.82;
  const rightAngle = angle - Math.PI * 0.82;

  return {
    tipX: x2,
    tipY: y2,
    leftX: x2 + Math.cos(leftAngle) * headLength,
    leftY: y2 + Math.sin(leftAngle) * headLength,
    rightX: x2 + Math.cos(rightAngle) * headLength,
    rightY: y2 + Math.sin(rightAngle) * headLength,
  };
}

function createScreenshotAnnotationId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `annotation-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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
