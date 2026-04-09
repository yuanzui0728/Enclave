import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Ellipsis, Phone, Video } from "lucide-react";
import { getGroup, getGroupMembers, getGroupMessages, sendGroupMessage } from "@yinjie/contracts";
import { AppPage, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
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
  const baseUrl = runtimeConfig.apiBaseUrl;
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
  const scrollAnchorRef = useScrollAnchor<HTMLDivElement>(`${groupId}:${messagesQuery.data?.length ?? 0}`);

  useEffect(() => {
    setText("");
  }, [baseUrl, groupId]);

  const sendMutation = useMutation({
    mutationFn: () => sendGroupMessage(groupId, { text: text.trim() }, baseUrl),
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
    <AppPage className="flex h-full min-h-0 flex-col space-y-0 bg-[linear-gradient(180deg,#f8fcf8,#f2f8f5)] px-0 py-0">
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,248,239,0.94))] px-3 py-2.5">
          <Button
            onClick={() => navigate({ to: "/tabs/chat" })}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border border-white/70 bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </Button>
          <AvatarChip name={groupQuery.data?.name ?? "群聊"} size="wechat" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">{groupQuery.data?.name ?? "群聊"}</div>
            <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">{membersQuery.data?.length ?? 0}人群聊</div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] hover:bg-white/72" aria-label="语音通话">
              <Phone size={18} />
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] hover:bg-white/72" aria-label="视频通话">
              <Video size={18} />
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] hover:bg-white/72" aria-label="更多操作">
              <Ellipsis size={18} />
            </button>
          </div>
        </header>

        <div className="border-b border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,248,239,0.94))] px-3 pb-3">
          {groupQuery.isError && groupQuery.error instanceof Error ? <ErrorBlock className="mb-2" message={groupQuery.error.message} /> : null}
          {membersQuery.isError && membersQuery.error instanceof Error ? <ErrorBlock className="mb-2" message={membersQuery.error.message} /> : null}
          <div className="flex gap-2 overflow-auto">
            {membersQuery.isLoading ? (
              <InlineNotice className="rounded-full border-white/70 bg-white/82 px-3 py-2 text-xs text-[color:var(--text-muted)]" tone="muted">
                正在读取成员...
              </InlineNotice>
            ) : null}
            {(membersQuery.data ?? []).map((member) => (
              <div key={member.id} className="flex min-w-fit items-center gap-2 rounded-full border border-white/80 bg-white/88 px-2.5 py-1.5 shadow-[var(--shadow-soft)]">
                <AvatarChip name={member.memberName ?? member.memberId} src={member.memberAvatar} size="sm" />
                <span className="text-xs text-[color:var(--text-secondary)]">{member.memberName ?? member.memberId}</span>
              </div>
            ))}
          </div>
        </div>

        <div ref={scrollAnchorRef} className="flex-1 overflow-auto px-3 py-4">
          {messagesQuery.isLoading ? <LoadingBlock label="正在读取群消息..." /> : null}
          {messagesQuery.isError && messagesQuery.error instanceof Error ? <ErrorBlock message={messagesQuery.error.message} /> : null}

          <ChatMessageList
            messages={orderedMessages}
            groupMode
            emptyState={
              !messagesQuery.isLoading && !messagesQuery.isError ? (
                <EmptyState title="群里还没有消息" description="发一条消息，让这个群先热起来。" />
              ) : null
            }
          />
        </div>

        <ChatComposer
          value={text}
          placeholder="输入消息"
          pending={sendMutation.isPending}
          error={sendError}
          onChange={setText}
          onSubmit={() => sendMutation.mutate()}
        />
      </div>
    </AppPage>
  );
}
