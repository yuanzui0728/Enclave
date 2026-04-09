import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  getBlockedCharacters,
  getConversations,
  getFriends,
  getOrCreateConversation,
  type ConversationListItem,
} from "@yinjie/contracts";
import { ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { ConversationThreadPanel } from "../../chat/conversation-thread-panel";
import { formatTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";

type NoticeState = {
  tone: "success" | "danger";
  message: string;
};

type DesktopChatWorkspaceProps = {
  selectedConversationId?: string;
};

export function DesktopChatWorkspace({ selectedConversationId }: DesktopChatWorkspaceProps) {
  const navigate = useNavigate();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends-quick-start", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: Boolean(ownerId),
  });

  const blockedQuery = useQuery({
    queryKey: ["app-chat-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
  });

  const startChatMutation = useMutation({
    mutationFn: async (characterId: string) => {
      if (!ownerId) {
        throw new Error("Missing world owner.");
      }

      return getOrCreateConversation({ characterId }, baseUrl);
    },
    onSuccess: (conversation) => {
      void navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    },
    onError: (error) => {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "Unable to start this conversation right now.",
      });
    },
  });

  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );

  const conversations = useMemo(
    () =>
      (conversationsQuery.data ?? []).filter(
        (conversation) =>
          conversation.type !== "direct" || !conversation.participants.some((id) => blockedCharacterIds.has(id)),
      ),
    [blockedCharacterIds, conversationsQuery.data],
  );

  const quickStart = useMemo(
    () =>
      (friendsQuery.data ?? [])
        .filter(({ character }) => !blockedCharacterIds.has(character.id))
        .slice(0, 6),
    [blockedCharacterIds, friendsQuery.data],
  );
  const unreadMessageCount = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  );

  const activeConversation = useMemo(() => {
    if (!conversations.length) {
      return null;
    }

    if (selectedConversationId) {
      return conversations.find((conversation) => conversation.id === selectedConversationId) ?? conversations[0];
    }

    return conversations[0];
  }, [conversations, selectedConversationId]);

  const resetStartChatState = useEffectEvent(() => {
    setNotice(null);
    startChatMutation.reset();
  });

  useEffect(() => {
    resetStartChatState();
  }, [baseUrl, ownerId, resetStartChatState]);

  return (
    <div className="flex h-full min-h-0">
      <section className="flex w-[360px] shrink-0 flex-col border-r border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,252,249,0.96))]">
        <div className="border-b border-white/80 px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--brand-secondary)]">Workspace</div>
          <div className="mt-3 text-2xl font-semibold text-[color:var(--text-primary)]">桌面会话工作台</div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            列表、对话和资料栏同时常驻，阅读、回复和查看关系都不需要跳出当前节奏。
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <WorkspaceMetric label="会话" value={String(conversations.length)} />
            <WorkspaceMetric label="未读" value={String(unreadMessageCount)} />
            <WorkspaceMetric label="快捷入口" value={String(quickStart.length)} />
          </div>
        </div>

        <div className="border-b border-white/80 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">快速开始</div>
            <Link to="/tabs/contacts" className="text-xs text-[color:var(--brand-secondary)]">
              通讯录
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {quickStart.map(({ character }) => (
              <button
                key={character.id}
                type="button"
                onClick={() => startChatMutation.mutate(character.id)}
                disabled={startChatMutation.isPending}
                className="rounded-[22px] border border-white/80 bg-white/86 p-3 text-left shadow-[var(--shadow-soft)] transition-[background-color,transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--shadow-card)]"
              >
                <AvatarChip name={character.name} src={character.avatar} />
                <div className="mt-3 line-clamp-1 text-sm font-medium text-[color:var(--text-primary)]">{character.name}</div>
                <div className="mt-1 line-clamp-1 text-[11px] text-[color:var(--text-muted)]">
                  {startChatMutation.variables === character.id && startChatMutation.isPending
                    ? "正在建立会话..."
                    : character.relationship}
                </div>
              </button>
            ))}
          </div>
          {!quickStart.length && !friendsQuery.isLoading ? (
            <div className="mt-3 text-xs text-[color:var(--text-muted)]">先去通讯录认识一些人，这里会出现更顺手的快捷入口。</div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {notice ? <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice> : null}
          {conversationsQuery.isLoading ? <LoadingBlock label="正在读取会话..." /> : null}
          {conversationsQuery.isError && conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? <ErrorBlock message={friendsQuery.error.message} /> : null}

          <div className="space-y-2">
            {conversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                active={conversation.id === activeConversation?.id}
                conversation={conversation}
              />
            ))}
          </div>

          {!conversationsQuery.isLoading && !conversations.length ? (
            <div className="pt-4">
              <EmptyState
                title="还没有任何会话"
                description="先去通讯录认识一些人，等第一条消息出现后，这里就会慢慢热起来。"
                action={
                  <Link
                    to="/tabs/contacts"
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-2 text-sm text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                  >
                    去通讯录
                  </Link>
                }
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 flex-1">
        {activeConversation ? (
          <ConversationThreadPanel conversationId={activeConversation.id} variant="desktop" />
        ) : (
          <div className="flex h-full items-center justify-center px-10">
            <EmptyState
              title="先选择一个会话"
              description="会话会停留在中间区域，右侧资料也会跟着一起更新。"
            />
          </div>
        )}
      </section>

      <aside className="hidden w-[300px] shrink-0 border-l border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,252,249,0.96))] xl:flex xl:flex-col">
        <div className="border-b border-white/80 px-5 py-5">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--text-muted)]">Inspector</div>
          <div className="mt-3 text-lg font-semibold text-[color:var(--text-primary)]">会话资料</div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            当前会话的信息会固定停留在右侧，方便边聊边看。
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          {activeConversation ? (
            <>
              <div className="rounded-[24px] border border-white/80 bg-white/86 p-4 shadow-[var(--shadow-soft)]">
                <div className="flex items-center gap-3">
                  <AvatarChip name={activeConversation.title} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">{activeConversation.title}</div>
                    <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {activeConversation.type === "group" ? "群聊" : "单聊"}
                    </div>
                  </div>
                </div>
              </div>

              <DetailMetric label="参与成员" value={String(activeConversation.participants.length || 1)} />
              <DetailMetric
                label="最后活跃"
                value={formatTimestamp(activeConversation.lastMessage?.createdAt ?? activeConversation.updatedAt)}
              />
              <DetailMetric
                label="未读消息"
                value={activeConversation.unreadCount > 0 ? String(activeConversation.unreadCount) : "已读"}
              />

              <div className="rounded-[24px] border border-white/80 bg-white/86 p-4 shadow-[var(--shadow-soft)]">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">快捷操作</div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <Link to="/tabs/contacts" className="rounded-[18px] bg-[rgba(255,138,61,0.08)] px-3 py-3 text-sm text-[color:var(--text-secondary)] transition hover:bg-[rgba(255,138,61,0.12)] hover:text-[color:var(--text-primary)]">
                    查看通讯录
                  </Link>
                  <Link to="/tabs/profile" className="rounded-[18px] bg-[rgba(255,138,61,0.08)] px-3 py-3 text-sm text-[color:var(--text-secondary)] transition hover:bg-[rgba(255,138,61,0.12)] hover:text-[color:var(--text-primary)]">
                    打开我的资料
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[color:var(--border-faint)] px-4 py-5 text-sm leading-7 text-[color:var(--text-muted)]">
              选择一个会话后，这里会显示会话资料和快捷入口。
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ConversationCard({
  active,
  conversation,
}: {
  active: boolean;
  conversation: ConversationListItem;
}) {
  return (
    <Link
      to="/chat/$conversationId"
      params={{ conversationId: conversation.id }}
      className={
        active
          ? "flex items-center gap-3 rounded-[24px] border border-[color:var(--border-brand)] bg-[linear-gradient(135deg,rgba(255,246,232,0.96),rgba(255,255,255,0.92))] px-4 py-4 shadow-[var(--shadow-card)]"
          : "flex items-center gap-3 rounded-[24px] border border-transparent bg-white/72 px-4 py-4 transition-[background-color,transform,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-[color:var(--border-faint)] hover:bg-white/92 hover:shadow-[var(--shadow-soft)]"
      }
    >
      <AvatarChip name={conversation.title} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">{conversation.title}</div>
          <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
            {formatTimestamp(conversation.lastMessage?.createdAt ?? conversation.updatedAt)}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="truncate text-sm text-[color:var(--text-secondary)]">
            {conversation.lastMessage?.text ?? "从这里开始第一句问候"}
          </div>
          {conversation.unreadCount > 0 ? (
            <div className="min-w-6 rounded-full bg-[var(--brand-gradient)] px-2 py-0.5 text-center text-[11px] text-white shadow-[var(--shadow-soft)]">
              {conversation.unreadCount}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/80 bg-white/86 p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-3 text-base font-medium text-[color:var(--text-primary)]">{value}</div>
    </div>
  );
}

function WorkspaceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] bg-white/86 px-3 py-3 shadow-[var(--shadow-soft)]">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-base font-semibold text-[color:var(--text-primary)]">{value}</div>
    </div>
  );
}
