import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Phone, Video } from "lucide-react";
import {
  getConversations,
  getGroup,
  getGroupMembers,
  getGroupMessages,
  type GroupMessage,
  markGroupRead,
  sendGroupMessage,
  type StickerAttachment,
  uploadChatAttachment,
} from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { ChatComposer } from "../../components/chat-composer";
import { ChatMessageList } from "../../components/chat-message-list";
import { EmptyState } from "../../components/empty-state";
import {
  encodeChatReplyText,
  sanitizeDisplayedChatText,
  type ChatReplyMetadata,
} from "../../lib/chat-text";
import {
  DesktopChatHeaderActions,
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "../desktop/chat/desktop-chat-header-actions";
import { buildDesktopMobileCallHandoffHash } from "../desktop/chat/desktop-mobile-call-handoff-route-state";
import { DesktopGroupCallPanel } from "../desktop/chat/desktop-group-call-panel";
import { type ChatRenderableMessage } from "../../components/chat-message-list";
import { type ChatRouteContextNotice } from "./conversation-thread-panel";
import { type ChatComposeShortcutAction } from "./chat-compose-shortcut-route";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import {
  buildGroupCallInviteMessage,
  type CallInviteSource,
  type GroupCallInviteStatus,
} from "./group-call-message";
import { buildMobileGroupCallRouteHash } from "./mobile-group-call-route-state";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import {
  buildChatUnreadMarkerDomId,
  findFirstUnreadMessageId,
  hasLoadedReadBoundary,
} from "./chat-unread-marker";
import { MobileChatScrollBottomButton } from "./mobile-chat-scroll-bottom-button";
import { MobileChatThreadHeader } from "./mobile-chat-thread-header";
import { useGroupBackground } from "./backgrounds/use-conversation-background";
import { useScrollAnchor } from "../../hooks/use-scroll-anchor";
import { formatTimestamp, parseTimestamp } from "../../lib/format";
import {
  joinConversationRoom,
  onChatMessage,
  onConversationUpdated,
} from "../../lib/socket";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

type GroupChatThreadPanelProps = {
  groupId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  desktopSidePanelMode?: DesktopChatSidePanelMode;
  onToggleDesktopHistory?: () => void;
  onToggleDesktopDetails?: () => void;
  onOpenDesktopMemberSearch?: () => void;
  onDesktopCallAction?: (kind: DesktopChatCallKind) => void;
  highlightedMessageId?: string;
  routeContextNotice?: ChatRouteContextNotice;
  routeMobileShortcutAction?: ChatComposeShortcutAction | null;
  onRouteMobileShortcutHandled?: () => void;
};

export function GroupChatThreadPanel({
  groupId,
  variant = "mobile",
  onBack,
  desktopSidePanelMode = null,
  onToggleDesktopHistory,
  onToggleDesktopDetails,
  onOpenDesktopMemberSearch,
  onDesktopCallAction,
  highlightedMessageId,
  routeContextNotice,
  routeMobileShortcutAction = null,
  onRouteMobileShortcutHandled,
}: GroupChatThreadPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const backgroundQuery = useGroupBackground(groupId);
  const [text, setText] = useState("");
  const [replyDraft, setReplyDraft] = useState<ChatReplyMetadata | null>(null);
  const [desktopCallPanelState, setDesktopCallPanelState] = useState<{
    kind: DesktopChatCallKind;
    source: CallInviteSource | null;
  } | null>(null);
  const [mobileShortcutRequest, setMobileShortcutRequest] = useState<{
    action: ChatComposeShortcutAction;
    nonce: number;
  } | null>(null);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const [lastPublishedCallCounts, setLastPublishedCallCounts] = useState<{
    kind: DesktopChatCallKind;
    source: CallInviteSource | null;
    activeCount: number;
    totalCount: number;
  } | null>(null);
  const [initialUnreadCount, setInitialUnreadCount] = useState(0);
  const [initialUnreadCutoff, setInitialUnreadCutoff] = useState<string | null>(
    null,
  );
  const [unreadSnapshotReady, setUnreadSnapshotReady] = useState(false);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const isDesktop = variant === "desktop";
  const unreadMarkerScrolledRef = useRef(false);
  const loadMoreRequestRef = useRef<{
    previousCount: number;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const messagesQuery = useQuery({
    queryKey: ["app-group-messages", baseUrl, groupId, messageLimit],
    queryFn: () => getGroupMessages(groupId, baseUrl, { limit: messageLimit }),
  });
  const {
    ref: scrollAnchorRef,
    isAtBottom,
    pendingCount,
    scrollToBottom,
  } = useScrollAnchor<HTMLDivElement>(messagesQuery.data?.length ?? 0);
  const handleDismissRouteContextNotice = () => {
    routeContextNotice?.onDismiss?.();
  };

  useEffect(() => {
    setText("");
    setReplyDraft(null);
    setDesktopCallPanelState(null);
    setMobileShortcutRequest(null);
    setSelectionModeActive(false);
    setLastPublishedCallCounts(null);
    setInitialUnreadCount(0);
    setInitialUnreadCutoff(null);
    setUnreadSnapshotReady(false);
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
    setHasOlderMessages(true);
    unreadMarkerScrolledRef.current = false;
    loadMoreRequestRef.current = null;
  }, [baseUrl, groupId]);

  useEffect(() => {
    if (isDesktop || !routeMobileShortcutAction) {
      return;
    }

    setMobileShortcutRequest({
      action: routeMobileShortcutAction,
      nonce: Date.now(),
    });
    onRouteMobileShortcutHandled?.();
  }, [isDesktop, onRouteMobileShortcutHandled, routeMobileShortcutAction]);

  const activeConversation = conversationsQuery.data?.find(
    (item) => item.id === groupId && item.type === "group",
  );

  useEffect(() => {
    if (unreadSnapshotReady || !conversationsQuery.isFetched) {
      return;
    }

    setInitialUnreadCount(activeConversation?.unreadCount ?? 0);
    setInitialUnreadCutoff(activeConversation?.lastReadAt ?? null);
    setUnreadSnapshotReady(true);
  }, [
    activeConversation?.lastReadAt,
    activeConversation?.unreadCount,
    conversationsQuery.isFetched,
    unreadSnapshotReady,
  ]);

  useEffect(() => {
    if (!groupId) {
      return;
    }

    joinConversationRoom({ conversationId: groupId });

    const offMessage = onChatMessage((payload) => {
      if (!("groupId" in payload) || payload.groupId !== groupId) {
        return;
      }

      queryClient.setQueriesData<GroupMessage[] | undefined>(
        {
          queryKey: ["app-group-messages", baseUrl, groupId],
        },
        (current) => upsertGroupMessage(current, payload),
      );
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    const offConversationUpdated = onConversationUpdated((payload) => {
      if (payload.type !== "group" || payload.id !== groupId) {
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-messages", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });

    return () => {
      offMessage();
      offConversationUpdated();
    };
  }, [baseUrl, groupId, queryClient]);

  useEffect(() => {
    if (!groupId || !unreadSnapshotReady) {
      return;
    }

    void markGroupRead(groupId, baseUrl).then(() => {
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });
  }, [
    baseUrl,
    groupId,
    messagesQuery.data?.length,
    queryClient,
    unreadSnapshotReady,
  ]);

  const sendMutation = useMutation({
    mutationFn: (payload: Parameters<typeof sendGroupMessage>[1]) =>
      sendGroupMessage(groupId, payload, baseUrl),
    onSuccess: async () => {
      setText("");
      setReplyDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const sendCallInviteMutation = useMutation({
    mutationFn: (input: {
      kind: DesktopChatCallKind;
      status: GroupCallInviteStatus;
      activeCount: number;
      totalCount: number;
      source: CallInviteSource;
      durationMs?: number;
      startedAt?: string;
    }) =>
      sendGroupMessage(
        groupId,
        {
          text: buildGroupCallInviteMessage(
            input.kind,
            groupQuery.data?.name ?? "当前群聊",
            {
              activeCount: input.activeCount,
              totalCount: input.totalCount,
            },
            input.status,
            undefined,
            input.source,
            undefined,
            input.durationMs,
            input.startedAt,
          ),
        },
        baseUrl,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      scrollToBottom("smooth");
    },
  });

  const orderedMessages = useMemo(
    () =>
      [...(messagesQuery.data ?? [])].sort(
        (left, right) =>
          (parseTimestamp(left.createdAt) ?? 0) -
          (parseTimestamp(right.createdAt) ?? 0),
      ),
    [messagesQuery.data],
  );
  const hasHighlightedMessage = orderedMessages.some(
    (message) => message.id === highlightedMessageId,
  );
  const unreadMarkerMessageId = useMemo(
    () =>
      findFirstUnreadMessageId(
        orderedMessages,
        initialUnreadCutoff,
        initialUnreadCount > 0,
      ),
    [initialUnreadCount, initialUnreadCutoff, orderedMessages],
  );
  const shouldLoadOlderForUnreadMarker =
    initialUnreadCount > 0 &&
    Boolean(initialUnreadCutoff) &&
    hasOlderMessages &&
    !messagesQuery.isFetching &&
    !hasLoadedReadBoundary(orderedMessages, initialUnreadCutoff);

  const sendError =
    sendMutation.error instanceof Error ? sendMutation.error.message : null;
  const effectiveBackground = backgroundQuery.data?.effectiveBackground ?? null;
  const announcement = groupQuery.data?.announcement?.trim() ?? "";

  useEffect(() => {
    const loadedCount = messagesQuery.data?.length ?? 0;
    const pendingLoad = loadMoreRequestRef.current;

    if (loadedCount < messageLimit) {
      setHasOlderMessages(false);
    } else if (!pendingLoad) {
      setHasOlderMessages(true);
    }

    if (!pendingLoad || messagesQuery.isFetching) {
      return;
    }

    loadMoreRequestRef.current = null;
    if (loadedCount <= pendingLoad.previousCount) {
      setHasOlderMessages(false);
      return;
    }

    window.requestAnimationFrame(() => {
      const element = scrollAnchorRef.current;
      if (!element) {
        return;
      }

      element.scrollTop =
        pendingLoad.scrollTop +
        (element.scrollHeight - pendingLoad.scrollHeight);
    });
  }, [
    messageLimit,
    messagesQuery.data,
    messagesQuery.isFetching,
    scrollAnchorRef,
  ]);

  useEffect(() => {
    if (!highlightedMessageId || !hasHighlightedMessage) {
      return;
    }

    const target = document.getElementById(
      `chat-message-${highlightedMessageId}`,
    );
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hasHighlightedMessage, highlightedMessageId]);

  useEffect(() => {
    if (
      highlightedMessageId ||
      !unreadMarkerMessageId ||
      unreadMarkerScrolledRef.current
    ) {
      return;
    }

    unreadMarkerScrolledRef.current = true;
    const markerId = buildChatUnreadMarkerDomId({
      id: groupId,
      type: "group",
    });

    window.requestAnimationFrame(() => {
      document
        .getElementById(markerId)
        ?.scrollIntoView({ behavior: "auto", block: "center" });
    });
  }, [groupId, highlightedMessageId, unreadMarkerMessageId]);

  const sendAttachmentMessage = async (
    payload: ChatComposerAttachmentPayload,
  ) => {
    const replyText = replyDraft ? encodeChatReplyText("", replyDraft) : "";

    if (payload.type === "image") {
      const formData = new FormData();
      formData.set("file", payload.file);
      formData.set("width", String(payload.width ?? ""));
      formData.set("height", String(payload.height ?? ""));
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "image") {
        throw new Error("图片上传结果异常。");
      }

      await sendMutation.mutateAsync({
        type: "image",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "file") {
      const formData = new FormData();
      formData.set("file", payload.file);
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "file") {
        throw new Error("文件上传结果异常。");
      }

      await sendMutation.mutateAsync({
        type: "file",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "voice") {
      const formData = new FormData();
      formData.set("file", payload.file, payload.fileName);
      if (payload.durationMs) {
        formData.set("durationMs", String(payload.durationMs));
      }
      const result = await uploadChatAttachment(formData, baseUrl);

      if (result.attachment.kind !== "voice") {
        throw new Error("语音上传结果异常。");
      }

      await sendMutation.mutateAsync({
        type: "voice",
        text: replyText || undefined,
        attachment: result.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    if (payload.type === "contact_card") {
      await sendMutation.mutateAsync({
        type: "contact_card",
        text: replyText || undefined,
        attachment: payload.attachment,
      });
      scrollToBottom("smooth");
      return;
    }

    await sendMutation.mutateAsync({
      type: "location_card",
      text: replyText || undefined,
      attachment: payload.attachment,
    });
    scrollToBottom("smooth");
  };

  const handleSendSticker = async (sticker: StickerAttachment) => {
    await sendMutation.mutateAsync({
      type: "sticker",
      text: replyDraft ? encodeChatReplyText("", replyDraft) : undefined,
      attachment: sticker,
    });
    scrollToBottom("smooth");
  };

  const handleSendPresetText = async (presetText: string) => {
    await sendMutation.mutateAsync({
      text: replyDraft
        ? encodeChatReplyText(presetText, replyDraft)
        : presetText.trim(),
    });
    scrollToBottom("smooth");
    setReplyDraft(null);
  };

  const handleSubmit = async () => {
    await sendMutation.mutateAsync({
      text: replyDraft ? encodeChatReplyText(text, replyDraft) : text.trim(),
    });
    scrollToBottom("smooth");
  };

  const loadOlderMessages = useCallback(async () => {
    if (messagesQuery.isFetching || !hasOlderMessages) {
      return;
    }

    const element = scrollAnchorRef.current;
    loadMoreRequestRef.current = {
      previousCount: messagesQuery.data?.length ?? 0,
      scrollHeight: element?.scrollHeight ?? 0,
      scrollTop: element?.scrollTop ?? 0,
    };
    setMessageLimit((current) => current + HISTORY_PAGE_SIZE);
  }, [
    hasOlderMessages,
    messagesQuery.data?.length,
    messagesQuery.isFetching,
    scrollAnchorRef,
  ]);

  useEffect(() => {
    if (!shouldLoadOlderForUnreadMarker) {
      return;
    }

    void loadOlderMessages();
  }, [loadOlderMessages, shouldLoadOlderForUnreadMarker]);

  const replyPreview = replyDraft
    ? {
        senderName: replyDraft.senderName,
        text: replyDraft.quotedText?.trim() || replyDraft.previewText,
        modeLabel: replyDraft.quotedText ? "部分引用" : undefined,
      }
    : null;
  const mentionCandidates = useMemo(() => {
    const candidates: Array<{
      id: string;
      name: string;
      subtitle?: string;
      avatar?: string | null;
    }> = [
      {
        id: "mention-all",
        name: "所有人",
        subtitle: "提醒全部群成员",
        avatar: null,
      },
    ];
    const seenIds = new Set<string>();

    for (const member of membersQuery.data ?? []) {
      if (member.memberType !== "character") {
        continue;
      }

      if (seenIds.has(member.memberId)) {
        continue;
      }

      seenIds.add(member.memberId);
      candidates.push({
        id: member.memberId,
        name: member.memberName?.trim() || member.memberId,
        subtitle: member.role === "admin" ? "管理员" : "群成员",
        avatar: member.memberAvatar,
      });
    }

    return candidates;
  }, [membersQuery.data]);

  const handleReplyMessage = (
    message: ChatRenderableMessage,
    options?: {
      quotedText?: string;
    },
  ) => {
    const senderName =
      message.senderType === "user"
        ? "我"
        : message.senderName?.trim() || "群成员";
    const previewText = describeReplyPreview(message);
    const quotedText = options?.quotedText?.trim();
    setReplyDraft({
      messageId: message.id,
      senderName,
      previewText,
      quotedText: quotedText || undefined,
    });
  };

  const handleDesktopCallAction = (kind: DesktopChatCallKind) => {
    if (isDesktop) {
      setDesktopCallPanelState({
        kind,
        source: "desktop",
      });
      return;
    }

    void navigate({
      to:
        kind === "voice"
          ? "/group/$groupId/voice-call"
          : "/group/$groupId/video-call",
      params: { groupId },
    });
    onDesktopCallAction?.(kind);
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop ? "bg-[#f5f5f5]" : "bg-[#ededed]"
      }`}
    >
      {isDesktop ? (
        <header className="flex items-center gap-3 border-b border-black/5 bg-[#f3f3f3] px-6 py-3">
          <div className="min-w-0 flex-1 px-1 py-1">
            <button
              type="button"
              onClick={() => onToggleDesktopDetails?.()}
              className="block w-full rounded-[10px] px-0 py-0 text-left transition hover:bg-white/40"
              aria-label="打开群聊信息"
              title="打开群聊信息"
            >
              <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                {groupQuery.data?.name ?? "群聊"}
              </div>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenDesktopMemberSearch?.() ?? onToggleDesktopDetails?.()
              }
              className="mt-1 rounded-[8px] px-0 py-0 text-[11px] text-[color:var(--text-muted)] transition hover:text-[color:var(--text-primary)]"
              aria-label="查看群成员"
              title="查看群成员"
            >
              {(membersQuery.data?.length ?? 0).toString()} 人群聊
            </button>
          </div>

          <div className="hidden items-center xl:flex">
            <DesktopChatHeaderActions
              activePanelMode={desktopSidePanelMode}
              onToggleHistory={() => onToggleDesktopHistory?.()}
              onToggleDetails={() => onToggleDesktopDetails?.()}
              onSelectCall={handleDesktopCallAction}
            />
          </div>
        </header>
      ) : (
        <MobileChatThreadHeader
          title={groupQuery.data?.name ?? "群聊"}
          onBack={onBack}
          actions={[
            {
              key: "voice-call",
              icon: Phone,
              label: "语音通话",
              onClick: () => handleDesktopCallAction("voice"),
            },
            {
              key: "video-call",
              icon: Video,
              label: "视频通话",
              onClick: () => handleDesktopCallAction("video"),
            },
          ]}
          onMore={() => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
            });
          }}
        />
      )}

      {isDesktop ? (
        <div className="flex items-center gap-3 border-b border-black/5 bg-[#f7f7f7] px-6 py-3">
          <button
            type="button"
            onClick={() => {
              void navigate({
                to: "/group/$groupId/announcement",
                params: { groupId },
              });
            }}
            className="flex min-w-0 flex-1 items-start gap-3 text-left transition hover:opacity-90"
          >
            <span className="mt-0.5 shrink-0 rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-[#07a35a]">
              群公告
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-[color:var(--text-primary)]">
                {announcement || "暂无群公告，点击填写本群说明。"}
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                {announcement
                  ? `最近更新 ${formatTimestamp(groupQuery.data?.updatedAt)}`
                  : "群接龙与群协作入口先收口到聊天信息侧栏"}
              </div>
            </div>
          </button>
        </div>
      ) : null}

      {!isDesktop && announcement ? (
        <button
          type="button"
          onClick={() => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
            });
          }}
          className="flex items-center gap-2.5 border-b border-black/5 bg-[#f7f7f7] px-4 py-2.5 text-left"
        >
          <span className="shrink-0 rounded-[8px] bg-white px-2 py-0.5 text-[10px] font-medium text-[#8c8c8c]">
            群公告
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[#5f5f5f]">
            {announcement}
          </span>
        </button>
      ) : null}

      {routeContextNotice ? (
        <div
          className={
            isDesktop
              ? "border-b border-black/5 bg-[#f7f7f7] px-6 py-3"
              : "border-b border-black/6 bg-white/82 px-3 py-2.5"
          }
        >
          <InlineNotice tone="info" className="border-black/6 bg-white">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 flex-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                {routeContextNotice.description}
              </span>
              <div className="flex items-center justify-end gap-1.5">
                {routeContextNotice.secondaryActionLabel &&
                routeContextNotice.onSecondaryAction ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={routeContextNotice.onSecondaryAction}
                    className="shrink-0 rounded-full"
                  >
                    {routeContextNotice.secondaryActionLabel}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={routeContextNotice.onAction}
                  className="shrink-0 rounded-full"
                >
                  {routeContextNotice.actionLabel}
                </Button>
              </div>
            </div>
          </InlineNotice>
        </div>
      ) : null}

      <div className="relative flex-1 overflow-hidden">
        <div
          className={`absolute inset-0 ${
            isDesktop ? "bg-[#e9e9e9]" : "bg-[#ededed]"
          }`}
          style={buildChatBackgroundStyle(effectiveBackground)}
        />
        <div
          className={`absolute inset-0 ${
            isDesktop
              ? "bg-[rgba(245,245,245,0.64)]"
              : "bg-[rgba(237,237,237,0.72)]"
          }`}
        />

        {isDesktop && desktopCallPanelState ? (
          <div className="relative h-full p-5">
            <DesktopGroupCallPanel
              kind={desktopCallPanelState.kind}
              groupId={groupId}
              groupName={groupQuery.data?.name ?? "群聊"}
              members={membersQuery.data ?? []}
              lastSyncedCounts={
                lastPublishedCallCounts?.kind === desktopCallPanelState.kind &&
                lastPublishedCallCounts?.source === desktopCallPanelState.source
                  ? {
                      activeCount: lastPublishedCallCounts.activeCount,
                      totalCount: lastPublishedCallCounts.totalCount,
                    }
                  : null
              }
              inviteNoticePending={sendCallInviteMutation.isPending}
              endNoticePending={sendCallInviteMutation.isPending}
              onClose={() => setDesktopCallPanelState(null)}
              onPanelOpened={(counts) => {
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ongoing",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                  })
                  .then(() => {
                    setLastPublishedCallCounts({
                      kind: desktopCallPanelState.kind,
                      source: desktopCallPanelState.source,
                      activeCount: counts.activeCount,
                      totalCount: counts.totalCount,
                    });
                  });
              }}
              onOpenMobileHandoff={() => {
                void navigate({
                  to: "/desktop/mobile",
                  hash: buildDesktopMobileCallHandoffHash({
                    kind: desktopCallPanelState.kind,
                    conversationId: groupId,
                    conversationType: "group",
                    title: groupQuery.data?.name ?? "群聊",
                  }),
                });
              }}
              onSendInviteNotice={(counts) => {
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ongoing",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                  })
                  .then(() => {
                    setLastPublishedCallCounts({
                      kind: desktopCallPanelState.kind,
                      source: desktopCallPanelState.source,
                      activeCount: counts.activeCount,
                      totalCount: counts.totalCount,
                    });
                  });
              }}
              onEndCall={(counts) => {
                void sendCallInviteMutation
                  .mutateAsync({
                    kind: desktopCallPanelState.kind,
                    status: "ended",
                    activeCount: counts.activeCount,
                    totalCount: counts.totalCount,
                    source: desktopCallPanelState.source ?? "desktop",
                    durationMs: counts.durationMs,
                    startedAt: counts.startedAt,
                  })
                  .then(() => {
                    setLastPublishedCallCounts(null);
                    setDesktopCallPanelState(null);
                  });
              }}
            />
          </div>
        ) : (
          <div
            ref={scrollAnchorRef}
            className={`relative flex h-full flex-col overflow-auto ${
              isDesktop ? "px-7 py-5" : "px-3 py-4"
            }`}
            onScrollCapture={handleDismissRouteContextNotice}
          >
            {groupQuery.isError && groupQuery.error instanceof Error ? (
              <ErrorBlock className="mb-3" message={groupQuery.error.message} />
            ) : null}
            {membersQuery.isError && membersQuery.error instanceof Error ? (
              <ErrorBlock
                className="mb-3"
                message={membersQuery.error.message}
              />
            ) : null}
            {messagesQuery.isLoading ? (
              <LoadingBlock label="正在读取群消息..." />
            ) : null}
            {messagesQuery.isError && messagesQuery.error instanceof Error ? (
              <ErrorBlock message={messagesQuery.error.message} />
            ) : null}

            <ChatMessageList
              messages={orderedMessages}
              threadContext={{
                id: groupId,
                type: "group",
                title: groupQuery.data?.name ?? "群聊",
              }}
              groupMode
              showGroupMemberNicknames={
                groupQuery.data?.showMemberNicknames ?? true
              }
              variant={isDesktop ? "desktop" : "mobile"}
              highlightedMessageId={highlightedMessageId}
              hasOlderMessages={hasOlderMessages}
              loadingOlderMessages={
                messagesQuery.isFetching && loadMoreRequestRef.current !== null
              }
              onLoadOlderMessages={() => {
                void loadOlderMessages();
              }}
              unreadMarkerMessageId={unreadMarkerMessageId}
              unreadMarkerCount={initialUnreadCount}
              onReplyMessage={handleReplyMessage}
              onOpenGroupCallInvite={(input) => {
                if (isDesktop) {
                  setDesktopCallPanelState(input);
                  return;
                }

                void navigate({
                  to:
                    input.kind === "voice"
                      ? "/group/$groupId/voice-call"
                      : "/group/$groupId/video-call",
                  params: { groupId },
                  hash: buildMobileGroupCallRouteHash({
                    source: input.source,
                    activeCount: input.activeCount,
                    totalCount: input.totalCount,
                    recordedAt: input.recordedAt ?? undefined,
                    snapshotRecordedAt: input.snapshotRecordedAt ?? undefined,
                  }),
                });
              }}
              onSelectionModeChange={setSelectionModeActive}
              emptyState={
                !isDesktop &&
                !messagesQuery.isLoading &&
                !messagesQuery.isError ? (
                  <EmptyState
                    title="群里还没有消息"
                    description="发一条消息，让这个群先热起来。"
                  />
                ) : null
              }
            />
          </div>
        )}
        {!isDesktop &&
        !selectionModeActive &&
        (!isAtBottom || pendingCount > 0) ? (
          <div className="pointer-events-none absolute bottom-4 right-3 z-10">
            <div className="pointer-events-auto">
              <MobileChatScrollBottomButton
                pendingCount={pendingCount}
                onClick={() => scrollToBottom("smooth")}
              />
            </div>
          </div>
        ) : null}
      </div>

      {!selectionModeActive && !(isDesktop && desktopCallPanelState) ? (
        <ChatComposer
          value={text}
          placeholder="输入消息"
          variant={isDesktop ? "desktop" : "mobile"}
          pending={sendMutation.isPending}
          error={sendError}
          speechInput={{
            baseUrl,
            conversationId: groupId,
            enabled: runtimeConfig.appPlatform === "web",
          }}
          onChange={(value) => {
            handleDismissRouteContextNotice();
            setText(value);
          }}
          onSendSticker={async (sticker) => {
            await handleSendSticker(sticker);
            setReplyDraft(null);
          }}
          onSendAttachment={sendAttachmentMessage}
          onSendPresetText={handleSendPresetText}
          mentionCandidates={mentionCandidates}
          onOpenDesktopHistory={onToggleDesktopHistory}
          mobileShortcutRequest={mobileShortcutRequest}
          onMobileShortcutHandled={() => {
            setMobileShortcutRequest(null);
          }}
          replyPreview={replyPreview}
          onCancelReply={() => setReplyDraft(null)}
          onSubmit={() => void handleSubmit()}
        />
      ) : null}
    </div>
  );
}

function describeReplyPreview(message: ChatRenderableMessage) {
  const text = sanitizeDisplayedChatText(message.text);
  if (text) {
    return text;
  }

  if (message.type === "image") {
    return "[图片]";
  }

  if (message.type === "file") {
    return "[文件]";
  }

  if (message.type === "voice") {
    return "[语音]";
  }

  if (message.type === "contact_card") {
    return "[名片]";
  }

  if (message.type === "location_card") {
    return "[位置]";
  }

  if (message.type === "sticker") {
    return "[表情]";
  }

  return "消息";
}

function upsertGroupMessage(
  current: GroupMessage[] | undefined,
  incoming: GroupMessage,
) {
  if (!current?.length) {
    return [incoming];
  }

  const existingIndex = current.findIndex(
    (message) => message.id === incoming.id,
  );
  if (existingIndex < 0) {
    return [...current, incoming];
  }

  const nextMessages = [...current];
  nextMessages[existingIndex] = incoming;
  return nextMessages;
}

const INITIAL_MESSAGE_LIMIT = 60;
const HISTORY_PAGE_SIZE = 40;
