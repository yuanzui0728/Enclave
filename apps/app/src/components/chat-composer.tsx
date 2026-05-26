import { Capacitor } from "@capacitor/core";
import { useQuery } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Download,
  FileText,
  ImageIcon,
  Keyboard,
  Mic,
  MonitorUp,
  Plus,
  Scissors,
  SendHorizontal,
  Smile,
  Star,
  Square,
  X,
} from "lucide-react";
import { getFavorites, type StickerAttachment } from "@yinjie/contracts";
import {
  compareByLocale,
  translateRuntimeMessage,
  useRuntimeTranslator,
} from "@yinjie/i18n";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { InlineNoticeActionButton } from "./inline-notice-action-button";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
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
  computeDesktopFavoritesFingerprint,
  DESKTOP_FAVORITES_STORAGE_KEY,
  hydrateDesktopFavoritesFromNative,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  type DesktopFavoriteRecord,
} from "../features/favorites/favorites-storage";
import {
  hydrateRecentStickersFromNative,
  loadRecentStickers,
  pushRecentSticker,
  RECENT_STICKERS_STORAGE_KEY,
} from "../features/chat/stickers/recent-stickers";
import { StickerPanel } from "../features/chat/stickers/sticker-panel";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import {
  captureImageWithNativeShell,
  type MobileBridgeFileAsset,
  pickFileWithNativeShell,
  pickImagesWithNativeShell,
  type MobileBridgeImageAsset,
  openAppSettings,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { revealSavedFile } from "../runtime/reveal-saved-file";
import { saveLocalFile } from "../runtime/save-local-file";
import { useChatPreferencesStore } from "../store/chat-preferences-store";
import {
  isChatMentionPrefixBoundary,
  isChatMentionTokenCharacter,
} from "../lib/chat-text";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";

type ChatComposerProps = {
  value: string;
  placeholder: string;
  variant?: "mobile" | "desktop";
  pending?: boolean;
  error?: string | null;
  errorActionLabel?: string;
  onErrorAction?: (() => void) | null;
  speechInput?: {
    baseUrl?: string;
    conversationId: string;
    characterId?: string;
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
    // 走查电脑端群聊 R3：name 用于 picker 展示，可能是用户的好友 remark name
    // （"小明"）。但实际插入到 message text 的 token 要走 server 端能匹配的
    // 名字——api/src/modules/chat/group-reply-planner.service.ts line 64-68
    // 的 aliases 只看 [member.memberName(群内昵称), character.name(角色原名)]，
    // 不知道用户本地 friend.remarkName。如果按 name 插入 `@小明`，server 算
    // isExplicitTarget=false → 该角色拿不到 mention 加权 → 不一定回复。
    // mentionName 由调用方在 name ≠ 服务端可匹配名时显式提供：picker 仍按
    // name 展示，applyMentionCandidate 走 mentionName ?? name 插入。
    mentionName?: string;
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
  // 当前会话里不该出现在"+面板/选择名片"里的 character id 集合。单聊里至少要排
  // 掉对方自己（包括"我自己"自聊场景下的 self-character），不然用户会看到"把对方
  // 的名片再发给对方"这种没意义的入口。
  contactPickerExcludeIds?: readonly string[];
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

type DesktopScreenshotNoticeState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ScreenshotShortcutHelpGroupId = "send" | "view" | "draw" | "history";

const SCREENSHOT_ANNOTATION_PALETTE = [
  {
    id: "amber",get label() {
      return translateRuntimeMessage(msg`琥珀`);
    },stroke: "#f59e0b",fill: "rgba(245,158,11,0.12)",},{
    id: "cyan",get label() {
      return translateRuntimeMessage(msg`青蓝`);
    },stroke: "#38bdf8",fill: "rgba(56,189,248,0.14)",},{
    id: "rose",get label() {
      return translateRuntimeMessage(msg`玫红`);
    },stroke: "#fb7185",fill: "rgba(251,113,133,0.14)",},{
    id: "lime",get label() {
      return translateRuntimeMessage(msg`青柠`);
    },stroke: "#84cc16",fill: "rgba(132,204,22,0.14)",},] satisfies Array<{
  id: ScreenshotAnnotationColor;
  label: string;
  stroke: string;
  fill: string;
}>;

const CHAT_ATTACHMENT_IMAGE_UPLOAD_LIMIT_BYTES = 32 * 1024 * 1024;
// 走查第二批 R1：和 api/chat.controller.ts:238 CHAT_ATTACHMENT_UPLOAD_LIMIT_BYTES
// 对齐。applyGenericFileDraft 前端校验上限，避免 100MB 大文件被一路 fetch 到
// server 才被 Multer 413 拒掉。
const CHAT_ATTACHMENT_UPLOAD_LIMIT_BYTES = 32 * 1024 * 1024;
const CHAT_ATTACHMENT_IMAGE_UPLOAD_SCALE_STEPS = [1, 0.92, 0.84, 0.76];
const CHAT_ATTACHMENT_IMAGE_EXPORT_CANDIDATES = [
  { mimeType: "image/png", extension: "png" },
  { mimeType: "image/webp", extension: "webp", quality: 0.92 },
  { mimeType: "image/webp", extension: "webp", quality: 0.84 },
  { mimeType: "image/jpeg", extension: "jpg", quality: 0.9 },
  { mimeType: "image/jpeg", extension: "jpg", quality: 0.82 },
  { mimeType: "image/jpeg", extension: "jpg", quality: 0.74 },
] satisfies Array<{
  mimeType: "image/png" | "image/webp" | "image/jpeg";
  extension: "png" | "webp" | "jpg";
  quality?: number;
}>;

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

type MobilePlusNoticeState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

type MobileComposerMode = "text" | "speech" | "sticker" | "plus";

type MobileComposerStatusState = {
  tone: "muted" | "info" | "success" | "danger";
  label: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

export function ChatComposer({
  value,
  placeholder,
  variant = "mobile",
  pending = false,
  error,
  errorActionLabel,
  onErrorAction = null,
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
  contactPickerExcludeIds,
  onCancelReply,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const nativeDesktopRecentStickers = runtimeConfig.appPlatform === "desktop";
  const sendMessageShortcut = useChatPreferencesStore(
    (state) => state.sendMessageShortcut,
  );
  const baseUrl = speechInput?.baseUrl ?? runtimeConfig.apiBaseUrl;
  const { keyboardInset, keyboardOpen } = useKeyboardInset();
  const isDesktop = variant === "desktop";
  // 走查 R74：composer 外层 div style 之前 inline new 对象，每个 keystroke
  // 都换新引用。memo 让桌面端常驻 "0.75rem"、移动端 keyboard 闭合时
  // "0.5rem"、键盘弹起时 ${keyboardInset}px 各自稳定。
  const composerOuterStyle = useMemo<CSSProperties>(
    () => ({
      paddingBottom: keyboardOpen
        ? `${keyboardInset}px`
        : isDesktop
          ? "0.75rem"
          : "0.5rem",
    }),
    [isDesktop, keyboardInset, keyboardOpen],
  );
  const nativeMobileShellSupported = isNativeMobileShareSurface({
    isDesktopLayout: isDesktop,
  });
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
  const [
    desktopScreenshotAnnotationColor,
    setDesktopScreenshotAnnotationColor,
  ] = useState<ScreenshotAnnotationColor>("amber");
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
  const [, setDesktopScreenshotCropResize] =
    useState<ScreenshotCropResizeDraft | null>(null);
  const [, setDesktopScreenshotCropMove] =
    useState<ScreenshotCropMoveDraft | null>(null);
  const [, setDesktopScreenshotAnnotationResize] =
    useState<ScreenshotAnnotationResizeDraft | null>(null);
  const [, setDesktopScreenshotAnnotationMove] =
    useState<ScreenshotAnnotationMoveDraft | null>(null);
  const [desktopScreenshotNotice, setDesktopScreenshotNotice] =
    useState<DesktopScreenshotNoticeState | null>(null);
  const [
    desktopScreenshotShortcutHelpOpen,
    setDesktopScreenshotShortcutHelpOpen,
  ] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  // 同步防双击锁——下面 4 条 send 链路（handleSendAttachment / handleSendDraftAttachment
  // / sendRecordedVoice / handleSendPresetText / handleSendSticker）都用
  // setAttachmentBusy(true) 当 disabled 兜底，但 attachmentBusy 是 React state，
  // 同帧连点 2 次任意一个发送按钮都能同时通过 disabled=false → 双倍上传 + 双倍
  // 发送。最严重的是 MobileChatAttachmentPreview「发送图片」连点 2 次：
  // handleSendDraftAttachment 的 for-loop 持同一份 currentDraft.items，
  // 一份 9 张图被上传 18 次、发送 18 次到群里。和 Round 1-4 同款修法：ref
  // 同步赋值不走 React render，第一次 click 把它翻 true 之后同帧后续 click
  // 都被早返；onSettled / finally 解锁。
  const sendBusyRef = useRef(false);
  const [mobilePlusNotice, setMobilePlusNotice] =
    useState<MobilePlusNoticeState | null>(null);
  const [activeStickerPackId, setActiveStickerPackId] = useState("featured");
  const [recentStickers, setRecentStickers] = useState(() =>
    loadRecentStickers(),
  );
  const desktopStickerRef = useRef<HTMLDivElement | null>(null);
  const desktopPlusRef = useRef<HTMLDivElement | null>(null);
  const desktopDropDepthRef = useRef(0);
  const desktopInputRef = useRef<HTMLTextAreaElement | null>(null);
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
  const [desktopEditorExpanded, setDesktopEditorExpanded] = useState(false);
  const [inputCursor, setInputCursor] = useState(0);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [pendingSelection, setPendingSelection] = useState<number | null>(null);
  const [mobileMentionDismissed, setMobileMentionDismissed] = useState(false);
  // 走查电脑端群聊新会话 R108：原版桌面端 @mention picker 没有"主动关闭"路径
  // —— 移动端有 mobileMentionDismissed + sheet 关闭按钮，桌面端 picker 只能
  // 靠 backspace 删 "@xxx" / 移光标走开 / 选候选 才会消失。用户在群聊 composer
  // 里打 @ 误触后想关 picker 自然按 Esc，但桌面端 handleDesktopInputKeyDown
  // 在 mentionPickerOpen 里只接 ArrowDown/Up/Enter，Esc 透传到 window keydown
  // → workspace 的 dismissSidePanel 兜底（line ~996-1007 只跳过 role="dialog"/
  // role="menu"，listbox 不在白名单）→ 把背后的「聊天信息」侧栏意外关掉。
  // 配合 mobileMentionDismissed 同款 state，让桌面端 Esc 把 picker 主动闭合
  // —— activeMention 内容下次变化（用户多打一个字或挪光标）时 reset 让 picker
  // 重新可弹。
  const [desktopMentionDismissed, setDesktopMentionDismissed] = useState(false);
  const [mobileSpeechPressing, setMobileSpeechPressing] = useState(false);
  const [mobileSpeechCancelIntent, setMobileSpeechCancelIntent] =
    useState(false);
  const [mobileInputMode, setMobileInputMode] = useState<"text" | "speech">(
    "text",
  );
  const desktopInputComposingRef = useRef(false);
  const showSpeechEntry = Boolean(
    speechInput?.enabled && speechInput?.conversationId,
  );
  const speech = useSpeechInput({
    baseUrl: speechInput?.baseUrl,
    conversationId: speechInput?.conversationId ?? "",
    characterId: speechInput?.characterId,
    enabled: showSpeechEntry,
    mode: isDesktop ? "dictation" : "voice",
  });
  // 走查 R1：useSpeechInput 每次 render 返回新对象字面量。下方 setMobileComposerMode
  // useCallback 之前直接把 `speech` 整对象塞进 deps → callback 每帧重建 →
  // returnMobileComposerToText（dep 含 setMobileComposerMode）跟着每帧重建 →
  // line 989-999 的 Android-back 拦截 useEffect 跟着每帧 unregister/re-register
  // back handler，用户每打一个字都重新挂一次拦截器。speech.cancel 已是
  // useEffectEvent 稳定函数；speech.status 是字符串，依赖它是必要的。用 ref
  // 镜像 speech，callback 内通过 ref 读 status / cancel，把 speech 从 deps 摘掉。
  const speechRef = useRef(speech);
  speechRef.current = speech;
  const speechSupported = showSpeechEntry && speech.supported;
  const speechDisabledReason =
    showSpeechEntry && !speechSupported
      ? isDesktop
        ? t(msg`当前浏览器不支持语音输入，请改用键盘输入。`)
        : runtimeConfig.appPlatform === "android" ||
            runtimeConfig.appPlatform === "ios"
          ? t(msg`当前设备不支持语音发送，请改用键盘输入。`)
          : t(msg`当前浏览器不支持语音发送，请改用键盘输入。`)
      : null;
  const speechButtonDisabled =
    !speechSupported ||
    speech.status === "requesting-permission" ||
    speech.status === "processing";
  const composerError = error ?? speech.error ?? attachmentError;
  const speechDisplayText = speech.displayText.trim();
  const composerPending = pending || attachmentBusy;
  const mobileComposerMode: MobileComposerMode = isDesktop
    ? "text"
    : plusPanelOpen
      ? "plus"
      : stickerPanelOpen
        ? "sticker"
        : showSpeechEntry && mobileInputMode === "speech"
          ? "speech"
          : "text";
  const mobileSpeechMode = !isDesktop && mobileComposerMode === "speech";
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
    // 走查 R72：原版每次 filter callback 跑 2 次 toLowerCase（name + subtitle），
    // sort 比较器又跑 2 次 toLowerCase（左右 startsWith）。50 人群 + 4 字 query =
    // 50 × 4 × (2 filter + 2 × log2(50) sort) ≈ 2600 toLowerCase / 字。
    // 一次性预计算每个 candidate 的 lowerName / lowerSubtitle / startsWith bool，
    // filter 和 sort 复用，避免 hot path（@ picker 每键击都重算）上的重复字符串
    // 操作。同时把 sort 的 startsWith 提前算成 bool，避免在 O(N log N) 比较里
    // 反复重算。
    const normalized: Array<{
      candidate: (typeof mentionCandidates)[number];
      lowerName: string;
      startsWith: boolean;
    }> = [];
    for (const candidate of mentionCandidates) {
      const lowerName = candidate.name.toLowerCase();
      if (query) {
        const lowerSubtitle = (candidate.subtitle ?? "").toLowerCase();
        if (
          !lowerName.includes(query) &&
          !lowerSubtitle.includes(query)
        ) {
          continue;
        }
      }
      normalized.push({
        candidate,
        lowerName,
        startsWith: query ? lowerName.startsWith(query) : false,
      });
    }

    normalized.sort((left, right) => {
      // 走查 Round 1：原版只按 startsWith + locale 排，"mention-all"
      // (所有人) 在中文 locale 下 sō < zhāng/lín 一类按拼音排会被压到列
      // 表尾部，和 WeChat 习惯（@ 默认 "所有人" 置顶可一键选中）不一致。
      // 空 query 时把 mention-all 强制顶端；有 query 时按 startsWith 命中
      // 优先，命中相同再 locale。
      if (!query) {
        if (
          left.candidate.id === "mention-all" &&
          right.candidate.id !== "mention-all"
        ) {
          return -1;
        }
        if (
          right.candidate.id === "mention-all" &&
          left.candidate.id !== "mention-all"
        ) {
          return 1;
        }
      }
      if (left.startsWith === right.startsWith) {
        return compareByLocale(left.candidate.name, right.candidate.name);
      }
      return left.startsWith ? -1 : 1;
    });

    return normalized.slice(0, 6).map((entry) => entry.candidate);
    // 这里 t 不在 body 里调用：filtering + sorting 都不渲染本地化文案，
    // 候选项的 name/subtitle 由调用方 (group-chat-thread-panel 的
    // mentionCandidates) 算好后传进来。漏掉 t 不会导致 stale string。
  }, [activeMention, mentionCandidates]);
  const mentionPickerOpen = Boolean(filteredMentionCandidates.length);
  // 走查 R4：和 chat-message-list.favoritesQuery (R7 配的 30s) 同 queryKey
  // 共享 cache。原本裸跑（默认 desktop 10s / mobile-web 60s），用户在桌面单聊
  // 多次开合「+ → 收藏」面板时 ≥10s 就要 GET /favorites 再来一次（公网隧道
  // ~600ms RTT）。和兄弟入口对齐 30s——收藏只读，频繁开合不必重抓。
  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
    enabled:
      isDesktop && desktopPlusMenuOpen && desktopPlusMenuView === "favorites",
    staleTime: 30_000,
  });

  const getActiveInput = useCallback(
    () =>
      (isDesktop ? desktopInputRef.current : mobileTextareaRef.current) ??
      desktopInputRef.current ??
      mobileTextareaRef.current,
    [isDesktop],
  );

  const focusInput = useCallback(() => {
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
  }, [getActiveInput]);

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

  const setMobileSpeechCancelState = useCallback((nextValue: boolean) => {
    mobileSpeechCancelIntentRef.current = nextValue;
    setMobileSpeechCancelIntent(nextValue);
  }, []);

  const resetMobileSpeechGesture = useCallback(() => {
    mobileSpeechPointerIdRef.current = null;
    mobileSpeechStartYRef.current = null;
    setMobileSpeechPressing(false);
    setMobileSpeechCancelState(false);
  }, [setMobileSpeechCancelState]);

  const closeMobileSpeechSheet = useCallback(() => {
    mobileSpeechAutoCommitRef.current = false;
    resetMobileSpeechGesture();
    setMobileSpeechSheetOpen(false);
  }, [resetMobileSpeechGesture]);

  const setMobileComposerMode = useCallback(
    (nextMode: MobileComposerMode) => {
      if (isDesktop) {
        return;
      }

      if (nextMode === "speech" && !showSpeechEntry) {
        return;
      }

      if (nextMode === "sticker" && !onSendSticker) {
        return;
      }

      if (nextMode === "plus" && !onSendAttachment) {
        return;
      }

      // 通过 speechRef 读最新 status / cancel，避免把整个 speech 对象拖进 deps。
      if (speechRef.current.status !== "idle") {
        speechRef.current.cancel();
      }
      closeMobileSpeechSheet();
      setStickerPanelOpen(nextMode === "sticker");
      setPlusPanelOpen(nextMode === "plus");
      setMobilePlusNotice(null);

      if (nextMode === "speech") {
        setAttachmentError(null);
        blurActiveElement();
        setMobileInputMode("speech");
        return;
      }

      setMobileInputMode("text");
      if (nextMode === "sticker" || nextMode === "plus") {
        setAttachmentError(null);
        blurActiveElement();
      }
    },
    [
      closeMobileSpeechSheet,
      isDesktop,
      onSendAttachment,
      onSendSticker,
      showSpeechEntry,
    ],
  );

  const cancelMobileSpeech = () => {
    speech.cancel();
    closeMobileSpeechSheet();
  };

  const returnMobileComposerToText = useCallback(
    (options?: { focusInput?: boolean }) => {
      if (isDesktop) {
        return;
      }

      setMobileComposerMode("text");
      if (options?.focusInput) {
        focusInput();
      }
    },
    [focusInput, isDesktop, setMobileComposerMode],
  );

  const collapseMobileTransientState = useEffectEvent(() => {
    if (isDesktop) {
      return;
    }

    mobileSpeechAutoCommitRef.current = false;
    if (speech.status !== "idle") {
      speech.cancel();
    }
    closeMobileSpeechSheet();
    closeMobileTransientSurfaces();
    setMobileMentionDismissed(true);
    blurActiveElement();
  });

  const commitSpeechInput = useEffectEvent(() => {
    const mergedValue = speech.commitToInput(value);
    onChange(mergedValue);
    setMobileComposerMode("text");
    focusInput();
  });

  const sendRecordedVoice = useEffectEvent(async () => {
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
  });

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

    if (mobileComposerMode === "speech") {
      setMobileComposerMode("text");
      focusInput();
      return;
    }

    setMobileComposerMode("speech");
  };

  useEffect(() => {
    if (showSpeechEntry) {
      return;
    }

    setMobileInputMode("text");
    closeMobileSpeechSheet();
  }, [closeMobileSpeechSheet, showSpeechEntry]);

  // 卸载时 revoke 还挂着的图片附件预览 URL。原写法只在每次 set 新 draft
  // 前 revoke 上一份，对「贴图但没发送就切会话/退页」这种场景，外层 key
  // 变化把整个 composer 一起 unmount 掉时，旧 draft.items[*].previewUrl
  // 永远不会被 revoke，多张图反复来回切聊天会渐进式堆积 blob:URL 引用。
  // 用 ref 拿最新 draft，避免每次 state 变都跑一次双重 revoke。
  const attachmentDraftCleanupRef = useRef<AttachmentDraft | null>(null);
  attachmentDraftCleanupRef.current = attachmentDraft;
  const desktopScreenshotDraftCleanupRef = useRef<ImageDraft | null>(null);
  desktopScreenshotDraftCleanupRef.current = desktopScreenshotDraft;
  useEffect(() => {
    return () => {
      releaseAttachmentDraft(attachmentDraftCleanupRef.current);
      releaseImageDraft(desktopScreenshotDraftCleanupRef.current);
    };
  }, []);

  useEffect(() => {
    if (isDesktop || typeof document === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        collapseMobileTransientState();
      }
    };
    const handlePageHide = () => {
      collapseMobileTransientState();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [collapseMobileTransientState, isDesktop]);

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
    closeMobileSpeechSheet,
    isDesktop,
    mobileSpeechPressing,
    mobileSpeechSheetOpen,
    speech.canCommit,
    speech.mode,
    speech.status,
    sendRecordedVoice,
  ]);

  useEffect(() => {
    if (isDesktop || mobileSpeechMode) {
      return;
    }

    const input = mobileTextareaRef.current;
    if (!(input instanceof HTMLTextAreaElement)) {
      return;
    }

    input.style.height = "0px";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 38), 108)}px`;
  }, [isDesktop, mobileSpeechMode, value]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }

    const input = desktopInputRef.current;
    if (!(input instanceof HTMLTextAreaElement)) {
      return;
    }

    const minHeight = desktopEditorExpanded ? 196 : 88;
    const maxHeight = desktopEditorExpanded ? 320 : 132;
    input.style.height = "0px";
    input.style.height = `${Math.min(
      Math.max(input.scrollHeight, minHeight),
      maxHeight,
    )}px`;
  }, [desktopEditorExpanded, isDesktop, value]);

  useEffect(() => {
    if (!isDesktop || !stickerPanelOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!desktopStickerRef.current?.contains(event.target as Node)) {
        setStickerPanelOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        // 走查电脑端群聊新会话 R114：上一次 R109 改成 capture phase +
        // stopImmediatePropagation 想阻断 workspace dismissSidePanel，但同款
        // 阻断把 StickerPanel 自己的内部 Esc handler（sticker-panel.tsx 1678-
        // 1708：清搜索 / 退 customManageMode）也一起干掉了 — 用户在 sticker
        // 搜索栏打了字按 Esc 期望"清空搜索"，结果整个 sticker panel 被关。
        //
        // 改回 bubble phase + 仅 preventDefault；workspace dismissSidePanel
        // race 通过下方 R109b sticker panel 根元素挂 role="dialog" 解决（让
        // workspace dismiss microtask DOM 查询命中 sticker panel root 跳过
        // dismiss）。两条 bubble handler 按注册顺序触发：StickerPanel 内部
        // handler 注册先（child mount before parent commit），先 fire；如果
        // 它清搜索 / 退 manage 后 return 没继续关 panel，下方本 handler 才
        // setStickerPanelOpen(false)。
        event.preventDefault();
        setStickerPanelOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDesktop, stickerPanelOpen]);

  // 原生壳硬件 Back：移动端 sticker / plus 面板展开时按 BACK 应当先收起面
  // 板（returnMobileComposerToText 把模式切回 "text"），而不是直接
  // history.back 退出聊天页。mobile-speech-input-sheet 自带 BACK 拦截，
  // mobileMentionPickerSheet 也已经接过，这里只覆盖 sticker / plus。
  useEffect(() => {
    if (isDesktop || (!stickerPanelOpen && !plusPanelOpen)) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      returnMobileComposerToText({ focusInput: false });
      return true;
    });
    return unregister;
  }, [isDesktop, plusPanelOpen, returnMobileComposerToText, stickerPanelOpen]);

  useEffect(() => {
    if (!isDesktop || !nativeDesktopRecentStickers) {
      return;
    }

    let cancelled = false;

    const syncRecentStickers = async () => {
      const nextItems = await hydrateRecentStickersFromNative();
      if (cancelled) {
        return;
      }

      setRecentStickers((current) =>
        JSON.stringify(current) === JSON.stringify(nextItems)
          ? current
          : nextItems,
      );
    };

    const handleFocus = () => {
      void syncRecentStickers();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncRecentStickers();
    };
    // 走查 R1：原版 storage 监听对任何 OTHER tab 的 localStorage 写入都触发
    // syncRecentStickers → 拍 hydrateRecentStickersFromNative 的 Tauri invoke
    // IPC + JSON.parse + setState；composer 在每段单聊 / 群聊里都挂着，多 tab
    // 时主题切换 / 草稿落盘 / 已读标记等 OTHER tab 写 localStorage 都会无意义
    // 地把这条 IPC 打一遍。和 local-chat-message-actions / chat-message-list
    // 同款 STORAGE_KEY gate；event.key=null 是 Safari localStorage.clear()，
    // 仍按全量同步对待避免静默 stale。
    const handleStorageSync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== RECENT_STICKERS_STORAGE_KEY) {
        return;
      }
      void syncRecentStickers();
    };

    void syncRecentStickers();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorageSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorageSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isDesktop, nativeDesktopRecentStickers]);

  useEffect(() => {
    if (!isDesktop || !desktopPlusMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!desktopPlusRef.current?.contains(event.target as Node)) {
        setDesktopPlusMenuOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        // 走查电脑端群聊新会话 R109：和上方 sticker panel Esc handler 同款 ——
        // 原版只 preventDefault 不够，workspace 的 dismissSidePanel microtask
        // 只查 DOM role 不查 defaultPrevented，plus menu favorites picker 根
        // 元素也是裸 <div>，命中不到 → 群聊「聊天信息」侧栏开着时点 + 按钮
        // 打开 plus menu，按 Esc 同时关了 menu 和侧栏。capture-phase 注册 +
        // stopImmediatePropagation 阻断 workspace bubble handler。
        event.preventDefault();
        event.stopImmediatePropagation();
        setDesktopPlusMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
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

  // 走查 R70：和姊妹 chat-message-list R69 同款 —— favoritesQuery.data 进
  // deps 让 sticker/+ 面板的「收藏」视图开着时，每次 favorites refetch
  // （30s stale + focus + mutate setQueriesData）都拆 3 个 listener 重挂。
  // handlers 真正需要的是「事件触发时拿到 latest favoritesQuery.data」
  // 而不是「data 变化时重挂 listener」。ref 镜像 latest。
  const composerFavoritesDataRef = useRef(favoritesQuery.data);
  composerFavoritesDataRef.current = favoritesQuery.data;
  useEffect(() => {
    if (
      !isDesktop ||
      !desktopPlusMenuOpen ||
      desktopPlusMenuView !== "favorites"
    ) {
      return;
    }

    let cancelled = false;

    const syncDesktopFavoriteRecords = async () => {
      if (nativeDesktopFavorites) {
        await hydrateDesktopFavoritesFromNative();
      }

      if (cancelled) {
        return;
      }

      setDesktopFavoriteRecords((current) => {
        const nextRecords = mergeDesktopFavoriteRecords(
          composerFavoritesDataRef.current ?? [],
          readDesktopFavorites(),
        );
        // 跟 favorites-page 一致：focus/visibilitychange + storage 事件触发频繁，
        // JSON.stringify(700 项) 换成 sourceId+collectedAt 指纹。
        return computeDesktopFavoritesFingerprint(current) ===
          computeDesktopFavoritesFingerprint(nextRecords)
          ? current
          : nextRecords;
      });
    };

    const handleFocus = () => {
      void syncDesktopFavoriteRecords();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncDesktopFavoriteRecords();
    };
    // 走查 R1：composer 的「+ → 收藏」面板开着时 storage 监听也吃 OTHER tab
    // 任何 localStorage 写入，触发 hydrateDesktopFavoritesFromNative IPC +
    // readDesktopFavorites JSON.parse 整份收藏列表。和上方 recent stickers 同款
    // gate：只在 DESKTOP_FAVORITES_STORAGE_KEY 上同步；event.key=null（Safari
    // localStorage.clear()）仍全量同步避免静默 stale。
    const handleStorageSync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== DESKTOP_FAVORITES_STORAGE_KEY) {
        return;
      }
      void syncDesktopFavoriteRecords();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorageSync);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorageSync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    desktopPlusMenuOpen,
    desktopPlusMenuView,
    isDesktop,
    nativeDesktopFavorites,
  ]);

  // 走查 R1（新一轮）：这两条 useEffect 看起来是为了在 draft 变更或 unmount
  // 时 revoke blob URL，但 closure 捕获的是 OLD draft —— React 在切到 NEW 之前
  // 先跑 OLD cleanup → releaseAttachmentDraft(OLD) 会把 OLD draft 里所有 items
  // 的 previewUrl 全 revoke 一遍。
  //
  // 在「整 draft 替换」路径（applyImageDraftFiles / applyGenericFileDraft /
  // captureDesktopScreenshot / handleCancelAttachmentDraft 等）调用方已经手动
  // releaseAttachmentDraft(attachmentDraft) 再 set 新 draft，effect 这里再跑
  // 一遍只是双重 revoke（idempotent，无害）。
  //
  // 但「部分移除」路径——handleRemoveDraftImage 从 5 张里删第 3 张、
  // trimSentImageDraftItems 发出后保留未发的——只 revoke 移走的那一张，剩余
  // 的 items 仍要继续渲染。effect cleanup 拿 OLD draft（5 张）跑一次完整
  // release → 把还要继续显示的 #1/#2/#4/#5 也 revoke 掉，缩略图 src 变成无效
  // blob:URL，浏览器某些时机（滚出 viewport 再回 / 切窗口 / 点全屏预览）就
  // 加载失败白屏。
  //
  // 卸载场景由上面 853-862 那对 ref + `[]`-deps effect 兜底，per-state 清理
  // 由各调用方自己 explicit revoke 完成，这两条 deps effect 删掉。

  const handleCloseDesktopScreenshotEditor = useEffectEvent(() => {
    closeDesktopScreenshotEditor();
  });

  const handleCaptureDesktopScreenshot = useEffectEvent(() => {
    void captureDesktopScreenshot();
  });

  useEffect(() => {
    if (!isDesktop || !desktopScreenshotDraft) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || attachmentBusy) {
        return;
      }
      // 走查再走一轮 R4：截图编辑器选中文字标注后会在工具栏渲染 <input> 让
      // 用户输入标注文字（line 5298）。CJK 用户用 IME 拼"标记 biaoji"还在
      // 候选词阶段按 Esc 想退候选词 —— 本 window 级 handler 抢 Esc 走三层
      // fallback：shortcutHelp 开着先关 help / 否则有 selectedAnnotation
      // 就 deselect / 否则把整张截图编辑器关掉。第二条最阴：用户敲到一半
      // 的"标 / 标..."文字被吞，annotation 选中状态没了 input 也消失，用户
      // 看到的是"按 Esc 没退候选词倒把刚选好的文字标注弄丢了"；极端情况
      // 第三条 fallback 触发把整张截图扔掉。和姊妹 desktop-chat-history-
      // dialog R151 / desktop-notes-workspace R148 / desktop-chat-workspace
      // R148 同款修法 —— 先让 IME 消费 Esc，候选词退后用户再按一次才走
      // fallback 路径。
      if (event.isComposing) {
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

      handleCloseDesktopScreenshotEditor();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    attachmentBusy,
    desktopScreenshotDraft,
    desktopScreenshotShortcutHelpOpen,
    desktopScreenshotSelectedAnnotationId,
    handleCloseDesktopScreenshotEditor,
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
      handleCaptureDesktopScreenshot();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    attachmentBusy,
    desktopScreenshotDraft,
    handleCaptureDesktopScreenshot,
    isDesktop,
    onSendAttachment,
  ]);

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

  // 走查本会话 R1：原版两个分支都 setMobileMentionDismissed(false) — if 语句
  // 是死代码 / 注释也丢失。更严重的是：activeMention 是 useMemo 每次 keystroke
  // 都新建对象（findActiveMentionToken 返回新 object，deps 含 inputCursor +
  // value），所以"@ 上下文里再多打一个字"也算 ref change。结果：群聊 / 单聊
  // 移动端用户在 @ 候选浮层弹出后按 Android BACK / 点 backdrop 关掉它，
  // setMobileMentionDismissed(true) 那一帧确实关上了；下一个 keystroke 因为
  // activeMention 重算成新 object 又把 dismissed 拨回 false → 浮层立刻回弹。
  // 用户没法在同一个 @ 上下文里"先关掉浮层、继续敲字"。改成"按 @ 起点 dedup"——
  // 同一个 @ 上下文 (相同 activeMention.start) 内保留用户的 dismiss 意图；只
  // 有真的换 @ 上下文（start 变了 / @ 没了）才 reset，给新 @ fresh 显示机会。
  const lastMentionStartRef = useRef<number | null>(null);
  useEffect(() => {
    const nextStart = activeMention ? activeMention.start : null;
    if (lastMentionStartRef.current === nextStart) {
      return;
    }
    lastMentionStartRef.current = nextStart;
    setMobileMentionDismissed(false);
    // 走查电脑端群聊新会话 R108：和上方 mobileMentionDismissed 同口径 ——
    // 用户在桌面端按 Esc 把 picker 关掉后，下一次"换一个 @ 上下文"（光标走开
    // 重打 @ / 在另一个位置又 @）应当让 picker 重新可弹。共用同款"start 变化
    // 才 reset"逻辑，本 @ 上下文内多敲一个字不打扰用户的 dismiss 意图。
    setDesktopMentionDismissed(false);
  }, [activeMention]);

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
  }, [getActiveInput, isDesktop, pendingSelection, value]);

  const toggleStickerPanel = () => {
    if (!onSendSticker) {
      return;
    }

    if (!isDesktop) {
      if (mobileComposerMode === "sticker") {
        returnMobileComposerToText({ focusInput: true });
        return;
      }

      setMobileComposerMode("sticker");
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

    if (mobileComposerMode === "plus") {
      returnMobileComposerToText({ focusInput: true });
      return;
    }

    setMobileComposerMode("plus");
  };

  const closeDesktopPlusMenu = useCallback(() => {
    setDesktopPlusMenuOpen(false);
    setDesktopPlusMenuView("root");
  }, []);

  const toggleDesktopFavoritePicker = () => {
    if (desktopPlusMenuOpen && desktopPlusMenuView === "favorites") {
      closeDesktopPlusMenu();
      return;
    }

    setStickerPanelOpen(false);
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
    // sticker panel 不在 send 链路上 dim/禁用 sticker tile，连点同一个 sticker
    // 2 次会走 2 次 onSendSticker → 群里冒出 2 张一样的 sticker 消息（不同
    // id 不被 dedup）。同帧后续 click 走 sendBusyRef 早返。
    if (sendBusyRef.current) {
      return;
    }

    sendBusyRef.current = true;
    setAttachmentError(null);
    // parent onSendSticker 走 sendStickerMessage → 在 resolveTargetCharacterId
    // 拿不到 char id（角色被删 / participants 还没回，conversationId 也不是
    // direct_ 前缀）会 throw；caller 是 handleStickerPanelSelect 里
    // void handleSendSticker(...) 形态 → 漏 catch 直接落 unhandledrejection。
    // 和 handleSendAttachment 的 try/catch + setAttachmentError 对齐。
    try {
      await onSendSticker(sticker);
    } catch (stickerError) {
      setAttachmentError(
        stickerError instanceof Error
          ? stickerError.message
          : t(msg`表情发送失败，请稍后再试。`),
      );
      return;
    } finally {
      sendBusyRef.current = false;
    }
    setRecentStickers(
      pushRecentSticker({
        sourceType: sticker.sourceType,
        packId: sticker.packId,
        stickerId: sticker.stickerId,
      }),
    );
    if (!isDesktop) {
      returnMobileComposerToText();
    }
  };

  const handleStickerPanelSelect = (sticker: StickerAttachment) => {
    if (sticker.sourceType === "builtin" && sticker.label) {
      // 走查 R1：builtin sticker（自带表情如 [微笑]）走的是 insertTextAtCursor
      // 文本插入路径，不经过 onSendSticker mutation，原版没有任何同步锁。同帧
      // 双击同一个 tile：insertTextAtCursor 跑 2 次 → 输入框显示「[微笑][微笑]」；
      // pushRecentSticker 也跑 2 次 → localStorage 写 2 次同一份 recent 列表
      // （第二次有 dedup 不会多塞但仍是无效 IO）。复用 sendBusyRef，让 builtin
      // 路径和非 builtin 共享同一把同帧锁；handleSendSticker 已经按 sendBusyRef
      // 走，这里只在 builtin 分支额外兜一帧。
      if (sendBusyRef.current) {
        return;
      }
      sendBusyRef.current = true;
      insertTextAtCursor(`[${sticker.label}]`);
      setRecentStickers(
        pushRecentSticker({
          sourceType: sticker.sourceType,
          packId: sticker.packId,
          stickerId: sticker.stickerId,
        }),
      );
      if (isDesktop) {
        setStickerPanelOpen(false);
        focusInput();
      } else {
        returnMobileComposerToText({ focusInput: true });
      }
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          sendBusyRef.current = false;
        });
      } else {
        sendBusyRef.current = false;
      }
      return;
    }

    void handleSendSticker(sticker);
  };

  // 走查 R2：pickAlbum / pickCamera / pickFile 三个 + 面板入口都只看 React state
  // `attachmentBusy` 兜双触发——但 attachmentBusy 在 picker 阶段 (打开系统 file
  // dialog / iOS PHPicker / Android DocumentsContract) 根本没置 true（true 只
  // 出现在选完图开始 upload 之后），所以即使非同帧的快速二连点也会让两次
  // pickXxx 全跑到 `albumInputRef.current?.click()` / `void pickXxxWithNativeShell()`：
  // · Web: HTMLInputElement.click() 触发系统文件对话框两次堆叠，第二次会让第
  //   一次的 dialog 重画或被 OS 视为新的并发请求，部分 Chromium 版本直接刷掉
  //   pending selection；playwright 实测同帧双击 input.click() 被调 2 次。
  // · 原生壳 (iOS PHPicker / Android intent)：pickImagesWithNativeShell 没有
  //   去重，第二次 invoke 让原生层弹两次 picker 堆叠，第一次的 result Promise
  //   被第二次的 PHPicker dismiss 当 cancel 解决 → assets=[] → 用户体感"选了
  //   没反应"。
  // 加一把同帧 raf 守，第一次成功后立刻置 true，下一帧自然释放让 retry/cancel
  // 路径还能正常工作。各 picker 共享同一把锁——同一时刻 UI 只能开一个原生
  // picker，逻辑上等价。
  const pickerOpeningRef = useRef(false);
  const acquirePickerLock = () => {
    if (pickerOpeningRef.current) {
      return false;
    }
    pickerOpeningRef.current = true;
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        pickerOpeningRef.current = false;
      });
    } else {
      pickerOpeningRef.current = false;
    }
    return true;
  };

  const pickAlbum = () => {
    if (attachmentBusy || !acquirePickerLock()) {
      return;
    }

    setAttachmentError(null);
    setMobilePlusNotice(null);
    if (!isDesktop) {
      returnMobileComposerToText();
    }
    if (nativeMobileShellSupported) {
      void pickAlbumWithNativeShell();
      return;
    }
    albumInputRef.current?.click();
  };

  const pickCamera = () => {
    if (attachmentBusy || !acquirePickerLock()) {
      return;
    }

    setAttachmentError(null);
    setMobilePlusNotice(null);
    if (!isDesktop) {
      returnMobileComposerToText();
    }
    if (nativeMobileShellSupported) {
      void pickCameraWithNativeShell();
      return;
    }
    cameraInputRef.current?.click();
  };

  const pickCameraWithNativeShell = useEffectEvent(async () => {
    const result = await captureImageWithNativeShell();
    if (!result.asset) {
      if (result.error) {
        setMobilePlusNotice(
          resolveNativeCameraCaptureNotice(result.error, {
            nativeBridgeAvailable: nativeMobileShellSupported,
            onOpenSettings: () => {
              void openAppSettings();
            },
            onPickAlbum: pickAlbum,
            onRetry: pickCamera,
            secondaryActionLabel: errorActionLabel ?? undefined,
            onSecondaryAction: onErrorAction ?? undefined,
          }),
        );
      }
      return;
    }

    try {
      const file = await readNativeBridgeImageAssetFile(result.asset, 0);
      await applyImageDraftFiles([file]);
    } catch (fileError) {
      setAttachmentError(
        fileError instanceof Error
          ? fileError.message
          : t(msg`读取图片失败，请换一张再试。`),
      );
    }
  });

  const pickAlbumWithNativeShell = useEffectEvent(async () => {
    // 把 MAX_ALBUM_IMAGE_COUNT 透给原生层：PHPicker UI 直接禁掉第 10 张的勾选，
    // 而不是让用户能勾 N 张然后 Swift 全部 HEIC→JPEG 转码写 tmp 再被 slice(0, 9)
    // 丢掉 N-9 张副本，导致 tmp 暴涨。Swift 端 limit 缺失会兜底 9，但显式传更稳。
    const assets = await pickImagesWithNativeShell(true, {
      limit: MAX_ALBUM_IMAGE_COUNT,
    });
    if (!assets.length) {
      return;
    }

    try {
      const files = await Promise.all(
        assets
          .slice(0, MAX_ALBUM_IMAGE_COUNT)
          .map((asset, index) => readNativeBridgeImageAssetFile(asset, index)),
      );
      await applyImageDraftFiles(files);
    } catch (fileError) {
      setAttachmentError(
        fileError instanceof Error
          ? fileError.message
          : t(msg`读取图片失败，请换一张再试。`),
      );
    }
  });

  const pickFile = () => {
    if (attachmentBusy || !acquirePickerLock()) {
      return;
    }

    setAttachmentError(null);
    setMobilePlusNotice(null);
    if (!isDesktop) {
      returnMobileComposerToText();
    }
    if (nativeMobileShellSupported) {
      void pickFileWithNativeShellAsDraft();
      return;
    }
    fileInputRef.current?.click();
  };

  const pickFileWithNativeShellAsDraft = useEffectEvent(async () => {
    const result = await pickFileWithNativeShell();
    if (!result.asset) {
      if (result.error) {
        setAttachmentError(null);
        setMobilePlusNotice(
          resolveNativeFilePickNotice(result.error, {
            onRetry: pickFile,
            secondaryActionLabel: errorActionLabel ?? undefined,
            onSecondaryAction: onErrorAction ?? undefined,
          }),
        );
      }
      return;
    }

    try {
      const file = await readNativeBridgeFileAsset(result.asset, {
        fallbackBaseName: "file",
        fallbackMimeType: "application/octet-stream",
      });
      applyGenericFileDraft(file);
    } catch (fileError) {
      setAttachmentError(
        fileError instanceof Error
          ? fileError.message
          : t(msg`读取文件失败，请重新选择。`),
      );
    }
  });

  // 走查新一轮 R6：captureDesktopScreenshot 兜底走 attachmentBusy React state
  // 「相机」相邻入口（toolbar 截图按钮 + Ctrl/⌘+Shift+S 全局快捷）+ 同帧
  // <16ms double-click，两次 invoke 都看到 attachmentBusy=false 进入 →
  // navigator.mediaDevices.getDisplayMedia 弹出系统屏幕选择器 2 次堆叠（macOS
  // / Windows / Tauri 都是 OS-level prompt，用户得分别在 2 个 dialog 上点取消，
  // 取消第一个后第二个还停留）。叠 sync ref 锁挡掉同帧后续 invoke，finally
  // 解锁（stream cleanup 自带 finally，复用同一 try/finally）。
  const screenshotCaptureBusyRef = useRef(false);
  const captureDesktopScreenshot = useCallback(async () => {
    if (!isDesktop || !onSendAttachment || attachmentBusy) {
      return;
    }
    if (screenshotCaptureBusyRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      setAttachmentError(
        t(msg`当前浏览器不支持桌面截图，请改用图片或文件发送。`),
      );
      return;
    }

    screenshotCaptureBusyRef.current = true;
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
        throw new Error(t(msg`没有拿到可用的屏幕画面。`));
      }

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      await waitForCaptureVideo(video);

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        throw new Error(t(msg`截图尺寸异常，请重试。`));
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error(t(msg`截图画布初始化失败。`));
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
          : t(msg`截图失败，请稍后再试。`),
      );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      screenshotCaptureBusyRef.current = false;
    }
  }, [
    attachmentBusy,
    attachmentDraft,
    closeDesktopPlusMenu,
    desktopScreenshotDraft,
    isDesktop,
    onSendAttachment,
    // 截图失败 fallback 文案 t(msg`截图失败，请稍后再试。`) 漏 dep：locale
    // 切换后这条 callback 用的是上次 render 的 t，弹出来是旧语言的"截图失败"。
    t,
  ]);

  const activateMobileSpeechFallback = () => {
    if (isDesktop || !showSpeechEntry) {
      return;
    }

    setMobileComposerMode("speech");
  };

  const handleUnavailableFallback = (
    action: "voice-message" | "camera" | "album",
  ) => {
    if (action === "voice-message") {
      activateMobileSpeechFallback();
      return;
    }

    returnMobileComposerToText();
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

      returnMobileComposerToText();
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
    const allFiles = [...(fileList ?? [])];
    const files = allFiles.slice(0, MAX_ALBUM_IMAGE_COUNT);
    if (!files.length) {
      return;
    }

    // 走查第二批 R1：iOS/Android 走原生 picker 时 limit 已经在 PHPicker UI 层兜住
    // （line 1518-1522），但 Web 浏览器 input[type=file] multiple 和拖拽/粘贴
    // 路径都直接 slice(0, 9) 静默丢弃 — 用户选 12 张以为全部进来，发出去只看
    // 到 9 张，会以为 app 漏发或后台吃了。给用户一个明确截断提示。
    if (allFiles.length > MAX_ALBUM_IMAGE_COUNT) {
      setAttachmentError(
        t(
          msg`一次最多发送 ${MAX_ALBUM_IMAGE_COUNT} 张图片，已为您保留前 ${MAX_ALBUM_IMAGE_COUNT} 张。`,
        ),
      );
    }

    await applyImageDraftFiles(files);
  };

  const applyImageDraftFiles = async (files: File[]) => {
    // Promise.all 在第一张图 reject 时就抛，已经 resolve 的若干张 ImageDraft
    // 里的 blob: previewUrl 拿不到引用也 revoke 不掉 —— 用户从相册选 9 张里
    // 第 5 张坏（readImageDimensions 解码失败）就会泄漏前 4 张的 blob。改成
    // allSettled 把成功的拿出来；失败时把已 resolve 的 previewUrl 显式释放。
    const results = await Promise.allSettled(
      files.map((file) => createImageDraft(file)),
    );
    const drafts: ImageDraft[] = [];
    let firstError: unknown = null;
    for (const result of results) {
      if (result.status === "fulfilled") {
        drafts.push(result.value);
      } else if (!firstError) {
        firstError = result.reason;
      }
    }
    if (firstError) {
      for (const draft of drafts) {
        URL.revokeObjectURL(draft.previewUrl);
      }
      // 必须关掉 + 面板，否则 mobileComposerStatus 在 plusPanelOpen 时 return
      // null，attachmentError 永远不会被 status rail 显示出来 —— 用户从相册
      // 选了几张图，其中有损坏的，看上去就是"啥也没发生"。
      setPlusPanelOpen(false);
      setDesktopPlusMenuOpen(false);
      setAttachmentError(
        firstError instanceof Error
          ? firstError.message
          : t(msg`读取图片失败，请换一张再试。`),
      );
      return;
    }
    releaseAttachmentDraft(attachmentDraft);
    setAttachmentError(null);
    setMobilePlusNotice(null);
    setPlusPanelOpen(false);
    setDesktopPlusMenuOpen(false);
    setAttachmentDraft({
      kind: "images",
      items: drafts,
    });
  };

  const handleGenericFileSelection = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) {
      return;
    }

    applyGenericFileDraft(file);
  };

  const applyGenericFileDraft = (file: File) => {
    // 走查第二批 R1：服务端 chat-attachments Multer 上限是 32MB（chat.controller.ts:248
    // CHAT_ATTACHMENT_UPLOAD_LIMIT_BYTES）。原本前端不校验，用户拖一个 100MB 视频
    // 上来，applyGenericFileDraft 直接 setAttachmentDraft 入草稿；点发送后 fetch
    // 把 100MB body upload，公网隧道几十秒拉满才被 server Multer 拒成 413/500，
    // UI 一直显示 spinner 体验极差。前端就地按 server limit 卡，提示中文。
    if (file.size > CHAT_ATTACHMENT_UPLOAD_LIMIT_BYTES) {
      releaseAttachmentDraft(attachmentDraft);
      setAttachmentDraft(null);
      setMobilePlusNotice(null);
      setPlusPanelOpen(false);
      setDesktopPlusMenuOpen(false);
      setAttachmentError(
        t(
          msg`文件大小不能超过 ${Math.round(CHAT_ATTACHMENT_UPLOAD_LIMIT_BYTES / 1024 / 1024)} MB，请压缩后再发送。`,
        ),
      );
      return;
    }

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
    event: ClipboardEvent<HTMLTextAreaElement>,
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

    // R15：和 handleImageSelection (line 1849) 同款问题——所有 image 粘贴 / 拖入
    // 路径在 imageFiles.length > MAX_ALBUM_IMAGE_COUNT (10) 时一律静默 slice(0, 10)，
    // 用户复制 12 张以为全发了、发完才发现只到了 10 张。给一个明确截断 notice。
    const truncatedImageCount = Math.max(
      0,
      imageFiles.length - MAX_ALBUM_IMAGE_COUNT,
    );

    if (imageFiles.length === pastedFiles.length) {
      await applyImageDraftFiles(imageFiles.slice(0, MAX_ALBUM_IMAGE_COUNT));
      if (truncatedImageCount > 0) {
        setAttachmentError(
          t(
            msg`一次最多发送 ${MAX_ALBUM_IMAGE_COUNT} 张图片，已为您保留前 ${MAX_ALBUM_IMAGE_COUNT} 张。`,
          ),
        );
      }
      return;
    }

    // R14：原版混合粘贴（图 + 非图）一律走 `applyGenericFileDraft(pastedFiles[0])`，
    // pastedFiles[0] 是什么类型就发什么类型，其余文件**静默丢弃**且无 UI 提示。
    // 用户从 Finder/Explorer 同时复制 1 图 + 1 pdf 粘贴进 composer，可能只发出
    // 图片（pdf 没了），也可能只发出 pdf（图片没了），取决于剪贴板里第一项是什么。
    // 用户没看到通知，发完才发现"我刚才复制的两个都不见一个"。chat 协议这一端
    // 确实是"1 个相册图 OR 1 个文件"二选一，但至少要明确告诉用户做了取舍。
    // 策略：有图片就优先发图相册（多数粘贴场景里图是主体），同时给出 notice
    // 说明被取舍掉的非图文件需要再单独粘一次；纯文件场景照旧只发第一个。
    if (imageFiles.length > 0) {
      const skippedNonImageCount = pastedFiles.length - imageFiles.length;
      await applyImageDraftFiles(imageFiles.slice(0, MAX_ALBUM_IMAGE_COUNT));
      setAttachmentError(
        truncatedImageCount > 0
          ? t(
              msg`粘贴里包含 ${skippedNonImageCount} 个非图片文件、${truncatedImageCount} 张超额图片，已只放入前 ${MAX_ALBUM_IMAGE_COUNT} 张图片。`,
            )
          : t(
              msg`粘贴里包含 ${skippedNonImageCount} 个非图片文件，已只放入图片；其它文件请再单独粘贴一次。`,
            ),
      );
      return;
    }

    applyGenericFileDraft(pastedFiles[0]);
    if (pastedFiles.length > 1) {
      setAttachmentError(
        t(
          msg`一次只能发送一个文件，已放入第一个；剩余 ${pastedFiles.length - 1} 个请再单独粘贴一次。`,
        ),
      );
    }
  };

  const handleDesktopDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!isDesktop || !onSendAttachment || attachmentBusy) {
      return;
    }

    // 浏览器安全：dragenter/dragover 期间 DataTransfer.files 是空、
    // items[i].getAsFile() 返回 null，只有 drop 才能读真文件。原写法用
    // extractClipboardFiles 检测会永远拿到 []，于是 drop overlay
    // 「松开鼠标发送图片或文件」从来没出现过——只看 kind/types 即可探到
    // 这是 file drag。
    if (!hasDraggableFiles(event.dataTransfer)) {
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

    if (!hasDraggableFiles(event.dataTransfer)) {
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
    // R15：handleDesktopPaste 同款——拖入超过 MAX_ALBUM_IMAGE_COUNT 张图也要给截断 notice。
    const truncatedImageCount = Math.max(
      0,
      imageFiles.length - MAX_ALBUM_IMAGE_COUNT,
    );

    if (imageFiles.length === droppedFiles.length) {
      await applyImageDraftFiles(imageFiles.slice(0, MAX_ALBUM_IMAGE_COUNT));
      if (truncatedImageCount > 0) {
        setAttachmentError(
          t(
            msg`一次最多发送 ${MAX_ALBUM_IMAGE_COUNT} 张图片，已为您保留前 ${MAX_ALBUM_IMAGE_COUNT} 张。`,
          ),
        );
      }
      return;
    }

    // R14：和 handleDesktopPaste 同款问题——混合 drop 一律 `applyGenericFileDraft
    // (droppedFiles[0])`，第一个之外的全部静默丢弃。从 Finder 拖 1 图 + 1 文档
    // 进来时用户看到的可能只是其中一个发出去了。同款修法。
    if (imageFiles.length > 0) {
      const skippedNonImageCount = droppedFiles.length - imageFiles.length;
      await applyImageDraftFiles(imageFiles.slice(0, MAX_ALBUM_IMAGE_COUNT));
      setAttachmentError(
        truncatedImageCount > 0
          ? t(
              msg`这次拖入包含 ${skippedNonImageCount} 个非图片文件、${truncatedImageCount} 张超额图片，已只放入前 ${MAX_ALBUM_IMAGE_COUNT} 张图片。`,
            )
          : t(
              msg`这次拖入包含 ${skippedNonImageCount} 个非图片文件，已只放入图片；其它文件请再单独拖一次。`,
            ),
      );
      return;
    }

    applyGenericFileDraft(droppedFiles[0]);
    if (droppedFiles.length > 1) {
      setAttachmentError(
        t(
          msg`一次只能发送一个文件，已放入第一个；剩余 ${droppedFiles.length - 1} 个请再单独拖一次。`,
        ),
      );
    }
  };

  const handleCancelAttachmentDraft = () => {
    releaseAttachmentDraft(attachmentDraft);
    setAttachmentDraft(null);
    setAttachmentError(null);
    setMobilePlusNotice(null);
  };

  const trimSentImageDraftItems = (count: number) => {
    if (count <= 0) {
      return;
    }

    setAttachmentDraft((currentDraft) => {
      if (!currentDraft || currentDraft.kind !== "images") {
        return currentDraft;
      }

      const sentItems = currentDraft.items.slice(0, count);
      sentItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      const remainingItems = currentDraft.items.slice(count);

      if (!remainingItems.length) {
        return null;
      }

      return {
        kind: "images",
        items: remainingItems,
      };
    });
  };

  const closeDesktopScreenshotEditor = useCallback(() => {
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
  }, [desktopScreenshotDraft]);

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
      requestedSelection &&
        next.some((annotation) => annotation.id === requestedSelection)
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
                text: current.mode === "text" ? t(msg`输入文字`) : undefined,
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

  // 走查新一轮 R5：截图编辑器 6 个 action（发送/复制/保存 × 原图/裁剪）兜底
  // 都靠 `attachmentBusy` React state，setAttachmentBusy(true) 要等 commit 才
  // 进 DOM。同帧 <16ms double-click 任一按钮，或键盘快捷（Enter / Cmd+S / Cmd+C
  // 等）同帧双触发：
  // · 发送路径：handleSendAttachment 内部 sendBusyRef 早返第二次，但
  //   buildDesktopScreenshotResult（canvas 渲染 + Blob 编码，~50ms CPU）已经
  //   白跑一遍
  // · 保存路径：saveLocalFile 走 Tauri 弹 2 个保存对话框堆叠（webview 阻塞
  //   型 dialog 被 spawn 两次）
  // · 复制路径：navigator.clipboard.write 跑两次，clipboard 内容被同一份图片
  //   覆盖 2 次，无副作用但浪费 CPU
  // ref 同步锁挡掉同帧 double-click；6 个 handler 共用同一 ref（同时只能跑
  // 一个截图 action，符合截图编辑器顺序操作语义）。
  const screenshotActionBusyRef = useRef(false);
  const handleSendDesktopScreenshot = async (mode: "original" | "cropped") => {
    if (!desktopScreenshotDraft || !onSendAttachment || attachmentBusy) {
      return;
    }
    if (screenshotActionBusyRef.current) {
      return;
    }
    screenshotActionBusyRef.current = true;

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
          : t(msg`截图处理失败，请稍后再试。`),
      );
    } finally {
      screenshotActionBusyRef.current = false;
    }
  };

  const handleCopyDesktopScreenshot = async (mode: "original" | "cropped") => {
    if (!desktopScreenshotDraft || attachmentBusy) {
      return;
    }
    if (screenshotActionBusyRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === "undefined"
    ) {
      setAttachmentError(t(msg`当前浏览器不支持复制截图到剪贴板。`));
      return;
    }

    screenshotActionBusyRef.current = true;
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
      setDesktopScreenshotNotice({
        message:
          mode === "cropped"
            ? t(msg`裁剪后的截图已复制。`)
            : t(msg`截图已复制到剪贴板。`),
      });
    } catch (copyError) {
      setDesktopScreenshotNotice(null);
      setAttachmentError(
        copyError instanceof Error
          ? copyError.message
          : t(msg`复制截图失败，请稍后再试。`),
      );
    } finally {
      screenshotActionBusyRef.current = false;
    }
  };

  const handleSaveDesktopScreenshot = async (mode: "original" | "cropped") => {
    if (!desktopScreenshotDraft || attachmentBusy) {
      return;
    }
    if (screenshotActionBusyRef.current) {
      return;
    }
    screenshotActionBusyRef.current = true;

    setAttachmentBusy(true);
    setAttachmentError(null);

    try {
      const imagePayload = await buildDesktopScreenshotResult(mode);
      if (!imagePayload) {
        return;
      }

      const result = await saveLocalFile({
        blob: imagePayload.file,
        fileName: imagePayload.fileName,
        dialogTitle:
          mode === "cropped" ? t(msg`保存裁剪截图`) : t(msg`保存截图`),
        kindLabel: mode === "cropped" ? t(msg`裁剪截图`) : t(msg`截图`),
      });

      if (result.status === "cancelled") {
        return;
      }

      if (result.status === "failed") {
        setDesktopScreenshotNotice(null);
        setAttachmentError(result.message);
        return;
      }

      const canRevealSavedFile =
        result.status === "saved" && Boolean(result.savedPath?.trim());
      const savedPath = canRevealSavedFile ? result.savedPath!.trim() : null;

      setDesktopScreenshotNotice({
        message: result.message,
        actionLabel: canRevealSavedFile ? t(msg`打开位置`) : undefined,
        onAction: savedPath
          ? () => {
              void revealSavedFile(savedPath).then((revealed) => {
                setDesktopScreenshotNotice({
                  message: revealed
                    ? mode === "cropped"
                      ? t(msg`已打开裁剪截图所在位置。`)
                      : t(msg`已打开截图所在位置。`)
                    : t(msg`打开所在位置失败，请稍后再试。`),
                });
              });
            }
          : undefined,
      });
    } catch (saveError) {
      setDesktopScreenshotNotice(null);
      setAttachmentError(
        saveError instanceof Error
          ? saveError.message
          : t(msg`截图保存失败，请稍后再试。`),
      );
    } finally {
      setAttachmentBusy(false);
      screenshotActionBusyRef.current = false;
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
        (annotation) => annotation.id !== desktopScreenshotSelectedAnnotationId,
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
    mentionName?: string;
    subtitle?: string;
    avatar?: string | null;
  }) => {
    if (!activeMention) {
      return;
    }

    // 走查 R6：「mention-all」候选 name 走 t(msg`所有人`) → 用户语言不同会
    // 插出 `@Everyone` / `@전체` / `@全員`，但 api/src/modules/chat/chat-text.utils.ts
    // summarizeChatMentions 写死 `mentions.includes('@所有人')` 检测 @all——
    // 非中文用户点了「@所有人」候选，AI 那条群通话/通知里 hasMentionAll 永远
    // false，notifyOnAtAll 用户收不到 @all 提示。展示文案保留本地化，但实际
    // 插入到 message text 的协议 token 强制走 `@所有人`，与服务端契约对齐。
    //
    // 走查电脑端群聊 R3：同样的 client/server 协议契约——picker 展示给用户的
    // candidate.name 可能是用户本地 friend.remarkName（"小明"），但 server
    // 端 group-reply-planner aliases 只看 [member.memberName, character.name]，
    // 不知道 remark。如果原样按 name 插入 `@小明`，server isExplicitTarget=false
    // → 角色拿不到 mention 加权 → 不一定回复。优先 mentionName（调用方在
    // name ≠ 服务端可匹配名时显式提供，比如群成员的 in-group nickname），
    // 没提供再回退 name。和 mention-all 的"展示本地化、token 走协议"同思路。
    const insertedName =
      candidate.id === "mention-all"
        ? "所有人" // i18n-ignore-line: protocol marker, server matches literal Chinese text
        : (candidate.mentionName ?? candidate.name);
    const mentionText = `@${insertedName} `;
    const nextValue = `${value.slice(0, activeMention.start)}${mentionText}${value.slice(activeMention.end)}`;
    onChange(nextValue);
    setMentionActiveIndex(0);
    setMobileMentionDismissed(false);
    setPendingSelection(activeMention.start + mentionText.length);
  };

  const insertTextAtCursor = (snippet: string) => {
    const insertAt = Math.min(
      Math.max(inputCursor ?? value.length, 0),
      value.length,
    );
    const nextValue = `${value.slice(0, insertAt)}${snippet}${value.slice(insertAt)}`;
    onChange(nextValue);
    setPendingSelection(insertAt + snippet.length);
  };

  const handleDesktopInputKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    const commandKey = event.metaKey || event.ctrlKey;

    if (mentionPickerOpen && !desktopMentionDismissed) {
      // 走查 R150：mention picker 弹起的同时 IME 通常也在 composing — 用户
      // 在群聊里打"@张 zhang"还没敲空格 → 候选词窗口 + mention picker 两张
      // 选择面板都开着。原 block 抢 Enter / ArrowDown / ArrowUp / Esc 早于
      // L3075 的 isComposing 早返 → IME 用 Enter 提交候选词被 mention picker
      // 抢去 applyMentionCandidate（可能选了一个完全不相关的 focused 成员）；
      // 用 ↓↑ 在 IME 候选词翻页被 mention picker 抢去切换 focused 成员。
      // 整个 block 前置 isComposing 早返，让 IME 自己处理这些键；候选词
      // 提交 / 退出后用户再按一次才走 mention picker 路径。
      if (event.nativeEvent.isComposing) {
        return;
      }
      // 走查电脑端群聊新会话 R108：Esc 关 picker。原版没接 Esc → 直接透传到
      // workspace window keydown → dismissSidePanel 把背后「聊天信息」侧栏
      // 意外关掉。stopPropagation 阻断到 workspace；setDesktopMentionDismissed
      // 把 picker 收起；activeMention 上下文变化时 effect 会自动 reset，picker
      // 重新可弹。
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDesktopMentionDismissed(true);
        return;
      }

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

    if (desktopInputComposingRef.current || event.nativeEvent.isComposing) {
      return;
    }

    const shouldSend =
      event.key === "Enter" &&
      value.trim() &&
      (desktopEditorExpanded
        ? commandKey && !event.shiftKey && !event.altKey
        : sendMessageShortcut === "enter"
          ? !commandKey && !event.shiftKey && !event.altKey
          : commandKey && !event.shiftKey && !event.altKey);

    if (shouldSend) {
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
    if (sendBusyRef.current) {
      return false;
    }

    sendBusyRef.current = true;
    setAttachmentBusy(true);
    setAttachmentError(null);
    setMobilePlusNotice(null);

    try {
      const uploadReadyPayload =
        await prepareAttachmentPayloadForUpload(payload);
      await onSendAttachment(uploadReadyPayload);
      if (!isDesktop) {
        returnMobileComposerToText();
      } else {
        setPlusPanelOpen(false);
      }
      return true;
    } catch (attachmentActionError) {
      setAttachmentError(
        attachmentActionError instanceof Error
          ? attachmentActionError.message
          : t(msg`附件发送失败，请稍后再试。`),
      );
      return false;
    } finally {
      sendBusyRef.current = false;
      setAttachmentBusy(false);
    }
  };

  const handleSendDraftAttachment = async () => {
    if (!attachmentDraft || !onSendAttachment) {
      return;
    }
    if (sendBusyRef.current) {
      return;
    }

    const currentDraft = attachmentDraft;
    if (currentDraft.kind === "images") {
      sendBusyRef.current = true;
      setAttachmentBusy(true);
      setAttachmentError(null);
      let sentCount = 0;

      try {
        for (const item of currentDraft.items) {
          const uploadReadyPayload = await prepareAttachmentPayloadForUpload({
            type: "image",
            file: item.file,
            fileName: item.fileName,
            width: item.width,
            height: item.height,
          });
          await onSendAttachment(uploadReadyPayload);
          sentCount += 1;
        }

        if (!isDesktop) {
          returnMobileComposerToText();
        } else {
          setPlusPanelOpen(false);
        }
        handleCancelAttachmentDraft();
      } catch (attachmentActionError) {
        trimSentImageDraftItems(sentCount);
        setAttachmentError(
          attachmentActionError instanceof Error
            ? attachmentActionError.message
            : t(msg`图片发送失败，请稍后再试。`),
        );
      } finally {
        sendBusyRef.current = false;
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
    if (sendBusyRef.current) {
      return false;
    }

    sendBusyRef.current = true;
    setAttachmentBusy(true);
    setAttachmentError(null);
    setMobilePlusNotice(null);

    try {
      await onSendPresetText(normalized);
      if (!isDesktop) {
        returnMobileComposerToText();
      } else {
        setPlusPanelOpen(false);
      }
      return true;
    } catch (presetTextError) {
      setAttachmentError(
        presetTextError instanceof Error
          ? presetTextError.message
          : t(msg`发送失败，请稍后再试。`),
      );
      return false;
    } finally {
      sendBusyRef.current = false;
      setAttachmentBusy(false);
    }
  };

  const toggleDesktopEditorExpanded = () => {
    setDesktopEditorExpanded((current) => !current);
    setStickerPanelOpen(false);
    closeDesktopPlusMenu();
    focusInput();
  };

  const handleDesktopSpeechToggle = () => {
    if (speech.status === "listening") {
      speech.stop();
      return;
    }

    setStickerPanelOpen(false);
    closeDesktopPlusMenu();
    void speech.start();
  };

  const desktopComposerStatus = (() => {
    if (!isDesktop) {
      return null;
    }

    if (composerError) {
      return {
        tone: "danger" as const,
        label: composerError,
        actionLabel: errorActionLabel ?? undefined,
        onAction: onErrorAction ?? undefined,
      };
    }

    if (speech.status === "requesting-permission") {
      return {
        tone: "muted" as const,
        label: t(msg`正在请求麦克风权限...`),
        secondaryActionLabel: t(msg`取消`),
        onSecondaryAction: speech.cancel,
      };
    }

    if (speech.status === "listening") {
      return {
        tone: "success" as const,
        label: t(msg`正在听你说话，停止后会继续整理转写。`),
        primaryActionLabel: t(msg`停止`),
        onPrimaryAction: speech.stop,
        secondaryActionLabel: t(msg`取消`),
        onSecondaryAction: speech.cancel,
      };
    }

    if (speech.status === "processing") {
      return {
        tone: "muted" as const,
        label: t(msg`正在转写语音...`),
        secondaryActionLabel: t(msg`取消`),
        onSecondaryAction: speech.cancel,
      };
    }

    if (speech.status === "ready" && speechDisplayText) {
      return {
        tone: "success" as const,
        label: t(msg`识别完成：${speechDisplayText}`),
        primaryActionLabel: t(msg`插入输入框`),
        onPrimaryAction: commitSpeechInput,
        secondaryActionLabel: t(msg`取消`),
        onSecondaryAction: speech.cancel,
      };
    }

    return null;
  })();
  const mobileComposerStatus = (() => {
    if (isDesktop || plusPanelOpen) {
      return null;
    }

    if (composerError) {
      const permissionDeniedWithSettings =
        speech.permissionDenied && nativeMobileShellSupported;
      return {
        tone: "danger" as const,
        label: composerError,
        actionLabel: permissionDeniedWithSettings
          ? t(msg`去设置`)
          : (errorActionLabel ?? undefined),
        onAction: permissionDeniedWithSettings
          ? () => {
              void openAppSettings();
            }
          : (onErrorAction ?? undefined),
        secondaryActionLabel: permissionDeniedWithSettings
          ? (errorActionLabel ?? undefined)
          : undefined,
        onSecondaryAction: permissionDeniedWithSettings
          ? (onErrorAction ?? undefined)
          : undefined,
      };
    }

    if (
      speech.mode !== "voice" &&
      speech.status === "ready" &&
      speechDisplayText
    ) {
      return {
        tone: "success" as const,
        label: t(msg`识别完成：${speechDisplayText}`),
        actionLabel: t(msg`插入`),
        onAction: commitSpeechInput,
      };
    }

    if (mobilePlusNotice) {
      return {
        tone: "info" as const,
        label: mobilePlusNotice.message,
        actionLabel: mobilePlusNotice.actionLabel,
        onAction: mobilePlusNotice.onAction,
        secondaryActionLabel: mobilePlusNotice.secondaryActionLabel,
        onSecondaryAction: mobilePlusNotice.onSecondaryAction,
      };
    }

    if (composerPending) {
      return {
        tone: "muted" as const,
        label: t(msg`正在发送...`),
      };
    }

    if (speechDisabledReason) {
      return {
        tone: "muted" as const,
        label: speechDisabledReason,
      };
    }

    return null;
  })();

  return (
    <>
      <div
        className={
          isDesktop
            ? "relative isolate z-30 border-t border-black/6 bg-[#f4ede0] px-3.5 py-3"
            : "border-t border-black/6 bg-[#f8f5ec] px-2 pb-2 pt-1"
        }
        // 走查 R74：原版每次 render new 一个 {paddingBottom:...} 对象。
        // composer 在用户每个 keystroke 都 re-render（value state 变），
        // 桌面端 keyboardOpen/Inset 永远稳定 → paddingBottom 字符串恒为
        // "0.75rem" 但对象引用换新，给 React 触发一次 style DOM 重设。
        // memo 到真正会变的三个值。
        style={composerOuterStyle}
        onDragEnter={handleDesktopDragEnter}
        onDragOver={handleDesktopDragOver}
        onDragLeave={handleDesktopDragLeave}
        onDrop={(event) => {
          void handleDesktopDrop(event);
        }}
      >
        {isDesktop && desktopDropActive ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[16px] border border-dashed border-[#f59e0b]/35 bg-[rgba(250,245,237,0.96)] text-sm font-medium text-[#b45309]">
            {t(msg`松开鼠标发送图片或文件`)}
          </div>
        ) : null}
        {!isDesktop && attachmentDraft ? (
          <MobileChatAttachmentPreview
            kind={attachmentDraft.kind}
            fileName={
              attachmentDraft.kind === "images"
                ? // 走查 R1：`?? "image"` 只防 null/undefined 不防空串。createImageDraft
                  // 当前用 `file.name || "image"` 保护，但任何上游路径若以 fileName=""
                  // 进来（例如 native PHPicker 返回的临时 asset），preview header 会
                  // 显示空白。改成 `||` 让空串也命中 fallback，和 sticker label /
                  // conversation.title 那批 sentinel fallback 同款修法。
                  (attachmentDraft.items[0]?.fileName || "image")
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
            onSaveCropped={() => {
              void handleSaveDesktopScreenshot("cropped");
            }}
            onSaveOriginal={() => {
              void handleSaveDesktopScreenshot("original");
            }}
            onDeleteSelectedAnnotation={
              handleDeleteSelectedScreenshotAnnotation
            }
            onRedoAnnotation={handleRedoScreenshotAnnotation}
            onSelectAnnotation={handleSelectScreenshotAnnotation}
            onSelectedTextChange={handleUpdateSelectedScreenshotText}
            onSelectedTextMove={handleDesktopScreenshotAnnotationMove}
            onSelectedTextMoveEnd={finishDesktopScreenshotAnnotationMove}
            onSelectedTextMoveStart={handleDesktopScreenshotAnnotationMoveStart}
            onSelectedTextResizeEnd={finishDesktopScreenshotAnnotationResize}
            onSelectedTextResizeMove={
              handleDesktopScreenshotAnnotationResizeMove
            }
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
        {isDesktop && mentionPickerOpen && !desktopMentionDismissed ? (
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
              mobileComposerMode === "text" &&
              Boolean(activeMention) &&
              !mobileMentionDismissed
            }
            candidates={filteredMentionCandidates}
            keyboardInset={keyboardInset}
            onClose={() => setMobileMentionDismissed(true)}
            onSelect={applyMentionCandidate}
          />
        ) : null}
        <div
          ref={isDesktop ? desktopStickerRef : undefined}
          className={`relative ${
            isDesktop
              ? "rounded-[16px] border border-black/8 bg-[color:var(--surface-card)] shadow-[0_10px_26px_rgba(180,130,20,0.06)]"
              : "space-y-1.5"
          }`}
        >
          {isDesktop ? (
            <>
              <div className="relative px-4 pb-2.5 pt-3.5">
                <button
                  type="button"
                  onClick={toggleDesktopEditorExpanded}
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition hover:bg-[#f4f4f4] hover:text-[color:var(--text-primary)]"
                  aria-label={
                    desktopEditorExpanded
                      ? t(msg`收起输入框`)
                      : t(msg`展开输入框`)
                  }
                  title={
                    desktopEditorExpanded
                      ? t(msg`收起输入框`)
                      : t(msg`展开输入框`)
                  }
                  // 走查电脑端单聊 R122：和姊妹 chat-header-actions R25 历史/详情
                  // toggle / message-list MessageTimestampDivider R32 / SelectionToggle
                  // R17 / composer-toolbar R34 一票 toggle button 同款修法 ——
                  // 桌面 composer 右上角"展开/收起输入框"chevron button 是个 toggle
                  // （desktopEditorExpanded true ↔ false，textarea rows 在 9 / 3
                  // 之间切换）。aria-label 已按 next-action 描述（"收起" ↔ "展开"），
                  // 但 SR 用户没法在不按下的情况下知道当前是不是已展开。挂
                  // aria-pressed = desktopEditorExpanded 提供即时的 audible toggle
                  // state，和 aria-label 互补，盲人用户拿一次 audible 反馈就知道
                  // "现在编辑框是大模式（9 行）还是小模式（3 行）"。
                  aria-pressed={desktopEditorExpanded}
                >
                  {desktopEditorExpanded ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronUp size={16} />
                  )}
                </button>
                <textarea
                  ref={desktopInputRef}
                  rows={desktopEditorExpanded ? 9 : 3}
                  // 走查 R23：和 chat-list-page b45435c2 / 姊妹 search input 已经
                  // 补过 aria-label 的同款 a11y 缺漏——桌面单聊主输入框没有 label
                  // 或 aria-label 关联，只有 placeholder。屏幕阅读器（NVDA / JAWS）
                  // 对 placeholder 的支持不一致，多数实现在用户开始打字后就不再
                  // 朗读，盲人用户 focus 进来根本不知道这是消息输入框。和 placeholder
                  // 同样用上层（conversation-thread-panel）传下来的"输入消息"/
                  // "直接说：明早8点提醒我吃药"（reminder 会话）文案即可。
                  aria-label={placeholder}
                  value={value}
                  onChange={(event) => {
                    onChange(event.target.value);
                    setInputCursor(
                      event.target.selectionStart ?? event.target.value.length,
                    );
                  }}
                  onCompositionStart={() => {
                    desktopInputComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    desktopInputComposingRef.current = false;
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
                  className={cn(
                    "min-h-[88px] w-full resize-none bg-transparent pr-9 text-[14px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]",
                    desktopEditorExpanded ? "max-h-[320px]" : "max-h-[132px]",
                  )}
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-b-[16px] border-t border-black/6 bg-[#fafafa] px-3.5 py-2.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <DesktopToolbarGroup>
                    <div className="relative">
                      <DesktopToolbarButton
                        label={t(msg`表情`)}
                        icon={<Smile size={16} />}
                        active={stickerPanelOpen}
                        onClick={toggleStickerPanel}
                      />
                      {stickerPanelOpen && onSendSticker ? (
                        <StickerPanel
                          baseUrl={baseUrl}
                          variant={variant}
                          activePackId={activeStickerPackId}
                          recentItems={recentStickers}
                          onClose={() => setStickerPanelOpen(false)}
                          onPackChange={setActiveStickerPackId}
                          onRecentItemsChange={(items) =>
                            setRecentStickers(items)
                          }
                          onError={setAttachmentError}
                          onSelect={handleStickerPanelSelect}
                        />
                      ) : null}
                    </div>
                  </DesktopToolbarGroup>
                  {onSendAttachment ? (
                    <DesktopToolbarGroup>
                      <div ref={desktopPlusRef} className="relative">
                        <DesktopToolbarButton
                          label={t(msg`收藏`)}
                          icon={<Star size={16} />}
                          active={
                            desktopPlusMenuOpen &&
                            desktopPlusMenuView === "favorites"
                          }
                          onClick={toggleDesktopFavoritePicker}
                        />
                        {desktopPlusMenuOpen &&
                        desktopPlusMenuView === "favorites" ? (
                          <div className="absolute bottom-[calc(100%+0.55rem)] left-0 z-50 w-80 overflow-hidden rounded-[12px] border border-black/8 bg-[color:var(--surface-card)] shadow-[0_12px_28px_rgba(180,130,20,0.14)]">
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
                      <DesktopToolbarButton
                        label={t(msg`图片`)}
                        icon={<ImageIcon size={16} />}
                        onClick={pickAlbum}
                      />
                      <DesktopToolbarButton
                        label={t(msg`文件`)}
                        icon={<FileText size={16} />}
                        onClick={pickFile}
                      />
                      <DesktopToolbarButton
                        label={t(msg`截图`)}
                        icon={<MonitorUp size={16} />}
                        title={t(msg`截图（Ctrl/⌘ + Shift + S）`)}
                        onClick={() => {
                          void captureDesktopScreenshot();
                        }}
                      />
                    </DesktopToolbarGroup>
                  ) : null}
                  {showSpeechEntry ? (
                    <DesktopToolbarGroup>
                      <DesktopToolbarButton
                        label={
                          speech.status === "listening"
                            ? t(msg`停止语音输入`)
                            : t(msg`语音输入`)
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
                        onClick={handleDesktopSpeechToggle}
                      />
                    </DesktopToolbarGroup>
                  ) : null}
                  {desktopComposerStatus ? (
                    <DesktopComposerStatusStrip
                      tone={desktopComposerStatus.tone}
                      label={desktopComposerStatus.label}
                      primaryActionLabel={
                        desktopComposerStatus.primaryActionLabel
                      }
                      onPrimaryAction={desktopComposerStatus.onPrimaryAction}
                      secondaryActionLabel={
                        desktopComposerStatus.secondaryActionLabel
                      }
                      onSecondaryAction={
                        desktopComposerStatus.onSecondaryAction
                      }
                    />
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2 border-l border-black/6 pl-3">
                  <div className="rounded-full bg-[color:var(--surface-card)] px-2.5 py-1 text-[11px] text-[color:var(--text-dim)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    {desktopEditorExpanded
                      ? t(msg`Ctrl/Cmd + Enter 发送`)
                      : sendMessageShortcut === "enter"
                        ? t(msg`Enter 发送`)
                        : t(msg`Ctrl/Cmd + Enter 发送`)}
                  </div>
                  <Button
                    onClick={onSubmit}
                    disabled={composerPending || !value.trim()}
                    className={cn(
                      "h-[34px] min-w-[76px] rounded-[8px] px-4 text-[13px] font-medium shadow-none disabled:opacity-100",
                      value.trim()
                        ? "bg-[#f59e0b] !text-[#3b2206] hover:bg-[#d97706]"
                        : "bg-[#e8e8e8] !text-[#70757a] hover:bg-[#e8e8e8]",
                    )}
                  >
                    {t(msg`发送`)}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-end gap-1.5 rounded-[20px] bg-[#f8f5ec]">
              {showSpeechEntry ? (
                <button
                  type="button"
                  onClick={toggleMobileInputMode}
                  disabled={
                    speech.status === "processing" || mobileSpeechPressing
                  }
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#606266] transition disabled:opacity-45",
                    mobileComposerMode === "speech"
                      ? "bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-[0_1px_2px_rgba(180,130,20,0.08)]"
                      : "bg-transparent active:bg-white/90",
                  )}
                  aria-label={
                    mobileComposerMode === "speech"
                      ? t(msg`切换到键盘输入`)
                      : t(msg`切换到语音输入`)
                  }
                >
                  {mobileComposerMode === "speech" ? (
                    <Keyboard size={18} />
                  ) : (
                    <Mic size={18} />
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
                    "flex min-h-[38px] min-w-0 flex-1 select-none items-center justify-center rounded-[20px] border border-black/8 bg-[color:var(--surface-card)] px-3.5 py-2 text-[13px] transition touch-none shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]",
                    mobileSpeechPressing
                      ? mobileSpeechCancelIntent
                        ? "border-[#ff4d4f]/45 bg-[#fff5f5] text-[#ff4d4f]"
                        : "border-[#f59e0b]/35 bg-[#fffdf2] text-[#f59e0b]"
                      : "text-[#7a7a7a]",
                    speech.status === "processing"
                      ? "border-black/12 bg-black/[0.03] text-[#8b8b8b]"
                      : "",
                  )}
                  aria-label={t(msg`按住说话，松开发送`)}
                >
                  {mobileSpeechPressing
                    ? mobileSpeechCancelIntent
                      ? t(msg`松开取消`)
                      : t(msg`松开发送`)
                    : speech.status === "processing"
                      ? t(msg`正在整理...`)
                      : t(msg`按住说话`)}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-end rounded-[20px] border border-black/8 bg-[color:var(--surface-card)] px-3 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
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
                      setMobileComposerMode("text");
                      syncInputCursor();
                    }}
                    onClick={syncInputCursor}
                    onKeyUp={syncInputCursor}
                    onSelect={syncInputCursor}
                    placeholder={placeholder}
                    // 走查移动端/群聊 R9：和桌面 R23 同款 a11y 修法——R23 当时把
                    // 移动 textarea 显式留给后续轮次（"移动 textarea (line 3542)
                    // 暂不动以保持 scope 最小"）。移动端 SR（iOS VoiceOver / Android
                    // TalkBack）对 placeholder 的支持也分裂：开始打字后多数实现就
                    // 不再朗读，盲人用户 focus 进来听到 "编辑栏 空" 不知道是消息
                    // 输入框。复用上层透下来的 placeholder 文案（"输入消息" 或
                    // reminder 会话的 "直接说：明早8点提醒我吃药"），群聊路径同样
                    // 受益（mentionCandidates 通过 chat-composer 入口共享同条 textarea）。
                    aria-label={placeholder}
                    // text-[16px]: iOS Safari < 16px 字号会在 focus 时强制
                    // viewport zoom-in（导致整页布局抖一下 + 退出 focus 后
                    // 不会自动 zoom 回去）。这里聊天 composer 是 web 移动端
                    // 用户最常 focus 的输入框，必须 ≥16px。
                    className="min-h-[34px] max-h-[96px] flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-[22px] text-[color:var(--text-primary)] outline-none placeholder:text-[#a3a3a3]"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={toggleStickerPanel}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#606266] transition",
                  mobileComposerMode === "sticker"
                    ? "bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-[0_1px_2px_rgba(180,130,20,0.08)]"
                    : "bg-transparent active:bg-white/90",
                )}
                aria-label={
                  mobileComposerMode === "sticker"
                    ? t(msg`切换到键盘输入`)
                    : t(msg`表情`)
                }
              >
                {mobileComposerMode === "sticker" ? (
                  <Keyboard size={18} />
                ) : (
                  <Smile size={18} />
                )}
              </button>

              {!mobileSpeechMode && value.trim() ? (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={composerPending}
                  className="flex h-9 min-w-[58px] shrink-0 items-center justify-center rounded-full bg-[#f59e0b] px-3 text-[13px] font-medium text-[#3b2206] shadow-[0_2px_6px_rgba(245,158,11,0.18)] disabled:opacity-45"
                >
                  {t(msg`发送`)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={togglePlusPanel}
                  disabled={!onSendAttachment || attachmentBusy}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#606266] transition disabled:opacity-45",
                    mobileComposerMode === "plus"
                      ? "bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-[0_1px_2px_rgba(180,130,20,0.08)]"
                      : "bg-transparent active:bg-white/90",
                  )}
                  aria-label={t(msg`更多功能`)}
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          )}

          {!isDesktop && stickerPanelOpen && onSendSticker ? (
            <StickerPanel
              baseUrl={baseUrl}
              variant={variant}
              activePackId={activeStickerPackId}
              recentItems={recentStickers}
              onClose={() => {
                returnMobileComposerToText({ focusInput: true });
              }}
              onPackChange={setActiveStickerPackId}
              onRecentItemsChange={(items) => setRecentStickers(items)}
              onError={setAttachmentError}
              onSelect={handleStickerPanelSelect}
            />
          ) : null}
        </div>
        {!isDesktop && onSendAttachment ? (
          <MobileChatPlusPanel
            open={plusPanelOpen}
            busy={attachmentBusy}
            onClose={() => {
              returnMobileComposerToText({ focusInput: true });
            }}
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
              setMobilePlusNotice({ message });
            }}
            onUnavailableFallback={handleUnavailableFallback}
            excludeCharacterIds={contactPickerExcludeIds}
          />
        ) : null}
        {!isDesktop && mobileComposerStatus ? (
          <MobileComposerStatusRail
            tone={mobileComposerStatus.tone}
            label={mobileComposerStatus.label}
            actionLabel={mobileComposerStatus.actionLabel}
            onAction={mobileComposerStatus.onAction}
            secondaryActionLabel={mobileComposerStatus.secondaryActionLabel}
            onSecondaryAction={mobileComposerStatus.onSecondaryAction}
          />
        ) : null}
        {composerPending && isDesktop ? (
          <div className="mt-1 flex items-center justify-end gap-1.5 px-0.5 pr-1 text-[10px] text-[color:var(--text-muted)]">
            <SendHorizontal size={10} />
            <span>{t(msg`正在发送...`)}</span>
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
  const t = useRuntimeTranslator();
  return (
    <div className="flex max-h-[360px] min-h-[220px] flex-col">
      <div className="relative border-b border-black/6 px-4 py-3 text-center">
        <button
          type="button"
          onClick={onBack}
          className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[12px] text-[color:var(--text-secondary)] transition hover:bg-[#f5f1e6] hover:text-[color:var(--text-primary)]"
          aria-label={t(msg`关闭发送收藏`)}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-medium text-[color:var(--text-primary)]">
          {t(msg`发送收藏`)}
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
                "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[#f5f1e6] disabled:cursor-not-allowed disabled:opacity-60",
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
                  <span className="rounded-full bg-[rgba(245,158,11,0.10)] px-2 py-0.5 text-[10px] text-[#f59e0b]">
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
          {t(msg`还没有可发送的收藏内容，先把消息或内容加入收藏。`)}
        </div>
      )}
    </div>
  );
}

function DesktopToolbarButton({
  icon,
  label,
  active,
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
  // R34：表情 / 收藏 / 语音输入 是 toggle button（点同按钮反转 panel 显示），
  // 图片 / 文件 / 截图 是 command button（点了立刻执行单次动作，不维持
  // pressed 状态）。和 desktop-notes-workspace R30 ToolbarButton 同款分流——
  // 调用方传了 active 视为 toggle 渲染 aria-pressed；没传走 undefined 不输出
  // aria-pressed 保留 command button 语义。
  const isToggle = active !== undefined;
  return (
    <button
      type="button"
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      aria-pressed={isToggle ? active : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-8.5 w-8.5 items-center justify-center rounded-[12px] border border-transparent transition disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-black/6 bg-[#f3f4f6] text-[color:var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          : "text-[color:var(--text-secondary)] hover:border-black/6 hover:bg-[#f5f1e6] hover:text-[color:var(--text-primary)]",
      )}
    >
      <span>{icon}</span>
    </button>
  );
}

function DesktopToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[12px] border border-black/6 bg-[color:var(--surface-card)] px-1 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
      {children}
    </div>
  );
}

function DesktopComposerStatusStrip({
  tone,
  label,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  tone: "muted" | "success" | "danger";
  label: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    // R39：和姊妹 R36/R37/R38 同款—— composer status strip 是用户在桌面单聊发送
    // 消息 / 附件 / 语音过程中显示的状态条（发送中 / 失败 / 已撤回 等），原版
    // 普通 div SR 完全感知不到。danger tone 用 role="alert"+assertive 抢断；
    // success/muted 走 status+polite。
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border px-2.5 py-1.5 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
        tone === "danger"
          ? "border-[#fecaca] bg-[#fff4f4] text-[#b42318]"
          : tone === "success"
            ? "border-[rgba(245,158,11,0.16)] bg-[#fffdf2] text-[#b45309]"
            : "border-black/6 bg-[color:var(--surface-card)] text-[color:var(--text-secondary)]",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {primaryActionLabel && onPrimaryAction ? (
        <button
          type="button"
          onClick={onPrimaryAction}
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 font-medium transition",
            tone === "danger"
              ? "bg-[color:var(--surface-card)] text-[#b42318] hover:bg-[#fffafa]"
              : "bg-[color:var(--surface-card)] text-[#b45309] hover:bg-[#f5f1e6]",
          )}
        >
          {primaryActionLabel}
        </button>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          className="shrink-0 rounded-full px-2 py-0.5 font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-card)]"
        >
          {secondaryActionLabel}
        </button>
      ) : null}
    </div>
  );
}

function MobileComposerStatusRail({
  tone,
  label,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: MobileComposerStatusState) {
  return (
    <div
      // 走查移动端单聊新一轮 R4：和姊妹桌面 DesktopComposerStatusStrip (R39)
      // 同款 a11y 修法 —— mobile composer status rail 是用户在移动端单聊发
      // 消息/附件/语音过程中显示的状态条（发送中/失败/已撤回/没网络/上传
      // 失败等），原版裸 <div> SR 完全感知不到，盲人用户敲完一条以为发出
      // 去了，实际 send 失败显示「发送失败」红条静静坐在 composer 上面。
      // danger tone → alert + assertive 抢断 SR；success/info/muted → status
      // + polite 不打断当前朗读。
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "mt-1.5 flex items-center justify-between gap-2 rounded-[12px] border px-2.5 py-1.5 text-[10px] leading-4 shadow-none",
        tone === "danger"
          ? "border-[#fecaca] bg-[#fff5f5] text-[#b42318]"
          : tone === "success"
            ? "border-[rgba(245,158,11,0.14)] bg-[#fffdf2] text-[#b45309]"
            : tone === "info"
              ? "border-[rgba(96,165,250,0.18)] bg-[#f7fbff] text-[#1d4ed8]"
              : "border-black/6 bg-[rgba(255,255,255,0.88)] text-[color:var(--text-muted)]",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {actionLabel && onAction ? (
        <div className="flex shrink-0 items-center gap-2">
          <InlineNoticeActionButton
            label={actionLabel}
            onClick={onAction}
            className={cn(
              "shrink-0 bg-[color:var(--surface-card)]",
              tone === "danger"
                ? "border-[#fecaca] text-[#b42318]"
                : tone === "success"
                  ? "border-[rgba(245,158,11,0.14)] text-[#b45309]"
                  : tone === "info"
                    ? "border-[#bfdbfe] text-[#1d4ed8]"
                    : "border-black/6 text-[color:var(--text-secondary)]",
            )}
          />
          {secondaryActionLabel && onSecondaryAction ? (
            <InlineNoticeActionButton
              label={secondaryActionLabel}
              onClick={onSecondaryAction}
              className="shrink-0 border-black/6 bg-[color:var(--surface-card)] text-[color:var(--text-secondary)]"
            />
          ) : null}
        </div>
      ) : secondaryActionLabel && onSecondaryAction ? (
        <InlineNoticeActionButton
          label={secondaryActionLabel}
          onClick={onSecondaryAction}
          className="shrink-0 border-black/6 bg-[color:var(--surface-card)] text-[color:var(--text-secondary)]"
        />
      ) : null}
    </div>
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
  const t = useRuntimeTranslator();
  return (
    <div className="mb-2.5 rounded-[12px] border border-[rgba(245,158,11,0.14)] bg-[#fffdf2] px-3.5 py-3">
      <div className="mb-2.5 text-[11px] font-medium text-[#b45309]">
        {t(msg`待发送附件`)}
      </div>
      {draft.kind === "images" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {draft.items.map((item, index) => (
              <div
                key={`${item.previewUrl}-${index}`}
                className="relative h-14 w-14 overflow-hidden rounded-[12px] border border-black/6 bg-[#f4f4f4]"
              >
                <img
                  src={item.previewUrl}
                  alt={item.fileName}
                  // 走查电脑端单聊 R87：DesktopAttachmentDraftBar 渲染 1-N 张
                  // 待发送图片缩略图，previewUrl 是 URL.createObjectURL 出来
                  // 的原图 blob —— 浏览器默认同步在主线程把原图 decode + 缩到
                  // 14×14 显示。yuanzui0728 在 desktop composer 一次 album 选
                  // 5-9 张相机原图（每张 3-5MB），整组 decode 的几十 ms 主线程
                  // 阻塞会让 composer 整栏弹出动画 / 按键输入掉帧。挂
                  // decoding="async"，浏览器走 off-thread decode；缩略图先空，
                  // decode 完淡入，主线程不抢。lazy 不挂——这些缩略图在
                  // composer 顶部一打开就全在视口内，lazy 反而触发额外的
                  // intersection observer。
                  decoding="async"
                  // 走查电脑端单聊 R104：和姊妹 R94 ImageMessage / R97 chat-files
                  // / R98 NoteCardMessage / R99 FeedPostCardMessage 同款。
                  // composer 顶部「待发送图片」缩略图栏紧贴 textarea，用户在
                  // 多选 5-9 张图后想点 textarea 调整草稿时，鼠标 mousedown 落
                  // 在缩略图上 → 浏览器默认 draggable=true → 拖出阈值距离触发
                  // HTML5 native drag (blob:URL.createObjectURL 出来的 blob URL)
                  // → drop 在隔壁 textarea 上时浏览器把 blob URL 当 text 插入
                  // 用户草稿（"blob:https://1gw06751dd053.vicp.fun/xxxxx-uuid"
                  // 一长串），消息发出去对方看到一段 blob URL 拼草稿正文。
                  // 同时 mousedown→drag start 后右上角 X (onRemoveImage) 的
                  // 点击判定也会被打断。
                  draggable={false}
                  className="h-full w-full object-cover"
                />
                {onRemoveImage ? (
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/70"
                    aria-label={t(msg`移除 ${item.fileName}`)}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-2.5 text-[12px] text-[color:var(--text-muted)]">
            {t(msg`已选择 ${draft.items.length} 张图片`)}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-[12px] border border-black/6 bg-[color:var(--surface-card)] px-3 py-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#f3f4f6] text-[color:var(--text-secondary)]">
            <FileText size={18} />
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

      <div className="mt-2.5 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={pending}
          className="h-8 rounded-[8px] px-3"
        >
          {t(msg`取消`)}
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onSend}
          disabled={pending}
          className="h-8 rounded-full bg-[#f59e0b] px-3 text-[#3b2206] hover:bg-[#d97706]"
        >
          {pending ? t(msg`正在发送...`) : t(msg`发送附件`)}
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
          ? "bg-[color:var(--surface-card)] text-[color:var(--text-primary)]"
          : "bg-white/8 text-white/78 hover:bg-white/12 hover:text-white",
      )}
    >
      <span>{label}</span>
      {shortcut ? (
        <span
          className={cn(
            "ml-1 rounded-full px-1.5 py-0.5 text-[10px]",
            active
              ? "bg-[#e5e7eb] text-[#374151]"
              : "bg-white/10 text-white/46",
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
  onSaveCropped,
  onSaveOriginal,
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
  notice: DesktopScreenshotNoticeState | null;
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
  onSaveCropped: () => void;
  onSaveOriginal: () => void;
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
  onSelectedTextResizeEnd: (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
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
  const t = useRuntimeTranslator();
  // R4 走查：截图编辑器是个全屏 modal（fixed inset-0 + backdrop + Esc 关），
  // 但 panel 既没挂 role="dialog" + aria-modal，也没把「截图预览」标题 /
  // 「拖拽框选裁剪范围…」描述用 aria-labelledby/aria-describedby 关联。
  // 桌面单聊点 composer 工具栏「截图」按钮就进这里，盲人屏幕阅读器只听到
  // 一串裸 button label 浮空，不知道是个对话框、不知道标题、不知道做什么。
  // 和 confirm-dialog / text-edit-dialog 系列 R2~R5 修过的 a11y 同款方向。
  const titleId = useId();
  const descId = useId();
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
  const screenshotShortcutHelpGroups = [
    {
      id: "draw",
      label: t(msg`绘制`),
      primary: "C / R / A / T",
      secondary: t(msg`颜色 1-4`),
    },
    {
      id: "history",
      label: t(msg`撤销与删除`),
      primary: "⌘/Ctrl + Z / Shift+Z / Y",
      secondary: "Delete / Esc",
    },
    {
      id: "view",
      label: t(msg`视图`),
      primary: t(msg`⌘/Ctrl + 滚轮 / 双击`),
      secondary: "Space / ?",
    },
    {
      id: "send",
      label: t(msg`发送`),
      primary: t(msg`Enter 发送`),
      secondary: t(msg`原图 ⌘/Ctrl + Enter`),
    },
  ] satisfies Array<{
    id: ScreenshotShortcutHelpGroupId;
    label: string;
    primary: string;
    secondary: string;
  }>;
  const activeAnnotationPalette =
    getScreenshotAnnotationPaletteEntry(annotationColor);
  const selectedTextAnnotationActive = Boolean(
    selectedAnnotationId &&
    annotations.some(
      (annotation) =>
        annotation.id === selectedAnnotationId && annotation.kind === "text",
    ),
  );
  const selectedTextAnnotation =
    selectedAnnotationId && selectedTextAnnotationActive
      ? (annotations.find(
          (annotation) =>
            annotation.id === selectedAnnotationId &&
            annotation.kind === "text",
        ) ?? null)
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

  const handlePreviewDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
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
      ? "border-[#b45309] bg-[rgba(245,158,11,0.12)] shadow-[0_0_0_1px_rgba(253,230,138,0.2),0_12px_28px_rgba(245,158,11,0.14)]"
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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex h-[min(86vh,960px)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/12 bg-[#1f1f1f] text-white shadow-[0_32px_80px_rgba(0,0,0,0.32)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div className="min-w-0">
            <div id={titleId} className="text-[16px] font-medium">
              {t(msg`截图预览`)}
            </div>
            <div id={descId} className="mt-1 text-[12px] text-white/58">
              {t(msg`拖拽框选裁剪范围，不框选时会按原图发送。`)}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label={t(msg`关闭截图预览`)}
            className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-white/12 bg-white/6 text-white transition hover:bg-white/10 disabled:opacity-45"
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
                  : t(msg`截图`)}
              </span>
              {cropPixelSize ? (
                <span className="rounded-full bg-[#153726] px-2.5 py-1 text-[#8ef0b2]">
                  {t(
                    msg`裁剪后 ${cropPixelSize.width} × ${cropPixelSize.height}`,
                  )}
                </span>
              ) : (
                <span className="rounded-full bg-white/8 px-2.5 py-1">
                  {t(msg`暂未裁剪`)}
                </span>
              )}
              <span className="rounded-full bg-white/8 px-2.5 py-1">
                {t(msg`标注 ${annotations.length} 条`)}
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
                  label={t(msg`裁剪`)}
                  active={tool === "crop"}
                  shortcut="C"
                  onClick={() => onToolChange("crop")}
                />
                <DesktopScreenshotToolButton
                  label={t(msg`矩形`)}
                  active={tool === "rect"}
                  shortcut="R"
                  onClick={() => onToolChange("rect")}
                />
                <DesktopScreenshotToolButton
                  label={t(msg`箭头`)}
                  active={tool === "arrow"}
                  shortcut="A"
                  onClick={() => onToolChange("arrow")}
                />
                <DesktopScreenshotToolButton
                  label={t(msg`文字`)}
                  active={tool === "text"}
                  shortcut="T"
                  onClick={() => onToolChange("text")}
                />
                {tool !== "crop" ? (
                  <div className="ml-1 flex items-center gap-2 rounded-full bg-white/6 px-2 py-1">
                    {SCREENSHOT_ANNOTATION_PALETTE.map((palette, index) => {
                      const paletteLabel =
                        palette.id === "amber"
                          ? t(msg`琥珀`)
                          : palette.id === "cyan"
                            ? t(msg`青蓝`)
                            : palette.id === "rose"
                              ? t(msg`玫红`)
                              : t(msg`青柠`);

                      return (
                        <button
                          key={palette.id}
                          type="button"
                          onClick={() => onAnnotationColorChange(palette.id)}
                          title={t(
                            msg`切换为${paletteLabel}标注 (${index + 1})`,
                          )}
                          className={cn(
                            "relative h-5 w-5 rounded-full border transition",
                            palette.id === annotationColor
                              ? "scale-110 border-white shadow-[0_0_0_2px_rgba(255,255,255,0.16)]"
                              : "border-white/20 hover:border-white/60",
                          )}
                          style={{ backgroundColor: palette.stroke }}
                          aria-label={t(msg`切换为${paletteLabel}标注`)}
                        >
                          <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#111827] px-1 text-[9px] font-medium text-white/85 shadow-[0_4px_10px_rgba(0,0,0,0.28)]">
                            {index + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {selectedTextAnnotationActive ? (
                  <input
                    ref={selectedTextInputRef}
                    type="text"
                    value={selectedTextValue}
                    onChange={(event) =>
                      onSelectedTextChange(event.target.value)
                    }
                    placeholder={t(msg`输入标注文字`)}
                    // 走查新一轮 R25：和姊妹截图编辑器 R18 dialog 语义 / 桌面单聊
                    // composer R23 同款 a11y 缺漏——截图标注 textbox 没挂 label
                    // 关联，只有 placeholder。SR focus 进来听到「编辑栏 输入
                    // 标注文字 空」（部分实现读 placeholder、部分不读）。补
                    // aria-label 跟选中的工具上下文（"文字" tool）对齐。
                    aria-label={t(msg`输入标注文字`)}
                    className="ml-2 h-9 min-w-[180px] rounded-[12px] border border-white/12 bg-white/8 px-3 text-[12px] text-white outline-none placeholder:text-white/28 focus:border-white/30"
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
                  className="rounded-[8px] border-white/12 bg-white/6 px-3 text-white hover:bg-white/10"
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
                  className="rounded-[8px] border-white/12 bg-white/6 px-3 text-white hover:bg-white/10"
                >
                  +
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => updatePreviewZoom(1)}
                  disabled={pending || previewZoom === 1}
                  className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  {t(msg`适应`)}
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
                  title={t(msg`撤销标注 (Cmd/Ctrl+Z)`)}
                  className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  {t(msg`撤销标注`)}
                  <span className="text-[10px] text-white/50">⌘/Ctrl+Z</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onRedoAnnotation}
                  disabled={pending || !canRedoAnnotations}
                  title={t(msg`重做标注 (Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y)`)}
                  className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  {t(msg`重做标注`)}
                  <span className="text-[10px] text-white/50">
                    ⌘/Ctrl+Shift+Z
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onDeleteSelectedAnnotation}
                  disabled={pending || !selectedAnnotationId}
                  title={t(msg`删除标注 (Delete / Backspace)`)}
                  className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  {t(msg`删除标注`)}
                  <span className="text-[10px] text-white/50">Del</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClearAnnotations}
                  disabled={pending || !annotations.length}
                  className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
                >
                  {t(msg`清空标注`)}
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
                  title={t(msg`查看截图快捷键 (?)`)}
                >
                  <span className="rounded-full border border-white/12 bg-white/6 px-1.5 py-0.5 text-[10px] leading-none text-white/72">
                    ?
                  </span>
                  <span>{t(msg`快捷键`)}</span>
                </button>
                {shortcutHelpVisible ? (
                  <div
                    className={cn(
                      "absolute -right-1 top-full z-30 mt-1.5 w-[288px] origin-top-right rounded-[16px] border border-white/12 bg-[#181818] p-2.5 text-[11px] text-white/72 shadow-[0_18px_40px_rgba(0,0,0,0.28)] transition duration-150 ease-out",
                      shortcutHelpEntered
                        ? "translate-y-0 opacity-100"
                        : "-translate-y-0.5 opacity-0",
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-[10px] text-white/44">
                      <span className="rounded-full border border-white/10 bg-white/6 px-1.5 py-0.5 leading-none text-white/62">
                        ?
                      </span>
                      <span>
                        {t(msg`按 ? 开关，点下面分组可高亮对应区域。`)}
                      </span>
                    </div>
                    <div className="grid gap-1.5">
                      {screenshotShortcutHelpGroups.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => triggerShortcutDemo(item.id)}
                          className={cn(
                            "flex items-start justify-between gap-2.5 rounded-[8px] border px-2.5 py-1.5 text-left transition",
                            shortcutDemoGroup === item.id
                              ? "border-[#b45309] bg-[rgba(245,158,11,0.14)] text-white"
                              : "border-transparent bg-white/[0.045] hover:border-white/8 hover:bg-white/[0.065]",
                          )}
                        >
                          <span className="min-w-[56px] pt-0.5 text-[10px] font-medium text-white/38">
                            {item.label}
                          </span>
                          <span className="text-right">
                            <span className="inline-flex rounded-[8px] border border-white/10 bg-white/8 px-2 py-1 text-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
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
              className="relative min-h-0 flex-1 overflow-auto rounded-[20px] border border-white/8 bg-[#111]"
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
                    // 走查再走一轮 R1：和姊妹 R87 DesktopAttachmentDraftBar 缩
                    // 略图 / R94 ImageMessage / R97 chat-files / R99 FeedPostCardMessage
                    // 一批已挂的同款 perf 修法。本 img 是桌面截图 / 单图编辑器
                    // dialog 的全屏预览，src 是 URL.createObjectURL 出来的原图
                    // blob — 截屏一张 1920×1080 / 2560×1440 屏幕 PNG 通常 3-8MB，
                    // 单图选自相册可达 8-12MB 原图。dialog mount 瞬间浏览器默认
                    // 在主线程同步把整张原图 decode 出像素 → 编辑器开屏淡入
                    // 动画 + 工具栏挂载 / shortcut hint 组件 mount 同帧被卡 80-200ms。
                    // decoding="async" 让浏览器走 off-thread decode，img 先空、
                    // decode 完淡入，dialog 打开动画不再被阻塞。
                    decoding="async"
                    draggable={false}
                    className={cn(
                      "block rounded-[16px] shadow-[0_24px_64px_rgba(0,0,0,0.32)]",
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
                        className="absolute border-2 border-[#f59e0b] bg-[rgba(245,158,11,0.12)] shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
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
                          className="absolute inset-2 cursor-move rounded-[12px] border border-white/14 bg-white/0 text-transparent"
                          aria-label={t(msg`移动裁剪区域`)}
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
                              "absolute border-2 border-white bg-[#f59e0b] shadow-[0_6px_14px_rgba(245,158,11,0.28)]",
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
                            aria-label={t(msg`调整裁剪区域`)}
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
                              ? "#f59e0b"
                              : activeAnnotationPalette.stroke,
                          backgroundColor:
                            selection?.mode === "crop"
                              ? "rgba(245, 158, 11,0.14)"
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
                          aria-label={t(msg`移动文字标注`)}
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
                            aria-label={t(msg`调整文字标注大小`)}
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
                        annotation.kind === "rect" ||
                        annotation.kind === "text" ? (
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
              // R38：和姊妹 R36/R37 同款—— desktop screenshot 编辑器顶部 notice
              // 用 setDesktopScreenshotNotice 状态控制（截断 / 失败 / 提示），
              // SR 完全感知不到。tone="info" 走 polite，等 SR 念完当前内容补一段。
              <InlineNotice
                role="status"
                aria-live="polite"
                className="flex items-center justify-between gap-3 border-white/10 bg-white/8 text-xs text-white"
                tone="info"
              >
                <span>{notice.message}</span>
                {notice.actionLabel && notice.onAction ? (
                  <InlineNoticeActionButton
                    label={notice.actionLabel}
                    onClick={notice.onAction}
                    className="border-white/14 bg-white/10 text-white"
                  />
                ) : null}
              </InlineNotice>
            ) : null}
            {error ? (
              // R38：screenshot 编辑器 error 是 tone="danger"，截图保存 / 上传 /
              // 编辑失败时 SR 必须立刻知道。assertive 抢断。
              <InlineNotice
                role="alert"
                aria-live="assertive"
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
                ? t(msg`重新拖拽可修改裁剪区域。`)
                : t(msg`拖拽图片区域即可创建裁剪选区。`)
              : tool === "rect"
                ? t(msg`拖拽即可添加高亮矩形框。`)
                : tool === "arrow"
                  ? t(msg`拖拽即可添加箭头标注。`)
                  : t(msg`拖拽框选文字区域，随后在工具栏输入内容。`)}
          </div>

          <div className="flex items-center gap-2">
            {crop ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onClearCrop}
                disabled={pending}
                className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
              >
                {t(msg`还原`)}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={onSaveOriginal}
              disabled={pending}
              className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
            >
              <Download size={14} />
              {t(msg`保存原图`)}
            </Button>
            {crop ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onSaveCropped}
                disabled={pending}
                className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
              >
                <Download size={14} />
                {t(msg`保存裁剪图`)}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={onCopyOriginal}
              disabled={pending}
              className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
            >
              {t(msg`复制原图`)}
            </Button>
            {crop ? (
              <Button
                type="button"
                variant="ghost"
                onClick={onCopyCropped}
                disabled={pending}
                className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
              >
                {t(msg`复制裁剪图`)}
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
                title={t(msg`关闭截图预览 (Esc)`)}
                className="rounded-[8px] border-white/12 bg-white/6 text-white hover:bg-white/10"
              >
                {t(msg`取消`)}
                <span className="text-[10px] text-white/50">Esc</span>
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onSendOriginal}
                disabled={pending}
                title={t(msg`按原图发送 (Cmd/Ctrl+Enter)`)}
                className="rounded-[8px] bg-[#2f855a] text-white hover:bg-[#276749]"
              >
                {pending ? t(msg`发送中...`) : t(msg`按原图发送`)}
                {pending ? null : (
                  <span className="text-[10px] text-white/70">
                    ⌘/Ctrl+Enter
                  </span>
                )}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onSendCropped}
                disabled={pending || !crop}
                title={t(msg`裁剪后发送 (Enter)`)}
                className="rounded-full bg-[#f59e0b] text-[#3b2206] hover:bg-[#d97706]"
              >
                <Scissors size={14} />
                {pending ? t(msg`发送中...`) : t(msg`裁剪后发送`)}
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
  const t = useRuntimeTranslator();
  const isDesktop = variant === "desktop";
  return (
    <div
      className={`flex items-start justify-between gap-2.5 ${
        isDesktop
          ? "mb-2.5 rounded-[12px] border border-[rgba(245,158,11,0.14)] border-l-[3px] border-l-[#f59e0b] bg-[#fffdf2] px-3.5 py-2.5"
          : "mb-1.5 rounded-[12px] border border-[rgba(245,158,11,0.14)] border-l-[3px] border-l-[#f59e0b] bg-[color:var(--surface-card)] px-3 py-1.5 shadow-none"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div
            className={`text-[11px] font-medium ${
              isDesktop ? "text-[#b45309]" : "text-[10px] text-[#f59e0b]"
            }`}
          >
            {t(msg`回复 ${senderName}`)}
          </div>
          {modeLabel ? (
            <div
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                isDesktop
                  ? "bg-[color:var(--surface-card)] text-[color:var(--text-dim)]"
                  : "bg-[rgba(245,158,11,0.1)] text-[9px] text-[#f59e0b]"
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
              : "line-clamp-1 text-[11px] leading-4 text-[#5f6368]",
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
              ? "h-7 w-7 rounded-[8px] hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]"
              : "h-6.5 w-6.5 active:bg-black/[0.05]"
          }`}
          aria-label={t(msg`取消回复`)}
        >
          <X size={14} />
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
  const t = useRuntimeTranslator();
  return (
    // 走查电脑端群聊 R14：DesktopMentionPicker 是群聊里输入 "@" 弹出的成员选择
    // 列表（direct 路径 conversation-thread-panel 没传 mentionCandidates，
    // group-chat-thread-panel 才传，所以本组件实际只在群聊里出现）。原版裸 div
    // 包一堆 <button>，盲人 SR 走过去：(a) 听不出这是个 list（按 Tab 走 textarea
    // → 看不见选项），(b) 即使 hover 触发也不知道 activeIndex 是哪个。键盘
    // 上 / 下 / Enter 由父 chat-composer 接管 textarea keydown 控制 activeIndex
    // 而不挪 focus，SR 用户拿不到 audible 反馈。
    //
    // 加 role="listbox" + aria-label 表明列表语义，每个候选项 role="option" +
    // aria-selected=活跃。textarea 上配合 aria-activedescendant / aria-controls
    // 还能更准，但 textarea 又同时挂着其它 SR 文本，attribute 串扰大；选项加
    // role=option 后 SR 在阅读 textarea 时 NVDA / VoiceOver 仍会朗读"列表
    // N 项 当前 ${activeIndex+1}"，已经能 audible 区分。
    <div
      role="listbox"
      aria-label={t(msg`@提及成员候选`)}
      className="mb-3 overflow-hidden rounded-[12px] border border-black/6 bg-[color:var(--surface-card)] py-1.5 shadow-[0_10px_24px_rgba(180,130,20,0.10)]"
    >
      <div
        aria-hidden="true"
        className="px-4 pb-1 pt-1 text-[11px] text-[color:var(--text-dim)]"
      >
        {t(msg`选择要提到的成员`)}
      </div>
      <div className="space-y-0.5">
        {candidates.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(candidate)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
              index === activeIndex ? "bg-[#f5f1e6]" : "hover:bg-[#fafafa]",
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
            <div
              aria-hidden="true"
              className="shrink-0 text-[13px] text-[color:var(--text-dim)]"
            >
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
    throw new Error(translateRuntimeMessage(msg`当前只支持图片附件。`));
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

async function readNativeBridgeImageAssetFile(
  asset: MobileBridgeImageAsset,
  index: number,
) {
  const file = await readNativeBridgeFileAsset(asset, {
    fallbackBaseName: `image-${index + 1}`,
    fallbackMimeType: "image/jpeg",
  });

  if (!file.type.startsWith("image/")) {
    throw new Error(translateRuntimeMessage(msg`当前只支持图片附件。`));
  }

  return file;
}

async function readNativeBridgeFileAsset(
  asset: MobileBridgeFileAsset,
  options?: {
    fallbackBaseName?: string;
    fallbackMimeType?: string;
  },
) {
  const source = resolveNativeBridgeFileAssetSource(asset);
  if (!source) {
    throw new Error(translateRuntimeMessage(msg`读取文件失败，请重新选择。`));
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(translateRuntimeMessage(msg`读取文件失败，请重新选择。`));
  }

  const blob = await response.blob();
  const mimeType =
    normalizeAssetValue(asset.mimeType) ||
    blob.type ||
    resolveMimeTypeFromFileName(asset.fileName) ||
    options?.fallbackMimeType ||
    "application/octet-stream";
  const fileName = resolveNativeBridgeFileAssetFileName(asset.fileName, {
    fallbackBaseName: options?.fallbackBaseName ?? "file",
    mimeType,
  });

  return new File([blob], fileName, { type: mimeType });
}

function resolveNativeBridgeFileAssetSource(asset: MobileBridgeFileAsset) {
  const webPath = normalizeAssetValue(asset.webPath);
  if (webPath) {
    if (
      webPath.startsWith("file://") ||
      webPath.startsWith("/") ||
      webPath.startsWith("content://")
    ) {
      return Capacitor.convertFileSrc(webPath);
    }

    return webPath;
  }

  const path = normalizeAssetValue(asset.path);
  if (!path) {
    return null;
  }

  if (
    path.startsWith("file://") ||
    path.startsWith("/") ||
    path.startsWith("content://")
  ) {
    return Capacitor.convertFileSrc(path);
  }

  return path;
}

function resolveNativeBridgeFileAssetFileName(
  fileName: string | undefined,
  options: {
    fallbackBaseName: string;
    mimeType: string;
  },
) {
  const normalizedFileName = normalizeAssetValue(fileName);
  if (normalizedFileName) {
    return normalizedFileName;
  }

  const extension = resolveFileExtensionFromMimeType(options.mimeType);
  if (!extension) {
    return options.fallbackBaseName;
  }

  return `${options.fallbackBaseName}.${extension}`;
}

function resolveMimeTypeFromFileName(fileName?: string) {
  const normalizedFileName = normalizeAssetValue(fileName)?.toLowerCase();
  if (!normalizedFileName) {
    return null;
  }

  if (
    normalizedFileName.endsWith(".jpg") ||
    normalizedFileName.endsWith(".jpeg")
  ) {
    return "image/jpeg";
  }

  if (normalizedFileName.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedFileName.endsWith(".webp")) {
    return "image/webp";
  }

  if (normalizedFileName.endsWith(".gif")) {
    return "image/gif";
  }

  if (normalizedFileName.endsWith(".heic")) {
    return "image/heic";
  }

  if (normalizedFileName.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (normalizedFileName.endsWith(".json")) {
    return "application/json";
  }

  if (normalizedFileName.endsWith(".zip")) {
    return "application/zip";
  }

  if (normalizedFileName.endsWith(".csv")) {
    return "text/csv";
  }

  if (normalizedFileName.endsWith(".md")) {
    return "text/markdown";
  }

  if (normalizedFileName.endsWith(".txt")) {
    return "text/plain";
  }

  if (normalizedFileName.endsWith(".mp3")) {
    return "audio/mpeg";
  }

  if (normalizedFileName.endsWith(".wav")) {
    return "audio/wav";
  }

  if (normalizedFileName.endsWith(".m4a")) {
    return "audio/mp4";
  }

  if (normalizedFileName.endsWith(".mp4")) {
    return "video/mp4";
  }

  if (normalizedFileName.endsWith(".mov")) {
    return "video/quicktime";
  }

  return null;
}

function resolveFileExtensionFromMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "application/pdf":
      return "pdf";
    case "application/json":
      return "json";
    case "application/zip":
      return "zip";
    case "text/csv":
      return "csv";
    case "text/markdown":
      return "md";
    case "text/plain":
      return "txt";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
      return "wav";
    case "audio/mp4":
      return "m4a";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "image/jpg":
    case "image/jpeg":
      return "jpg";
    default:
      return null;
  }
}

function normalizeAssetValue(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveNativeCameraCaptureNotice(
  errorMessage: string,
  options?: {
    nativeBridgeAvailable?: boolean;
    onOpenSettings?: () => void;
    onPickAlbum?: () => void;
    onRetry?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
  },
): MobilePlusNoticeState {
  const normalizedMessage = errorMessage.toLowerCase();

  if (normalizedMessage.includes("permission")) {
    return {
      message: options?.nativeBridgeAvailable
        ? translateRuntimeMessage(msg`相机权限未开启，请到系统设置里允许隐界访问相机后再试。`)
        : translateRuntimeMessage(msg`相机权限未开启，请检查当前设备的相机权限后再试。`),
      actionLabel:
        options?.nativeBridgeAvailable && options.onOpenSettings
          ? translateRuntimeMessage(msg`去设置`)
          : undefined,
      onAction:
        options?.nativeBridgeAvailable && options.onOpenSettings
          ? options.onOpenSettings
          : undefined,
      secondaryActionLabel:
        options?.nativeBridgeAvailable && options.onOpenSettings
          ? options.secondaryActionLabel
          : undefined,
      onSecondaryAction:
        options?.nativeBridgeAvailable && options.onOpenSettings
          ? options.onSecondaryAction
          : undefined,
    };
  }

  if (normalizedMessage.includes("unavailable")) {
    return {
      message: translateRuntimeMessage(msg`当前设备暂时无法打开相机，请先改用相册选图。`),
      actionLabel: options?.onPickAlbum
        ? translateRuntimeMessage(msg`改用相册`)
        : undefined,
      onAction: options?.onPickAlbum,
      secondaryActionLabel: options?.secondaryActionLabel,
      onSecondaryAction: options?.onSecondaryAction,
    };
  }

  return {
    message: translateRuntimeMessage(msg`打开相机失败，请稍后再试。`),
    actionLabel: options?.onRetry
      ? translateRuntimeMessage(msg`重试打开相机`)
      : undefined,
    onAction: options?.onRetry,
    secondaryActionLabel: options?.secondaryActionLabel,
    onSecondaryAction: options?.onSecondaryAction,
  };
}

function resolveNativeFilePickNotice(
  errorMessage: string,
  options?: {
    onRetry?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
  },
): MobilePlusNoticeState {
  const normalizedMessage = errorMessage.toLowerCase();

  if (normalizedMessage.includes("unavailable")) {
    return {
      message: translateRuntimeMessage(msg`当前设备暂时无法打开文件选择器，请稍后再试。`),
      actionLabel: options?.onRetry
        ? translateRuntimeMessage(msg`重试打开文件`)
        : undefined,
      onAction: options?.onRetry,
      secondaryActionLabel: options?.secondaryActionLabel,
      onSecondaryAction: options?.onSecondaryAction,
    };
  }

  return {
    message: translateRuntimeMessage(msg`打开文件失败，请稍后再试。`),
    actionLabel: options?.onRetry
      ? translateRuntimeMessage(msg`重试打开文件`)
      : undefined,
    onAction: options?.onRetry,
    secondaryActionLabel: options?.secondaryActionLabel,
    onSecondaryAction: options?.onSecondaryAction,
  };
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
      reject(new Error(translateRuntimeMessage(msg`截图视频流初始化失败。`)));
    };
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  options?: {
    mimeType?: string;
    quality?: number;
    errorMessage?: string;
  },
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(
        new Error(
          options?.errorMessage ??
            translateRuntimeMessage(msg`截图生成失败，请重试。`),
        ),
      );
      },
      options?.mimeType ?? "image/png",
      options?.quality,
    );
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
    image.onerror = () =>
      reject(
        new Error(translateRuntimeMessage(msg`图片解析失败，请换一张再试。`)),
      );
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
    throw new Error(translateRuntimeMessage(msg`截图尺寸异常，请重新截图。`));
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
  const image = await loadImageElement(
    draft.previewUrl,
    translateRuntimeMessage(msg`截图解析失败，请重新截图。`),
  );
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(translateRuntimeMessage(msg`截图画布初始化失败。`));
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

  return buildWrappedScreenshotText(
    annotation.text ?? translateRuntimeMessage(msg`输入文字`),
    maxWidth,
    {
      averageCharWidth: fontSize * 0.62,
      maxLines,
    },
  ).map((line, index) => ({
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

  return buildWrappedScreenshotText(
    annotation.text ?? translateRuntimeMessage(msg`输入文字`),
    maxWidth,
    {
      averageCharWidth: fontSize * 0.62,
      maxLines,
    },
  );
}

function buildWrappedScreenshotText(
  value: string,
  maxWidth: number,
  options: {
    averageCharWidth: number;
    maxLines: number;
  },
) {
  const source = value.trim() || translateRuntimeMessage(msg`输入文字`);
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

function loadImageElement(url: string, errorMessage?: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          // 默认沿用 createImageDraft 内 readImageDimensions onerror 同一条
          // "图片解析失败，请换一张再试。"——已经有 en/ja/ko 翻译，不引新 string。
          errorMessage ??
            translateRuntimeMessage(msg`图片解析失败，请换一张再试。`),
        ),
      );
    image.src = url;
  });
}

async function prepareAttachmentPayloadForUpload(
  payload: ChatComposerAttachmentPayload,
): Promise<ChatComposerAttachmentPayload> {
  if (payload.type !== "image") {
    return payload;
  }

  if (payload.file.size <= CHAT_ATTACHMENT_IMAGE_UPLOAD_LIMIT_BYTES) {
    return payload;
  }

  const optimized = await optimizeImageAttachmentForUpload(payload);
  if (optimized.file.size > CHAT_ATTACHMENT_IMAGE_UPLOAD_LIMIT_BYTES) {
    throw new Error(translateRuntimeMessage(msg`图片过大，请先裁剪后再发送。`));
  }

  return optimized;
}

async function optimizeImageAttachmentForUpload(
  payload: Extract<ChatComposerAttachmentPayload, { type: "image" }>,
): Promise<Extract<ChatComposerAttachmentPayload, { type: "image" }>> {
  const image = await loadImageElementFromFile(payload.file);
  let smallestResult: {
    file: File;
    width: number;
    height: number;
  } | null = null;

  for (const scale of CHAT_ATTACHMENT_IMAGE_UPLOAD_SCALE_STEPS) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error(
      translateRuntimeMessage(msg`当前浏览器暂不支持图片处理，请先裁剪后再发送。`),
    );
    }

    context.drawImage(image, 0, 0, width, height);

    for (const candidate of CHAT_ATTACHMENT_IMAGE_EXPORT_CANDIDATES) {
      const blob = await canvasToBlob(canvas, {
        mimeType: candidate.mimeType,
        quality: candidate.quality,
        errorMessage: translateRuntimeMessage(msg`图片处理失败，请先裁剪后再发送。`),
      });
      const mimeType = blob.type || candidate.mimeType;
      const nextExtension =
        resolveImageExtensionFromMimeType(mimeType) ?? candidate.extension;
      const nextFile = new File(
        [blob],
        replaceFileExtension(
          payload.fileName || payload.file.name || "image",
          nextExtension,
        ),
        { type: mimeType },
      );
      const result = {
        file: nextFile,
        width,
        height,
      };

      if (!smallestResult || nextFile.size < smallestResult.file.size) {
        smallestResult = result;
      }

      if (nextFile.size <= CHAT_ATTACHMENT_IMAGE_UPLOAD_LIMIT_BYTES) {
        return {
          ...payload,
          file: nextFile,
          fileName: nextFile.name,
          width,
          height,
        };
      }
    }
  }

  if (smallestResult) {
    return {
      ...payload,
      file: smallestResult.file,
      fileName: smallestResult.file.name,
      width: smallestResult.width,
      height: smallestResult.height,
    };
  }

  return payload;
}

async function loadImageElementFromFile(file: File) {
  const url = URL.createObjectURL(file);

  try {
    return await loadImageElement(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function resolveImageExtensionFromMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  return null;
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const normalized = fileName.trim().replace(/\.[^.]+$/, "");
  return `${normalized || "image"}.${nextExtension}`;
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

// 用于 dragenter/dragover：drop 之前拿不到真文件，只能通过 kind/types
// 探测是不是文件 drag。注意 types 在 Chromium 上是大写 "Files"，标准
// DataTransfer.types 用大写 "Files"，DataTransferItemList.kind 用小写
// "file"——两条都查一下兼容性更稳。
function hasDraggableFiles(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) {
    return false;
  }

  if (dataTransfer.types && dataTransfer.types.includes("Files")) {
    return true;
  }

  for (const item of dataTransfer.items) {
    if (item.kind === "file") {
      return true;
    }
  }

  return false;
}

function findActiveMentionToken(value: string, cursor: number) {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  let atIndex = safeCursor - 1;

  while (atIndex >= 0) {
    const current = value[atIndex];
    if (current === "@") {
      break;
    }

    if (!isChatMentionTokenCharacter(current)) {
      return null;
    }

    atIndex -= 1;
  }

  if (atIndex < 0 || value[atIndex] !== "@") {
    return null;
  }

  if (!isChatMentionPrefixBoundary(value[atIndex - 1] ?? "")) {
    return null;
  }

  let endIndex = atIndex + 1;
  while (
    endIndex < value.length &&
    isChatMentionTokenCharacter(value[endIndex])
  ) {
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
