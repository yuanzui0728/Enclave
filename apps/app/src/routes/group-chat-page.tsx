import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { getGroup, getGroupMembers, getGroupMessages, sendGroupMessage } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, LoadingBlock, InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { ChatComposer } from "../components/chat-composer";
import { ChatMessageList } from "../components/chat-message-list";
import { EmptyState } from "../components/empty-state";
import { useScrollAnchor } from "../hooks/use-scroll-anchor";
import { parseTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupChatPage() {
  const { groupId } = useParams({ from: "/group/$groupId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const [text, setText] = useState("");

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId),
  });

  const messagesQuery = useQuery({
    queryKey: ["app-group-messages", baseUrl, groupId],
    queryFn: () => getGroupMessages(groupId),
    refetchInterval: 3_000,
  });
  const scrollAnchorRef = useScrollAnchor<HTMLDivElement>([groupId, messagesQuery.data?.length ?? 0]);

  useEffect(() => {
    setText("");
  }, [baseUrl, groupId]);

  const sendMutation = useMutation({
    mutationFn: () =>
      sendGroupMessage(groupId, { text: text.trim() }, baseUrl),
    onSuccess: async () => {
      setText("");
      await queryClient.invalidateQueries({ queryKey: ["app-group-messages", baseUrl, groupId] });
    },
  });
  const orderedMessages = useMemo(
    () =>
      [...(messagesQuery.data ?? [])].sort(
        (left, right) => (parseTimestamp(left.createdAt) ?? 0) - (parseTimestamp(right.createdAt) ?? 0),
      ),
    [messagesQuery.data],
  );

  const sendError = sendMutation.error instanceof Error ? sendMutation.error.message : null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center gap-3 border-b border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(7,12,20,0.3),rgba(7,12,20,0.5))] px-5 py-4 backdrop-blur-xl">
        <Button
          onClick={() => navigate({ to: "/tabs/chat" })}
          variant="ghost"
          size="icon"
          className="text-[color:var(--text-secondary)]"
        >
          <ArrowLeft size={18} />
        </Button>
        <AvatarChip name={groupQuery.data?.name ?? "群聊"} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">{groupQuery.data?.name ?? "群聊"}</div>
          <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
            {membersQuery.data?.length ?? 0} 位成员
          </div>
        </div>
      </header>

      <div className="border-b border-[color:var(--border-faint)] px-5 py-3">
        {groupQuery.isError && groupQuery.error instanceof Error ? <ErrorBlock className="mb-3" message={groupQuery.error.message} /> : null}
        {membersQuery.isError && membersQuery.error instanceof Error ? <ErrorBlock className="mb-3" message={membersQuery.error.message} /> : null}
        <div className="flex gap-2 overflow-auto">
          {membersQuery.isLoading ? (
            <InlineNotice className="rounded-full px-3 py-2 text-xs" tone="muted">正在读取成员...</InlineNotice>
          ) : null}
          {(membersQuery.data ?? []).map((member) => (
            <div key={member.id} className="flex min-w-fit items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 shadow-[var(--shadow-soft)]">
              <AvatarChip name={member.memberName ?? member.memberId} src={member.memberAvatar} size="sm" />
              <span className="text-xs text-[color:var(--text-secondary)]">{member.memberName ?? member.memberId}</span>
            </div>
          ))}
        </div>
      </div>

      <div ref={scrollAnchorRef} className="flex-1 space-y-4 overflow-auto px-5 py-5">
        {messagesQuery.isLoading ? <LoadingBlock label="正在读取群消息..." /> : null}

        {messagesQuery.isError && messagesQuery.error instanceof Error ? <ErrorBlock message={messagesQuery.error.message} /> : null}

        <ChatMessageList
          messages={orderedMessages}
          groupMode
          emptyState={
            !messagesQuery.isLoading && !messagesQuery.isError ? (
              <EmptyState title="群里还没人开口" description="发出第一条消息，看看谁会先回应你。" />
            ) : null
          }
        />
      </div>

      <ChatComposer
        value={text}
        placeholder="发送群消息"
        pending={sendMutation.isPending}
        error={sendError}
        onChange={setText}
        onSubmit={() => sendMutation.mutate()}
      />
    </div>
  );
}
