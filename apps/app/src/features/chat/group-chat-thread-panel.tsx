import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getGroup,
  getGroupMembers,
  getGroupMessages,
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
import { type ChatRenderableMessage } from "../../components/chat-message-list";
import { type ChatRouteContextNotice } from "./conversation-thread-panel";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { MobileChatScrollBottomButton } from "./mobile-chat-scroll-bottom-button";
import { MobileChatThreadHeader } from "./mobile-chat-thread-header";
import { useGroupBackground } from "./backgrounds/use-conversation-background";
import { useScrollAnchor } from "../../hooks/use-scroll-anchor";
import { formatTimestamp, parseTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

type GroupChatThreadPanelProps = {
  groupId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
  desktopSidePanelMode?: DesktopChatSidePanelMode;
  onToggleDesktopHistory?: () => void;
  onToggleDesktopDetails?: () => void;
  onDesktopCallAction?: (kind: DesktopChatCallKind) => void;
  highlightedMessageId?: string;
  routeContextNotice?: ChatRouteContextNotice;
};

export function GroupChatThreadPanel({
  groupId,
  variant = "mobile",
  onBack,
  desktopSidePanelMode = null,
  onToggleDesktopHistory,
  onToggleDesktopDetails,
  onDesktopCallAction,
  highlightedMessageId,
  routeContextNotice,
}: GroupChatThreadPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const backgroundQuery = useGroupBackground(groupId);
  const [text, setText] = useState("");
  const [replyDraft, setReplyDraft] = useState<ChatReplyMetadata | null>(null);
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const isDesktop = variant === "desktop";

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });

  const messagesQuery = useQuery({
    queryKey: ["app-group-messages", baseUrl, groupId],
    queryFn: () => getGroupMessages(groupId, baseUrl),
    refetchInterval: 3_000,
  });
  const {
    ref: scrollAnchorRef,
    isAtBottom,
    pendingCount,
    scrollToBottom,
  } = useScrollAnchor<HTMLDivElement>(messagesQuery.data?.length ?? 0);

  useEffect(() => {
    setText("");
    setReplyDraft(null);
    setSelectionModeActive(false);
  }, [baseUrl, groupId]);

  useEffect(() => {
    if (!groupId) {
      return;
    }

    void markGroupRead(groupId, baseUrl).then(() => {
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    });
  }, [baseUrl, groupId, messagesQuery.data?.length, queryClient]);

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

  const sendError =
    sendMutation.error instanceof Error ? sendMutation.error.message : null;
  const effectiveBackground = backgroundQuery.data?.effectiveBackground ?? null;
  const announcement = groupQuery.data?.announcement?.trim() ?? "";
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
      void navigate({
        to: "/desktop/mobile",
        hash: buildDesktopMobileCallHandoffHash({
          kind,
          conversationId: groupId,
          conversationType: "group",
          title: groupQuery.data?.name ?? "群聊",
        }),
      });
      return;
    }

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
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
              {groupQuery.data?.name ?? "群聊"}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
              {membersQuery.data?.length ?? 0} 人群聊
            </div>
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
          onMore={() => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
            });
          }}
        />
      )}

      {isDesktop && announcement ? (
        <button
          type="button"
          onClick={() => {
            void navigate({
              to: "/group/$groupId/announcement",
              params: { groupId },
            });
          }}
          className="flex items-start gap-3 border-b border-black/5 bg-[#f7f7f7] px-6 py-3 text-left transition hover:bg-white"
        >
          <span className="mt-0.5 shrink-0 rounded-full bg-[rgba(7,193,96,0.10)] px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] text-[#07a35a]">
            群公告
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-[color:var(--text-primary)]">
              {announcement}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
              最近更新 {formatTimestamp(groupQuery.data?.updatedAt)}
            </div>
          </div>
        </button>
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
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs leading-6 text-[color:var(--text-secondary)]">
                {routeContextNotice.description}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={routeContextNotice.onAction}
                className="shrink-0 rounded-full"
              >
                {routeContextNotice.actionLabel}
              </Button>
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

        <div
          ref={scrollAnchorRef}
          className={`relative flex h-full flex-col overflow-auto ${
            isDesktop ? "px-7 py-5" : "px-3 py-4"
          }`}
        >
          {groupQuery.isError && groupQuery.error instanceof Error ? (
            <ErrorBlock className="mb-3" message={groupQuery.error.message} />
          ) : null}
          {membersQuery.isError && membersQuery.error instanceof Error ? (
            <ErrorBlock className="mb-3" message={membersQuery.error.message} />
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
            onReplyMessage={handleReplyMessage}
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

      {!selectionModeActive ? (
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
          onChange={setText}
          onSendSticker={async (sticker) => {
            await handleSendSticker(sticker);
            setReplyDraft(null);
          }}
          onSendAttachment={sendAttachmentMessage}
          onSendPresetText={handleSendPresetText}
          mentionCandidates={mentionCandidates}
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
