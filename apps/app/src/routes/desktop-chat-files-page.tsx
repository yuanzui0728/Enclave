import { useEffect, useMemo, useState } from "react";
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
import {
  getConversationThreadLabel,
  getConversationThreadType,
  isPersistedGroupConversation,
} from "../lib/conversation-route";
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

  const navigateToAttachmentMessage = (item: AttachmentRow) => {
    void navigate({
      to: "/tabs/chat",
      hash: buildDesktopChatThreadHash({
        conversationId: item.conversationId,
        messageId: item.id,
      }),
    });
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

  const baseAttachmentRows = useMemo(() => {
    const rows = filterSearchableChatMessages(
      allAttachmentsQuery.data ?? [],
      localMessageActionState,
    );

    if (!selectedConversationId) {
      return rows;
    }

    return rows.filter(
      (item) => item.conversationId === selectedConversationId,
    );
  }, [
    allAttachmentsQuery.data,
    localMessageActionState,
    selectedConversationId,
  ]);

  const attachmentCounts = useMemo(
    () =>
      filterSearchableChatMessages(
        allAttachmentsQuery.data ?? [],
        localMessageActionState,
      ).reduce<Record<string, number>>((result, item) => {
        result[item.conversationId] = (result[item.conversationId] ?? 0) + 1;
        return result;
      }, {}),
    [allAttachmentsQuery.data, localMessageActionState],
  );

  const attachmentRows = useMemo(
    () =>
      baseAttachmentRows
        .filter((item) => matchesAttachmentFilter(item, filter))
        .filter((item) => matchesAttachmentSearch(item, searchText))
        .sort(
          (left, right) =>
            (parseTimestamp(right.createdAt) ?? 0) -
            (parseTimestamp(left.createdAt) ?? 0),
        ),
    [baseAttachmentRows, filter, searchText],
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
  const standaloneViewerItems = useMemo(
    () =>
      imageRows.map(
        (item): DesktopChatImageViewerSessionItem => ({
          id: item.id,
          imageUrl: item.attachment.url,
          title: item.attachment.fileName,
          meta: `${item.conversationTitle} · ${item.senderName} · ${formatMessageTimestamp(item.createdAt)}`,
          returnTo: buildAttachmentMessagePath(item),
        }),
      ),
    [imageRows],
  );
  const visibleAttachmentRowCount = useMemo(
    () =>
      filterSearchableChatMessages(
        allAttachmentsQuery.data ?? [],
        localMessageActionState,
      ).length,
    [allAttachmentsQuery.data, localMessageActionState],
  );

  useEffect(() => {
    setViewerAttachmentId((current) =>
      current && imageRows.some((item) => item.id === current) ? current : null,
    );
  }, [imageRows]);

  const handleAttachmentSave = (input: {
    url: string;
    fileName: string;
    kind: "image" | "file";
  }) => {
    void saveRemoteFile({
      url: input.url,
      fileName: input.fileName,
      kind: input.kind,
      dialogTitle: input.kind === "image" ? t(msg`保存图片`) : t(msg`保存文件`),
    }).then((result) => {
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

  const handleAttachmentOpen = (input: {
    url: string;
    kind: "image" | "file";
  }) => {
    void openExternalUrl(input.url).then((opened) => {
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
    });
  };

  const handleOpenInWindow = (item: ImageAttachmentRow) => {
    void openDesktopChatImageViewerWindow({
      imageUrl: item.attachment.url,
      title: item.attachment.fileName,
      meta: `${item.conversationTitle} · ${item.senderName} · ${formatMessageTimestamp(item.createdAt)}`,
      returnTo: buildAttachmentMessagePath(item),
      items: standaloneViewerItems,
      activeId: item.id,
    }).then((opened) => {
      setActionNotice({
        message: opened
          ? t(msg`已在独立窗口打开图片。`)
          : t(msg`浏览器阻止了新窗口，请检查弹窗权限。`),
        tone: opened ? "success" : "danger",
      });
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
        title={selectedConversation?.title ?? t(msg`全部聊天文件`)}
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
                className="mt-4 h-9 rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 text-sm shadow-none hover:bg-white focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-none"
              />
            </div>

            <div className="flex items-center gap-2 border-b border-[color:var(--border-faint)] px-4 py-3">
              {(["all", "image", "file"] as FileFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
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
                <ErrorBlock message={conversationsQuery.error.message} />
              ) : null}

              <div className="space-y-1">
                <button
                  type="button"
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

                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
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
                        name={conversation.title}
                        members={conversation.participants}
                        size="wechat"
                      />
                    ) : (
                    <AvatarChip
                      name={conversation.title}
                      src={conversation.avatar}
                      size="wechat"
                    />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {conversation.title}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {t(msg`${getConversationThreadLabel(conversation)} · ${attachmentCounts[conversation.id] ?? 0} 项附件`)}
                      </div>
                    </div>
                  </button>
                ))}
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
            <InlineNotice
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
            <ErrorBlock message={allAttachmentsQuery.error.message} />
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
                            src={item.attachment.url}
                            alt={item.attachment.fileName}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                            loading="lazy"
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
                                url: item.attachment.url,
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
                                url: item.attachment.url,
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
              url: activeImage.attachment.url,
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
        conversationTitle: conversation.title,
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && onPrevious) {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrevious]);

  return (
    <div className="fixed inset-0 z-50 bg-[rgba(17,24,39,0.72)] backdrop-blur-[2px]">
      <button
        type="button"
        aria-label={t(msg`关闭图片预览`)}
        onClick={onClose}
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
          src={item.attachment.url}
          alt={item.attachment.fileName}
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
