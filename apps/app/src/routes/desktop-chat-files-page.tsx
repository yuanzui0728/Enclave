import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  getConversationMessages,
  getConversations,
  getGroupMessages,
  type GroupMessage,
  type Message,
  type MessageAttachment,
} from "@yinjie/contracts";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  X,
} from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextField,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { DesktopLayoutRequiredState } from "../components/desktop-layout-required-state";
import { EmptyState } from "../components/empty-state";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import {
  buildDesktopChatFilesRouteHash,
  parseDesktopChatFilesRouteState,
} from "../features/desktop/chat/desktop-chat-files-route-state";
import {
  buildDesktopChatThreadHash,
  buildDesktopChatThreadPath,
} from "../features/desktop/chat/desktop-chat-route-state";
import {
  openDesktopChatImageViewerWindow,
  type DesktopChatImageViewerSessionItem,
} from "../features/desktop/chat/desktop-chat-image-viewer-route-state";
import { DesktopUtilityShell } from "../features/desktop/desktop-utility-shell";
import {
  hydrateDesktopFavoritesFromNative,
  readDesktopFavorites,
  removeDesktopFavorite,
  upsertDesktopFavorite,
} from "../features/favorites/favorites-storage";
import {
  filterSearchableChatMessages,
  useLocalChatMessageActionState,
} from "../features/chat/local-chat-message-actions";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatMessageTimestamp, parseTimestamp } from "../lib/format";
import { getConversationDisplayTitle } from "../lib/conversation-preview";
import {
  getConversationThreadLabel,
  getConversationThreadType,
  isPersistedGroupConversation,
} from "../lib/conversation-route";
import { resolveAppMediaUrl } from "../lib/media-url";
import { openExternalUrl } from "../runtime/external-url";
import { revealSavedFile } from "../runtime/reveal-saved-file";
import { saveRemoteFile } from "../runtime/save-remote-file";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type FileFilter = "all" | "image" | "file";

type AttachmentRow = {
  id: string;
  conversationId: string;
  conversationTitle: string;
  conversationType: "direct" | "group";
  conversationSource?: "conversation" | "group";
  attachment: Extract<MessageAttachment, { kind: "image" | "file" }>;
  createdAt: string;
  senderName: string;
  text: string;
};

type ImageAttachmentRow = AttachmentRow & {
  attachment: Extract<MessageAttachment, { kind: "image" }>;
};

export function DesktopChatFilesPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "";
  const nativeDesktopFavorites = runtimeConfig.appPlatform === "desktop";
  const hash = useRouterState({ select: (state) => state.location.hash });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const routeState = parseDesktopChatFilesRouteState(hash);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(routeState.conversationId ?? null);
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<FileFilter>("all");
  const [favoriteSourceIds, setFavoriteSourceIds] = useState<string[]>([]);
  const [viewerAttachmentId, setViewerAttachmentId] = useState<string | null>(
    null,
  );
  const [actionNotice, setActionNotice] = useState<{
    message: string;
    tone: "success" | "danger";
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const localMessageActionState = useLocalChatMessageActionState();

  // 走查电脑端群聊 R5：和姊妹 DesktopGroupDetailCard R4（commit 165ca9815）/
  // GroupChatDetailsPanel R1（commit bf7e3914b）同款 pattern。「定位到原消息」
  // 按钮 line 832 原版 onClick → navigateToAttachmentMessage(item) → 直接 push
  // /tabs/chat?...messageId=... history 项，无任何 throttle。同帧 <16ms 双击
  // 都通过 → 2 条相同 history 项 → 用户从被定位的群消息回到附件页要按 2 次
  // 返回；群消息的 around-message 窗口拉取走 getGroupMessages 公网 RTT
  //（~600ms），第 2 次也会重复发出（thread panel 内 highlightedMessageId
  // 的 anchor-window fetch 也跟着第二次重打）。按 messageId 分锁（不同附件
  // 同帧连点是合法用法），raf 释放兜底"navigate 没真正切走"边界。
  const navigatingAttachmentMessageIdsRef = useRef<Set<string>>(new Set());
  const navigateToAttachmentMessage = (item: AttachmentRow) => {
    if (navigatingAttachmentMessageIdsRef.current.has(item.id)) {
      return;
    }
    navigatingAttachmentMessageIdsRef.current.add(item.id);
    void navigate({
      to: "/tabs/chat",
      hash: buildDesktopChatThreadHash({
        conversationId: item.conversationId,
        messageId: item.id,
      }),
    });
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        navigatingAttachmentMessageIdsRef.current.delete(item.id);
      });
    } else {
      navigatingAttachmentMessageIdsRef.current.delete(item.id);
    }
  };

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    setFavoriteSourceIds(readDesktopFavorites().map((item) => item.sourceId));
  }, [isDesktopLayout]);

  useEffect(() => {
    if (!isDesktopLayout || !nativeDesktopFavorites) {
      return;
    }

    let cancelled = false;

    async function syncFavoriteSourceIds() {
      const favoriteSourceIds = (await hydrateDesktopFavoritesFromNative()).map(
        (item) => item.sourceId,
      );
      if (cancelled) {
        return;
      }

      setFavoriteSourceIds((current) =>
        JSON.stringify(current) === JSON.stringify(favoriteSourceIds)
          ? current
          : favoriteSourceIds,
      );
    }

    const handleFocus = () => {
      void syncFavoriteSourceIds();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncFavoriteSourceIds();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isDesktopLayout, nativeDesktopFavorites]);

  useEffect(() => {
    if (!actionNotice) {
      return;
    }

    const timer = window.setTimeout(
      () => setActionNotice(null),
      actionNotice.actionLabel ? 5000 : 2200,
    );
    return () => window.clearTimeout(timer);
  }, [actionNotice]);

  // 走查新会话桌面端群聊 R1：app-conversations 是和 chat-list / chat-workspace /
  // chat-details 共用的 query key——其它入口都已经按 15s staleTime 对齐过；这里
  // 漏掉，用户从群「聊天文件」入口跳进来时即使 cache 刚刷过几百 ms 也会再发一
  // 次 getConversations，公网隧道 ~600ms RTT 直接撞文件列表 query → "进入文件
  // 页空白半秒"。和移动端单聊 R4 / desktop-message-avatar-popover R1 同款补
  // staleTime: 15s。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: isDesktopLayout,
    staleTime: 15_000,
  });

  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );

  useEffect(() => {
    const nextRouteConversationId = routeState.conversationId ?? null;
    setSelectedConversationId((current) =>
      current === nextRouteConversationId ? current : nextRouteConversationId,
    );
  }, [routeState.conversationId]);

  useEffect(() => {
    if (!conversations.length) {
      if (selectedConversationId !== null) {
        setSelectedConversationId(null);
      }
      return;
    }

    if (
      routeState.conversationId &&
      conversations.some((item) => item.id === routeState.conversationId)
    ) {
      if (selectedConversationId !== routeState.conversationId) {
        setSelectedConversationId(routeState.conversationId);
      }
      return;
    }

    if (
      selectedConversationId &&
      conversations.some((item) => item.id === selectedConversationId)
    ) {
      return;
    }

    if (selectedConversationId !== null) {
      setSelectedConversationId(null);
    }
  }, [conversations, routeState.conversationId, selectedConversationId]);

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }
    // 在 "/desktop/chat-files" 外不要回写 hash —— 否则用户点「定位到原消息」
    // 跳 /tabs/chat#... 的瞬间这个 effect 会把路径 replace 回 /desktop/chat-files
    // 把跳转吞掉（与 profile-settings 同款坑）。
    if (!pathname.startsWith("/desktop/chat-files")) {
      return;
    }

    const nextHash = buildDesktopChatFilesRouteHash(selectedConversationId);
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (normalizedHash === (nextHash ?? "")) {
      return;
    }

    void navigate({
      to: "/desktop/chat-files",
      hash: nextHash,
      replace: true,
    });
  }, [
    hash,
    isDesktopLayout,
    navigate,
    pathname,
    selectedConversationId,
  ]);

  const selectedConversation =
    conversations.find((item) => item.id === selectedConversationId) ?? null;
  // 走查新会话桌面端群聊 R1：原版 queryKey 第 3 段直接 `conversations.map(...)`
  // 按服务端返回的"按最近活跃排序"顺序构造数组。chat-list 的 60s 轮询 / socket
  // 推一条群消息都会让 conversations 重新排序（lastActivityAt 变化）——id 集合
  // 没变，但数组元素的顺序变了 → react-query 深比较判断 key 不同 → 触发
  // allAttachmentsQuery 整页 Promise.all 把 7 个 group + N 个单聊的全部消息再
  // 全量 fetch 一遍（每条对话最多 100 条消息）。用户在文件页停一分钟，期间
  // 群里有人发消息就会重新拉一次全量 attachments。先 sort 后再 join，让 key
  // 只在"参与的对话集合"真变化时才换。
  const allAttachmentsQueryKey = useMemo(
    () =>
      conversations
        .map(
          (item) =>
            `${item.id}:${item.source ?? getConversationThreadType(item)}`,
        )
        .sort(),
    [conversations],
  );
  const allAttachmentsQuery = useQuery({
    queryKey: ["desktop-chat-files", baseUrl, allAttachmentsQueryKey],
    queryFn: async () => {
      if (!baseUrl) {
        return [];
      }

      const rows = await Promise.all(
        conversations.map((conversation) =>
          fetchConversationAttachmentRows(conversation, baseUrl),
        ),
      );

      return rows.flat();
    },
    enabled: isDesktopLayout && Boolean(baseUrl) && conversations.length > 0,
    // 文件清单（图片 + 文件附件）是低变更频率数据——新消息到达由
    // app-conversations refetch 自然触发 queryKey 变化（id 集合变 → key 变），
    // 重复进入 /desktop/chat-files 时 15s 内沿用上次结果，避免每次都重做 7
    // 路 getGroupMessages + N 路 getConversationMessages 大数据回拉。
    staleTime: 15_000,
  });

  // 走查新一轮 R28：原版 baseAttachmentRows / attachmentCounts /
  // visibleAttachmentRowCount 三处 useMemo 各自跑一遍 filterSearchableChatMessages
  // (allAttachmentsQuery.data ?? [], localMessageActionState)，allAttachmentsQuery
  // 把全部对话最多 100 条消息平 flat 出来动辄 1000+ 项，每次 hide / recall /
  // socket 推新消息 → query data 换引用都让这条过滤器在同一帧跑 3 次。把它
  // 提到 searchableAttachmentRows 单 useMemo，下游三处 derive，filter 只跑 1 次。
  const searchableAttachmentRows = useMemo(
    () =>
      filterSearchableChatMessages(
        allAttachmentsQuery.data ?? [],
        localMessageActionState,
      ),
    [allAttachmentsQuery.data, localMessageActionState],
  );

  const baseAttachmentRows = useMemo(() => {
    if (!selectedConversationId) {
      return searchableAttachmentRows;
    }

    return searchableAttachmentRows.filter(
      (item) => item.conversationId === selectedConversationId,
    );
  }, [searchableAttachmentRows, selectedConversationId]);

  const attachmentCounts = useMemo(
    () =>
      searchableAttachmentRows.reduce<Record<string, number>>(
        (result, item) => {
          result[item.conversationId] =
            (result[item.conversationId] ?? 0) + 1;
          return result;
        },
        {},
      ),
    [searchableAttachmentRows],
  );

  // 走查新一轮 R2：原 useMemo 把 .sort + 双 .filter + searchText 全压在一个
  // dep 上。baseAttachmentRows 可能上千项（用户在「全部会话」视图下、几十个
  // 对话各自最近百条消息平 flat 出来），每个 keystroke：
  // · filter chip 没变、conversation 没切的情况下 baseAttachmentRows 完全不变
  // · sort 跟 searchText 没关系，但还是被拖着重跑（parseTimestamp 两次×N，
  //   500 项 ~10k 次 parse + ~5ms sort）
  // 排序拆到只依赖 baseAttachmentRows 的独立 useMemo，下游 filter 沿用稳定
  // 顺序；searchText 走 useDeferredValue，让输入框先把字打进去、filter 在
  // 下个 idle 帧跑，长列表搜索时 backlog 体感明显改善。和姊妹 forward-dialog
  // R3 / note-send-dialog 同款 deferred + 拆 sort/filter 思路。
  const sortedBaseAttachmentRows = useMemo(
    () =>
      [...baseAttachmentRows].sort(
        (left, right) =>
          (parseTimestamp(right.createdAt) ?? 0) -
          (parseTimestamp(left.createdAt) ?? 0),
      ),
    [baseAttachmentRows],
  );
  const deferredSearchText = useDeferredValue(searchText);
  const attachmentRows = useMemo(
    () =>
      sortedBaseAttachmentRows
        .filter((item) => matchesAttachmentFilter(item, filter))
        .filter((item) => matchesAttachmentSearch(item, deferredSearchText)),
    [sortedBaseAttachmentRows, filter, deferredSearchText],
  );
  const imageRows = useMemo(
    () => attachmentRows.filter(isImageAttachmentRow),
    [attachmentRows],
  );
  const activeImageIndex = viewerAttachmentId
    ? imageRows.findIndex((item) => item.id === viewerAttachmentId)
    : -1;
  const activeImage: ImageAttachmentRow | null =
    activeImageIndex >= 0 ? (imageRows[activeImageIndex] ?? null) : null;
  // 2026-05-21 修：和 chat-message-list resolveAttachmentUrl 同款 — 公网隧道下
  // attachment.url 走 /cloud/world-api 反代 + ?token=（CloudClientAuthGuard
  // 媒体兜底）。standaloneViewerItems / handleOpenInWindow / 缩略图 / 大图
  // viewer / handleAttachmentOpen / handleAttachmentSave 一组都裸用原 URL
  // 在公网形态全部 401。统一过 resolveAppMediaUrl。
  const standaloneViewerItems = useMemo(
    () =>
      imageRows.map(
        (item): DesktopChatImageViewerSessionItem => ({
          id: item.id,
          imageUrl: resolveAppMediaUrl(item.attachment.url),
          title: item.attachment.fileName,
          meta: `${item.conversationTitle} · ${item.senderName} · ${formatMessageTimestamp(item.createdAt)}`,
          returnTo: buildAttachmentMessagePath(item),
        }),
      ),
    [imageRows],
  );
  const visibleAttachmentRowCount = searchableAttachmentRows.length;

  useEffect(() => {
    setViewerAttachmentId((current) =>
      current && imageRows.some((item) => item.id === current) ? current : null,
    );
  }, [imageRows]);

  // 走查新一轮 R4：和姊妹 chat-image-viewer-page R2 / chat-message-list R3 同
  // 款 — handleAttachmentSave 是 fire-and-forget，无任何同步锁。聊天文件页
  // 列表行 + 大图查看器内「保存」按钮 + 行内 hover 操作三处都直接调用，同
  // 帧 <16ms double-click 弹出 2 个文件保存对话框堆叠。按 url 上锁，finally
  // 解锁，不同附件互不影响（用户在文件页里挨个保存合法）。
  const savingAttachmentUrlsRef = useRef<Set<string>>(new Set());
  const handleAttachmentSave = (input: {
    url: string;
    fileName: string;
    kind: "image" | "file";
  }) => {
    if (savingAttachmentUrlsRef.current.has(input.url)) {
      return;
    }
    savingAttachmentUrlsRef.current.add(input.url);
    void saveRemoteFile({
      url: input.url,
      fileName: input.fileName,
      kind: input.kind,
      dialogTitle: input.kind === "image" ? t(msg`保存图片`) : t(msg`保存文件`),
    })
      .finally(() => {
        savingAttachmentUrlsRef.current.delete(input.url);
      })
      .then((result) => {
      if (result.status === "cancelled") {
        return;
      }

      const canRevealSavedFile =
        result.status === "saved" && Boolean(result.savedPath?.trim());
      const savedPath = canRevealSavedFile ? result.savedPath!.trim() : null;

      setActionNotice({
        message: result.message,
        tone: result.status === "failed" ? "danger" : "success",
        actionLabel: canRevealSavedFile ? t(msg`打开位置`) : undefined,
        onAction: savedPath
          ? () => {
              void revealSavedFile(savedPath).then((revealed) => {
                setActionNotice({
                  message: revealed
                    ? t(msg`已打开所在位置。`)
                    : t(msg`打开所在位置失败，请稍后再试。`),
                  tone: revealed ? "success" : "danger",
                });
              });
            }
          : undefined,
      });
    });
  };

  // 走查电脑端单聊新一轮 R4：和 handleAttachmentSave R3 同款 — handleAttachmentOpen
  // 是 fire-and-forget，无任何同步锁。聊天文件页列表行「打开附件」按钮 + 大图
  // 查看器三处都直接调用，同帧 <16ms double-click openExternalUrl 走 OS 默认 app
  // 时被 spawn 两次，桌面会看到「图片预览器」/ 系统 default 文件管理器在前台被
  // 顶起两次（macOS Preview / Windows Photos 是 single-instance 的，第二次刷
  // 一下窗口；Linux 取决于桌面环境）。按 url 上锁。
  const openingAttachmentUrlsRef = useRef<Set<string>>(new Set());
  const handleAttachmentOpen = (input: {
    url: string;
    kind: "image" | "file";
  }) => {
    if (openingAttachmentUrlsRef.current.has(input.url)) {
      return;
    }
    openingAttachmentUrlsRef.current.add(input.url);
    void openExternalUrl(input.url)
      .then((opened) => {
        setActionNotice({
          message:
            input.kind === "image"
              ? opened
                ? t(msg`已打开图片。`)
                : t(msg`图片打开失败，请稍后再试。`)
              : opened
                ? t(msg`已打开附件。`)
                : t(msg`附件打开失败，请稍后再试。`),
          tone: opened ? "success" : "danger",
        });
      })
      .finally(() => {
        openingAttachmentUrlsRef.current.delete(input.url);
      });
  };

  // 走查电脑端单聊新一轮 R4：和姊妹 chat-message-list R3（图片预览 onOpenInWindow）
  // / R7（会话「在独立窗口打开」commit 2a0fc8632）同款 — 聊天文件页大图查看
  // 器「在独立窗口打开」按钮 onClick 走 handleOpenInWindow，无任何同步锁，
  // 也没 .catch（dynamic import + 跨窗口 IPC 拉失败时 rejection 直接落 window.
  // unhandledrejection 污染 telemetry）。同帧 <16ms double-click：
  // · 第一次 getByLabel → undefined → new WebviewWindow 在 Tauri settle 中
  // · 第二次 getByLabel 也 undefined → 也 new WebviewWindow(same label) →
  //   Tauri 返回「window already exists」→ tauri://error → finish(false)
  // · 用户：第一次窗口已成功打开 + 又看到「浏览器阻止了新窗口」红色 notice
  // 按 attachment id 上锁，finally 解锁；不同图片互不影响。
  const openingWindowAttachmentIdsRef = useRef<Set<string>>(new Set());
  const handleOpenInWindow = (item: ImageAttachmentRow) => {
    if (openingWindowAttachmentIdsRef.current.has(item.id)) {
      return;
    }
    openingWindowAttachmentIdsRef.current.add(item.id);
    void openDesktopChatImageViewerWindow({
      imageUrl: resolveAppMediaUrl(item.attachment.url),
      title: item.attachment.fileName,
      meta: `${item.conversationTitle} · ${item.senderName} · ${formatMessageTimestamp(item.createdAt)}`,
      returnTo: buildAttachmentMessagePath(item),
      items: standaloneViewerItems,
      activeId: item.id,
    })
      .then((opened) => {
        setActionNotice({
          message: opened
            ? t(msg`已在独立窗口打开图片。`)
            : t(msg`浏览器阻止了新窗口，请检查弹窗权限。`),
          tone: opened ? "success" : "danger",
        });
      })
      .catch(() => {
        setActionNotice({
          message: t(msg`打开独立窗口失败，请稍后再试。`),
          tone: "danger",
        });
      })
      .finally(() => {
        openingWindowAttachmentIdsRef.current.delete(item.id);
      });
  };

  if (!isDesktopLayout) {
    return (
      <DesktopLayoutRequiredState
        title={t(msg`聊天文件当前仅提供桌面布局`)}
        description={t(msg`聊天文件工作区目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到消息页继续查看会话附件。`)}
        actionLabel={t(msg`返回消息`)}
        fallbackTo="/tabs/chat"
      />
    );
  }

  return (
    <>
      <DesktopUtilityShell
        // 走查电脑端单聊 R90：原版 `selectedConversation?.title` 直接渲染服务端
        // 持久化的会话 title，direct 会话在 normalizeLegacyConversationEntity
        // 全部 fallback 失败时会落字面量 sentinel「未知联系人」/「Direct
        // conversation」。chat-files 工具页顶栏对非中文 locale 用户（en/ja/ko）
        // 直接暴露中文 sentinel — 用户切到 en-US 后看到「未知联系人 · 聊天文件」
        // 浮在最顶部。和姊妹 ConversationCardLink (R1) / 详情侧栏 (R7) /
        // workspace 独立窗口 title (R1) 已修过的同款，统一翻一遍。
        // 注意 sidebar 内的会话列表 line 669 已经走了 getConversationDisplayTitle，
        // 只有顶栏漏。
        title={
          selectedConversation
            ? getConversationDisplayTitle(selectedConversation.title)
            : t(msg`全部聊天文件`)
        }
        subtitle={
          selectedConversation
            ? t(msg`当前会话里的图片和文件会集中显示在这里。`)
            : t(msg`按会话聚合最近发送的图片和文件。`)
        }
        toolbar={
          <div className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
            {t(msg`${resolveFileFilterLabel(filter, t)} · ${attachmentRows.length} 项`)}
          </div>
        }
        sidebarClassName="w-[300px]"
        sidebar={
          <>
            <div className="border-b border-[color:var(--border-faint)] bg-white/74 px-4 py-4 backdrop-blur-xl">
              <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                {t(msg`聊天文件`)}
              </div>
              <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
                {t(msg`按会话聚合最近发送的图片和文件。`)}
              </div>
              <TextField
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t(msg`搜索文件名或消息内容`)}
                // 走查新一轮 R25：和姊妹 chat-history R24 / forward-dialog
                // / create-group / contacts add-friend 同款 a11y 修法——
                // TextField 外层只有 section 标题文本，没有 <label>
                // / aria-labelledby 把标题和输入框绑起来。SR focus 进来
                // 只听到「编辑栏 搜索文件名或消息内容 空」（部分 SR
                // 实现读 placeholder、部分不读），盲人用户从 sidebar
                // 进来不知道这个输入框是搜什么的。
                aria-label={t(msg`搜索聊天文件`)}
                className="mt-4 h-9 rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 text-sm shadow-none hover:bg-white focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-none"
              />
            </div>

            {/* 走查电脑端群聊 R92：和姊妹 chat-history R27 日期 chip / R28 sender
                chip / message-forward-dialog R26 转发模式 chooser 一批同款修
                法——「聊天文件」页（群聊「聊天信息」→「聊天文件」入口）顶部
                3 个 chip「全部 / 图片 / 文件」是 mutually exclusive 筛选选择，
                原版只用 brand 绿底 + 微 shadow 表达 active。盲人 SR 走过去听
                到 3 段裸 button label「全部 / 图片 / 文件」浮空，听不出当前
                选中哪一档。radiogroup + radio + aria-checked 让 SR 朗读
                「按钮 已选中 / 未选中」并按箭头键导航。 */}
            <div
              role="radiogroup"
              aria-label={t(msg`附件类型`)}
              className="flex items-center gap-2 border-b border-[color:var(--border-faint)] px-4 py-3"
            >
              {(["all", "image", "file"] as FileFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={filter === item}
                  onClick={() => setFilter(item)}
                  className={cn(
                    "rounded-[10px] border px-3 py-1.5 text-xs transition",
                    filter === item
                      ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] text-[color:var(--text-primary)] shadow-[0_6px_16px_rgba(15,23,42,0.04)]"
                      : "border-transparent bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-faint)] hover:bg-white",
                  )}
                >
                  {item === "all" ? t(msg`全部`) : item === "image" ? t(msg`图片`) : t(msg`文件`)}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-2 py-2">
              {conversationsQuery.isLoading ? (
                <LoadingBlock label={t(msg`正在读取会话...`)} />
              ) : null}
              {conversationsQuery.isError &&
              conversationsQuery.error instanceof Error ? (
                // 走查电脑端群聊 R83：和姊妹 group-chat-thread-panel R53/R67 /
                // GroupChatDetailsPanel R45 一批 ErrorBlock 同款 a11y 修法——
                // 「聊天文件」页（群聊「聊天信息」→「聊天文件」入口）左列
                // conversationsQuery 失败时盲人 SR 完全静默，只看到「正在读取
                // 会话」消失却不知道为什么列表是空的。挂 role="alert"。
                <ErrorBlock role="alert" message={conversationsQuery.error.message} />
              ) : null}

              {/* 走查电脑端群聊 R93：和姊妹 R92 顶部 3 chip / chat-history R27/R28
                  同款修法——「聊天文件」页左列「全部会话 + N 个会话」是按会话
                  聚合的 mutually exclusive 筛选选择，原版只用 brand 绿底 +
                  shadow 视觉差表达 active。盲人 SR 走过去听到 N+1 段裸 button
                  label「全部会话 / 群A / 单聊B / ...」浮空，听不出当前正在筛
                  哪个会话；conversations.length 在活跃用户身上能到几十，盲人
                  从头听到尾不知道焦点位置选中态。radiogroup + radio + aria-
                  checked 让 SR 朗读"按钮 已选中 / 未选中"并按箭头键导航。 */}
              <div
                role="radiogroup"
                aria-label={t(msg`筛选会话`)}
                className="space-y-1"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!selectedConversationId}
                  onClick={() => setSelectedConversationId(null)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition",
                    !selectedConversationId
                      ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                      : "border-transparent bg-transparent hover:border-[color:var(--border-faint)] hover:bg-[color:var(--surface-console)]",
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-sm font-medium text-[color:var(--text-secondary)]">
                    {t(msg`全部`)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                      {t(msg`全部会话`)}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {t(msg`${visibleAttachmentRowCount} 项附件`)}
                    </div>
                  </div>
                </button>

                {conversations.map((conversation) => {
                  const displayTitle = getConversationDisplayTitle(
                    conversation.title,
                  );
                  return (
                  <button
                    key={conversation.id}
                    type="button"
                    role="radio"
                    aria-checked={conversation.id === selectedConversationId}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition",
                      conversation.id === selectedConversationId
                        ? "border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
                        : "border-transparent bg-transparent hover:border-[color:var(--border-faint)] hover:bg-[color:var(--surface-console)]",
                    )}
                  >
                    {isPersistedGroupConversation(conversation) ? (
                      <GroupAvatarChip
                        name={displayTitle}
                        members={conversation.participants}
                        size="wechat"
                      />
                    ) : (
                    <AvatarChip
                      name={displayTitle}
                      src={conversation.avatar}
                      size="wechat"
                    />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {displayTitle}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {t(msg`${getConversationThreadLabel(conversation)} · ${attachmentCounts[conversation.id] ?? 0} 项附件`)}
                      </div>
                    </div>
                  </button>
                  );
                })}
              </div>

              {!conversationsQuery.isLoading && !conversations.length ? (
                <div className="pt-4">
                  <EmptyState
                    title={t(msg`还没有可聚合的会话`)}
                    description={t(msg`先在消息里发一些图片或文件，这里就会开始出现内容。`)}
                  />
                </div>
              ) : null}
            </div>
          </>
        }
        aside={
          <div className="flex h-full flex-col gap-3 px-4 py-4">
            <InfoCard
              label={t(msg`会话类型`)}
              value={
                selectedConversation
                  ? getConversationThreadLabel(selectedConversation)
                  : t(msg`全部会话`)
              }
            />
            <InfoCard label={t(msg`筛选范围`)} value={resolveFileFilterLabel(filter, t)} />
            <InfoCard label={t(msg`当前结果`)} value={t(msg`${attachmentRows.length} 项`)} />
          </div>
        }
      >
        <div className="space-y-3 p-4">
          {actionNotice ? (
            // 走查电脑端群聊 R86：和姊妹 desktop-chat-workspace notice（line ~1961）
            // / GroupChatDetailsPanel R40 同款修法——actionNotice 是 2200ms 或
            // 5000ms 自动消失的 transient toast（line 201-210 useEffect），用来
            // 反馈收藏 / 转发 / 删除附件 等操作结果。原版裸 InlineNotice 没 role /
            // aria-live，盲人 SR 完全感知不到这条短暂状态反馈。polite 不抢断 SR
            // 当前朗读，几秒内消失也来得及读完一条 toast。
            <InlineNotice
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-3 text-xs"
              tone={actionNotice.tone}
            >
              <span>{actionNotice.message}</span>
              {actionNotice.actionLabel && actionNotice.onAction ? (
                <InlineNoticeActionButton
                  label={actionNotice.actionLabel}
                  onClick={actionNotice.onAction}
                />
              ) : null}
            </InlineNotice>
          ) : null}
          {allAttachmentsQuery.isLoading ? (
            <LoadingBlock label={t(msg`正在读取附件...`)} />
          ) : null}
          {allAttachmentsQuery.isError &&
          allAttachmentsQuery.error instanceof Error ? (
            // 走查电脑端群聊 R83 续：主区附件列表加载失败时盲人 SR 静默——
            // 「聊天文件」是群聊主要附件入口，allAttachmentsQuery 跨 N 个 group +
            // direct 拉消息 Promise.all 任一失败就整段 throw，盲人用户看不到
            // 文件列表也听不到错误提示。挂 role="alert" 让 SR 立刻播报。
            <ErrorBlock role="alert" message={allAttachmentsQuery.error.message} />
          ) : null}

          {conversations.length
            ? attachmentRows.map((item) => {
                const sourceId = `chat-file-${item.id}`;
                const collected = favoriteSourceIds.includes(sourceId);
                const favoriteRouteHash = buildDesktopChatFilesRouteHash(
                  item.conversationId,
                );
                const isImage = item.attachment.kind === "image";

                return (
                  <div
                    key={item.id}
                    className="rounded-[16px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-soft)] transition hover:bg-[color:var(--surface-console)]"
                  >
                    <div className="flex items-start gap-4">
                      {isImage ? (
                        <button
                          type="button"
                          onClick={() => setViewerAttachmentId(item.id)}
                          className="group relative block h-24 w-24 shrink-0 overflow-hidden rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
                        >
                          <img
                            src={resolveAppMediaUrl(item.attachment.url)}
                            alt={item.attachment.fileName}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
                            // 走查电脑端单聊 R93：聊天文件页 image 列表 96×96 缩
                            // 略图，src 是原图 URL（公网媒体走 cloud-api 反代，
                            // 大小没截）。loading="lazy" 已挂、首屏外不预拉，
                            // 但首屏 6-8 张缩略图进入视口时仍是同步 decode
                            // 全部 → 主线程被一组原图 (3-5MB/张相机原图) decode
                            // 阻塞，文件页滚动到下一页时明显的"卡一下"。和姊妹
                            // R84/R87/R92 一批 sticker/preview/viewer 已挂的
                            // 同款修法补 decoding="async"。
                            decoding="async"
                            // 走查电脑端单聊 R97：和姊妹 R94 ImageMessage 同款。
                            // 这张 <img> 被包在 <button onClick={() =>
                            // setViewerAttachmentId(item.id)}> 当作"点击进 viewer"
                            // 入口，默认 draggable=true 让用户在文件页按住缩略图
                            // 想点开预览时 mousedown→拖出阈值距离触发 HTML5
                            // native drag → mouseup 不再 fire click，"点开预览"
                            // 被 silently 丢；同时拖出的图片会被释放到桌面/其它
                            // 窗口可放下区域，意外触发"下载这张图到桌面"。
                            draggable={false}
                          />
                          <div className="absolute inset-x-0 bottom-0 border-t border-white/12 bg-black/36 px-2 py-1.5 text-left text-[10px] text-white">
                            {t(msg`点击预览`)}
                          </div>
                        </button>
                      ) : (
                        <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-4 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4b5563] shadow-[0_4px_12px_rgba(15,23,42,0.05)]">
                            <FileText size={18} />
                          </div>
                          <div className="mt-3 line-clamp-2 text-[11px] leading-5 text-[color:var(--text-secondary)]">
                            {resolveAttachmentExtension(
                              item.attachment.fileName,
                              t,
                            )}
                          </div>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {item.attachment.fileName}
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                          {t(msg`${item.senderName} · ${item.conversationTitle} · ${formatMessageTimestamp(item.createdAt)}`)}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
                          {item.text.trim() || t(msg`这条消息没有额外正文。`)}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {isImage ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setViewerAttachmentId(item.id)}
                              className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 text-[12px] shadow-none hover:bg-white"
                            >
                              {t(msg`预览图片`)}
                            </Button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              handleAttachmentOpen({
                                url: resolveAppMediaUrl(item.attachment.url),
                                kind:
                                  item.attachment.kind === "image"
                                    ? "image"
                                    : "file",
                              });
                            }}
                            className="inline-flex h-8 items-center justify-center rounded-[10px] bg-[color:var(--brand-primary)] px-3 text-[12px] font-medium text-white transition hover:opacity-95"
                          >
                            {t(msg`打开附件`)}
                          </button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              handleAttachmentSave({
                                url: resolveAppMediaUrl(item.attachment.url),
                                fileName: item.attachment.fileName,
                                kind:
                                  item.attachment.kind === "image"
                                    ? "image"
                                    : "file",
                              });
                            }}
                            className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 text-[12px] shadow-none hover:bg-white"
                          >
                            {t(msg`保存附件`)}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              navigateToAttachmentMessage(item);
                            }}
                            className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 text-[12px] shadow-none hover:bg-white"
                          >
                            {t(msg`定位到原消息`)}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const nextFavorites = collected
                                ? removeDesktopFavorite(sourceId)
                                : upsertDesktopFavorite({
                                    id: `favorite-${sourceId}`,
                                    sourceId,
                                    category: "messages",
                                    title: item.attachment.fileName,
                                    description:
                                      item.text.trim() ||
                                      t(msg`${item.senderName} 分享的聊天附件`),
                                    meta: t(msg`${item.conversationTitle} · ${formatMessageTimestamp(item.createdAt)}`),
                                    to: `/desktop/chat-files${favoriteRouteHash ? `#${favoriteRouteHash}` : ""}`,
                                    badge: t(msg`聊天文件`),
                                    avatarName: item.conversationTitle,
                                  });

                              setFavoriteSourceIds(
                                nextFavorites.map(
                                  (favorite) => favorite.sourceId,
                                ),
                              );
                            }}
                            className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 text-[12px] shadow-none hover:bg-white"
                          >
                            {collected ? t(msg`取消收藏`) : t(msg`收藏`)}
                          </Button>
                        </div>
                      </div>
                      <div className="shrink-0 rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-2.5 py-1 text-xs text-[color:var(--text-muted)]">
                        {formatAttachmentMeta(item.attachment, t)}
                      </div>
                    </div>
                  </div>
                );
              })
            : null}

          {!allAttachmentsQuery.isLoading && !conversations.length ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <EmptyState
                title={t(msg`还没有聊天文件`)}
                description={t(msg`先在消息里发一张图片或文件，这里就会开始按会话和跨会话聚合。`)}
              />
            </div>
          ) : null}

          {!allAttachmentsQuery.isLoading &&
          conversations.length &&
          !attachmentRows.length ? (
            <EmptyState
              title={t(msg`当前筛选下没有附件`)}
              description={
                selectedConversation
                  ? t(msg`换一个会话、筛选类型，或者先在聊天里发一张图片或文件。`)
                  : t(msg`试试筛选图片或文件，或者先在聊天里发一张图片或文件。`)
              }
            />
          ) : null}
        </div>
      </DesktopUtilityShell>
      {activeImage ? (
        <DesktopChatFilesImageViewer
          item={activeImage}
          index={activeImageIndex}
          total={imageRows.length}
          onClose={() => setViewerAttachmentId(null)}
          onPrevious={
            activeImageIndex > 0
              ? () => setViewerAttachmentId(imageRows[activeImageIndex - 1].id)
              : undefined
          }
          onNext={
            activeImageIndex < imageRows.length - 1
              ? () => setViewerAttachmentId(imageRows[activeImageIndex + 1].id)
              : undefined
          }
          onOpenInWindow={() => handleOpenInWindow(activeImage)}
          onSave={() =>
            handleAttachmentSave({
              url: resolveAppMediaUrl(activeImage.attachment.url),
              fileName: activeImage.attachment.fileName,
              kind: "image",
            })
          }
        />
      ) : null}
    </>
  );
}

function normalizeAttachmentRows(
  conversation: {
    id: string;
    title: string;
    type: "direct" | "group";
    source?: "conversation" | "group";
  },
  messages: Message[] | GroupMessage[],
): AttachmentRow[] {
  return messages.flatMap((item) => {
    const attachment = item.attachment;

    if (
      !attachment ||
      (attachment.kind !== "image" && attachment.kind !== "file")
    ) {
      return [];
    }

    return [
      {
        id: item.id,
        conversationId: conversation.id,
        // R4：AttachmentRow.conversationTitle 渲染在 meta 行（`${title} · ${sender}
        // · ${time}`) 和图片 viewer avatarName 上，sentinel 不翻 → 非中文用户
        // 看到 raw "未知联系人 · ..." 字面量。和 ConversationCardLink 同款翻一遍。
        conversationTitle: getConversationDisplayTitle(conversation.title),
        conversationType: getConversationThreadType(conversation),
        conversationSource: conversation.source,
        attachment,
        createdAt: item.createdAt,
        senderName: item.senderName,
        text: item.text,
      },
    ];
  });
}

async function fetchConversationAttachmentRows(
  conversation: {
    id: string;
    title: string;
    type: "direct" | "group";
    source?: "conversation" | "group";
  },
  baseUrl: string,
) {
  const messages = isPersistedGroupConversation(conversation)
    ? await getGroupMessages(conversation.id, baseUrl)
    : await getConversationMessages(conversation.id, baseUrl);

  return normalizeAttachmentRows(conversation, messages);
}

function matchesAttachmentFilter(item: AttachmentRow, filter: FileFilter) {
  if (filter === "all") {
    return true;
  }

  return item.attachment.kind === filter;
}

function isImageAttachmentRow(item: AttachmentRow): item is ImageAttachmentRow {
  return item.attachment.kind === "image";
}

function matchesAttachmentSearch(item: AttachmentRow, searchText: string) {
  const normalized = searchText.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    item.attachment.fileName.toLowerCase().includes(normalized) ||
    item.conversationTitle.toLowerCase().includes(normalized) ||
    item.senderName.toLowerCase().includes(normalized) ||
    item.text.toLowerCase().includes(normalized)
  );
}

function formatAttachmentMeta(
  attachment: Extract<MessageAttachment, { kind: "image" | "file" }>,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  const sizeLabel = formatBytes(attachment.size, t);

  if (attachment.kind === "image") {
    const dimensions =
      attachment.width && attachment.height
        ? `${attachment.width}×${attachment.height}`
        : t(msg`图片`);
    return `${dimensions} · ${sizeLabel}`;
  }

  return sizeLabel;
}

function formatBytes(size: number, t: ReturnType<typeof useRuntimeTranslator>) {
  if (!Number.isFinite(size) || size <= 0) {
    return t(msg`未知大小`);
  }

  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  return `${Math.max(size / 1024, 0.1).toFixed(1)} KB`;
}

function resolveAttachmentExtension(
  fileName: string,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return t(msg`文件`);
  }

  return fileName.slice(dotIndex + 1).toUpperCase();
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function buildAttachmentMessagePath(item: AttachmentRow) {
  return buildDesktopChatThreadPath({
    conversationId: item.conversationId,
    messageId: item.id,
  });
}

function resolveFileFilterLabel(
  filter: FileFilter,
  t: ReturnType<typeof useRuntimeTranslator>,
) {
  if (filter === "image") {
    return t(msg`仅图片`);
  }

  if (filter === "file") {
    return t(msg`仅文件`);
  }

  return t(msg`图片与文件`);
}

function DesktopChatFilesImageViewer({
  item,
  index,
  total,
  onClose,
  onPrevious,
  onNext,
  onOpenInWindow,
  onSave,
}: {
  item: ImageAttachmentRow;
  index: number;
  total: number;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onOpenInWindow: () => void;
  onSave: () => void;
}) {
  const t = useRuntimeTranslator();
  // 走查电脑端单聊 R101：和姊妹 desktop-chat-confirm-dialog R11 / desktop-chat-
  // history-dialog R11 / desktop-conversation-context-menu R12 同款 perf 修法。
  // 原版 deps=[onClose, onNext, onPrevious]——这三个回调全是 parent 用 inline
  // arrow 现造 (line 983-993)：onClose `() => setViewerAttachmentId(null)`，
  // onPrev/onNext `() => setViewerAttachmentId(imageRows[i±1].id)`。父组件
  // DesktopChatFilesPage 上：conversationsQuery 60s 轮询 + 切焦点 refetch、
  // allAttachmentsQuery 跨 N 群 N 单聊重算、favoriteSourceIds 同步、actionNotice
  // 2.2s/5s 自动消失、useDeferredValue 搜索词更新——任意一条 state 翻就让 viewer
  // 父帧 re-render，3 个 inline arrow 全换引用 → 本 effect 拆 + 装 window keydown
  // listener。viewer 打开期间一分钟可能拆装 5-10 次，纯白干活。ref 镜像三个回调，
  // effect deps 收紧到 []，挂载时挂一次。
  const onCloseRef = useRef(onClose);
  const onPreviousRef = useRef(onPrevious);
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onCloseRef.current = onClose;
    onPreviousRef.current = onPrevious;
    onNextRef.current = onNext;
  });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === "ArrowLeft" && onPreviousRef.current) {
        event.preventDefault();
        onPreviousRef.current();
        return;
      }

      if (event.key === "ArrowRight" && onNextRef.current) {
        event.preventDefault();
        onNextRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    // 走查电脑端群聊 R116：和姊妹 chat-message-list ImageViewerOverlay R112 /
    // LocationViewerOverlay R112 / NoteViewerOverlay R113 同款 — 聊天文件页内置
    // 图片 viewer 根 <div> 缺 role="dialog" + aria-modal。SR 走过去只听到一串
    // 按钮 label「关闭图片预览 / 新窗口打开 / 保存图片 / 关闭 / 上一张 / 下一张」
    // 浮空，听不到"图片查看器"上下文。补 role 让 SR 识别 modal 角色，aria-label
    // 在 img 主体上方走 viewer 自己的语义入口；同时让本 viewer 在桌面 shell
    // 其它路径上若也复用（如未来从 details 侧栏 hot-link）自动跳过 workspace
    // dismissSidePanel DOM 查询，预防 race。
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(msg`图片查看器`)}
      className="fixed inset-0 z-50 bg-[rgba(17,24,39,0.72)] backdrop-blur-[2px]"
    >
      <button
        type="button"
        aria-label={t(msg`关闭图片预览`)}
        onClick={onClose}
        // 走查电脑端单聊 R114：和姊妹 R107-R113 dialog/menu backdrop 同款 ——
        // 聊天文件页内置图片 viewer 的 backdrop <button> (absolute inset-0)
        // 视觉不可见、纯 mouse"点击背景关闭"affordance，但 DOM 顺序排在 viewer
        // 子树第一位。用户点缩略图打开 viewer 后按 Tab 切顶栏「新窗口打开/保
        // 存图片」/ 左右切张按钮，焦点先落到这张不可见 backdrop → 看不到任何
        // focus ring → 再按 Enter viewer 秒关。Esc keydown 已挂 (line 1231-
        // 1251)，键盘用户走 Esc 关 viewer。
        tabIndex={-1}
        className="absolute inset-0"
      />

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-white/10 px-6 py-4 text-white">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">
            {item.attachment.fileName}
          </div>
          <div className="mt-1 text-[12px] text-white/70">
            {t(msg`${item.conversationTitle} · ${item.senderName} · ${formatMessageTimestamp(item.createdAt)}`)}
          </div>
        </div>
        <div className="ml-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenInWindow}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
            aria-label={t(msg`新窗口打开`)}
          >
            <ExternalLink size={16} />
          </button>
          <button
            type="button"
            onClick={onSave}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
            aria-label={t(msg`保存图片`)}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
            aria-label={t(msg`关闭`)}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {onPrevious ? (
        <button
          type="button"
          onClick={onPrevious}
          className="absolute left-6 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[12px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
          aria-label={t(msg`上一张`)}
        >
          <ChevronLeft size={20} />
        </button>
      ) : null}

      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-6 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[12px] border border-white/15 bg-white/10 text-white transition hover:bg-white/18"
          aria-label={t(msg`下一张`)}
        >
          <ChevronRight size={20} />
        </button>
      ) : null}

      <div className="absolute inset-0 flex items-center justify-center px-24 pb-24 pt-24">
        <img
          src={resolveAppMediaUrl(item.attachment.url)}
          alt={item.attachment.fileName}
          // 走查电脑端单聊 R93：聊天文件页内置（非独立窗口）大图 viewer 主
          // <img>。和姊妹 R88 chat-message-list / R92 独立窗口 viewer 同款 ——
          // 1) decoding="async" 让原图 (1-5MB) decode off-thread，避免点
          //    缩略图开 viewer 瞬间整页冻 100-300ms；
          // 2) draggable={false} 防止用户在 viewer 里按住图触发 HTML5 native
          //    drag，干扰前/后图切换按钮的 click 判定 + ChevronLeft/Right
          //    导航。
          decoding="async"
          draggable={false}
          className="max-h-full max-w-full rounded-[18px] object-contain shadow-[0_24px_72px_rgba(15,23,42,0.36)]"
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between border-t border-white/10 px-6 py-4 text-white/76">
        <div className="text-[12px]">
          {formatAttachmentMeta(item.attachment, t)}
        </div>
        <div className="text-[12px]">
          {index + 1} / {total}
        </div>
      </div>
    </div>
  );
}
