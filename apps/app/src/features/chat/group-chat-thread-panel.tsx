import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Ellipsis, Phone, Video } from "lucide-react";
import {
  getGroup,
  getGroupMembers,
  getGroupMessages,
  sendGroupMessage,
  uploadChatAttachment,
} from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { ChatComposer } from "../../components/chat-composer";
import { ChatMessageList } from "../../components/chat-message-list";
import { EmptyState } from "../../components/empty-state";
import { type ChatComposerAttachmentPayload } from "./chat-plus-types";
import { buildChatBackgroundStyle } from "./backgrounds/chat-background-helpers";
import { useDefaultChatBackground } from "./backgrounds/use-conversation-background";
import { useScrollAnchor } from "../../hooks/use-scroll-anchor";
import { parseTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

type GroupChatThreadPanelProps = {
  groupId: string;
  variant?: "mobile" | "desktop";
  onBack?: () => void;
};

export function GroupChatThreadPanel({
  groupId,
  variant = "mobile",
  onBack,
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

  const sendError =
    sendMutation.error instanceof Error ? sendMutation.error.message : null;
  const defaultBackground = ownerQuery.data?.defaultChatBackground ?? null;

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
        text: `[图片] ${result.attachment.fileName}`,
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
        text: `[文件] ${result.attachment.fileName}`,
        attachment: result.attachment,
      });
      return;
    }

    if (payload.type === "contact_card") {
      await sendMutation.mutateAsync({
        type: "contact_card",
        text: `[名片] ${payload.attachment.name}`,
        attachment: payload.attachment,
      });
      return;
    }

    await sendMutation.mutateAsync({
      type: "location_card",
      text: `[位置] ${payload.attachment.title}`,
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
      <header
        className={
          isDesktop
            ? "border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,254,249,0.96),rgba(255,248,239,0.96))] px-5 py-4"
            : "border-b border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,248,239,0.94))] px-3 pb-3 pt-3"
        }
      >
        <div className="flex items-start gap-2.5">
          {!isDesktop && onBack ? (
            <Button
              onClick={onBack}
              variant="ghost"
              size="icon"
              className="mt-0.5 h-9 w-9 shrink-0 rounded-full border border-white/70 bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
              aria-label="返回"
            >
              <ArrowLeft size={18} />
            </Button>
          ) : null}
          <div className="shrink-0">
            <AvatarChip name={groupQuery.data?.name ?? "群聊"} size="wechat" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
              {groupQuery.data?.name ?? "群聊"}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
              {membersQuery.data?.length ?? 0} 人群聊
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigate({
                to: "/group/$groupId/details",
                params: { groupId },
              });
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/65 bg-white/72 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
            aria-label="更多操作"
          >
            <Ellipsis size={18} />
          </button>
        </div>

        {!isDesktop ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="flex h-9 min-w-[92px] items-center justify-center gap-1.5 rounded-full border border-white/65 bg-white/78 px-3 text-[13px] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
              aria-label="语音通话"
            >
              <Phone size={16} />
              <span>语音</span>
            </button>
            <button
              type="button"
              className="flex h-9 min-w-[92px] items-center justify-center gap-1.5 rounded-full border border-white/65 bg-white/78 px-3 text-[13px] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
              aria-label="视频通话"
            >
              <Video size={16} />
              <span>视频</span>
            </button>
          </div>
        ) : null}
      </header>

      <div
        className={
          isDesktop
            ? "border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,254,249,0.96),rgba(255,248,239,0.92))] px-5 py-3"
            : "border-b border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,248,239,0.94))] px-3 pb-3"
        }
      >
        {groupQuery.isError && groupQuery.error instanceof Error ? (
          <ErrorBlock className="mb-2" message={groupQuery.error.message} />
        ) : null}
        {membersQuery.isError && membersQuery.error instanceof Error ? (
          <ErrorBlock className="mb-2" message={membersQuery.error.message} />
        ) : null}
        <div className="flex gap-2 overflow-auto">
          {membersQuery.isLoading ? (
            <InlineNotice
              className="rounded-full border-white/70 bg-white/82 px-3 py-2 text-xs text-[color:var(--text-muted)]"
              tone="muted"
            >
              正在读取成员...
            </InlineNotice>
          ) : null}
          {(membersQuery.data ?? []).map((member) => (
            <div
              key={member.id}
              className="flex min-w-fit items-center gap-2 rounded-full border border-white/80 bg-white/88 px-2.5 py-1.5 shadow-[var(--shadow-soft)]"
            >
              <AvatarChip
                name={member.memberName ?? member.memberId}
                src={member.memberAvatar}
                size="sm"
              />
              <span className="text-xs text-[color:var(--text-secondary)]">
                {member.memberName ?? member.memberId}
              </span>
            </div>
          ))}
        </div>
      </div>

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
          {messagesQuery.isLoading ? <LoadingBlock label="正在读取群消息..." /> : null}
          {messagesQuery.isError && messagesQuery.error instanceof Error ? (
            <ErrorBlock message={messagesQuery.error.message} />
          ) : null}

          <ChatMessageList
            messages={orderedMessages}
            groupMode
            variant={isDesktop ? "desktop" : "mobile"}
            emptyState={
              !messagesQuery.isLoading && !messagesQuery.isError ? (
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
