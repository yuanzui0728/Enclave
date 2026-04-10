import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  getGroup,
  getGroupMembers,
  getGroupMessages,
  markGroupRead,
  sendGroupMessage,
  uploadChatAttachment,
} from "@yinjie/contracts";
import { ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { ChatComposer } from "../../components/chat-composer";
import { ChatMessageList } from "../../components/chat-message-list";
import { EmptyState } from "../../components/empty-state";
import {
  DesktopChatHeaderActions,
  type DesktopChatCallKind,
  type DesktopChatSidePanelMode,
} from "../desktop/chat/desktop-chat-header-actions";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { MobileChatThreadHeader } from "./mobile-chat-thread-header";
import { useDefaultChatBackground } from "./backgrounds/use-conversation-background";
import { useScrollAnchor } from "../../hooks/use-scroll-anchor";
import { parseTimestamp } from "../../lib/format";
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
}: GroupChatThreadPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerQuery = useDefaultChatBackground();
  const [text, setText] = useState("");
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
  const scrollAnchorRef = useScrollAnchor<HTMLDivElement>(
    `${groupId}:${messagesQuery.data?.length ?? 0}`,
  );

  useEffect(() => {
    setText("");
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
  const defaultBackground = ownerQuery.data?.defaultChatBackground ?? null;

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
        attachment: result.attachment,
      });
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
        attachment: result.attachment,
      });
      return;
    }

    if (payload.type === "contact_card") {
      await sendMutation.mutateAsync({
        type: "contact_card",
        attachment: payload.attachment,
      });
      return;
    }

    await sendMutation.mutateAsync({
      type: "location_card",
      attachment: payload.attachment,
    });
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDesktop
          ? "bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(255,247,238,0.98))]"
          : "bg-[linear-gradient(180deg,#f8fcf8,#f2f8f5)]"
      }`}
    >
      {isDesktop ? (
        <header className="flex items-center gap-3 border-b border-black/6 bg-[#f7f7f7] px-5 py-3.5">
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
              onSelectCall={(kind) => onDesktopCallAction?.(kind)}
            />
          </div>
        </header>
      ) : (
        <MobileChatThreadHeader
          title={groupQuery.data?.name ?? "群聊"}
          subtitle={`${membersQuery.data?.length ?? 0} 人群聊`}
          onBack={onBack}
          onMore={() => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
            });
          }}
        />
      )}

      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute inset-0 bg-[linear-gradient(180deg,#fffdf7,#fff9ee)]"
          style={buildChatBackgroundStyle(defaultBackground)}
        />
        <div className="absolute inset-0 bg-[rgba(255,250,244,0.30)]" />

        <div
          ref={scrollAnchorRef}
          className={`relative flex h-full flex-col overflow-auto ${
            isDesktop ? "px-8 py-6" : "px-3 py-4"
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
            groupMode
            variant={isDesktop ? "desktop" : "mobile"}
            highlightedMessageId={highlightedMessageId}
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
      </div>

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
        onSendAttachment={sendAttachmentMessage}
        onSubmit={() =>
          sendMutation.mutate({
            text: text.trim(),
          })
        }
      />
    </div>
  );
}
