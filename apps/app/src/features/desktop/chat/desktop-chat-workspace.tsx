import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import {
  getBlockedCharacters,
  getConversations,
  type ConversationListItem,
} from "@yinjie/contracts";
import { ErrorBlock, LoadingBlock, TextField } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { formatTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import { ConversationThreadPanel } from "../../chat/conversation-thread-panel";

type DesktopChatWorkspaceProps = {
  selectedConversationId?: string;
};

export function DesktopChatWorkspace({ selectedConversationId }: DesktopChatWorkspaceProps) {
  const ownerId = useWorldOwnerStore((state) => state.id);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchTerm, setSearchTerm] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(ownerId),
  });

  const blockedQuery = useQuery({
    queryKey: ["app-chat-blocked-characters", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(ownerId),
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

  const filteredConversations = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return conversations;
    }

    return conversations.filter((conversation) => {
      const title = conversation.title.toLowerCase();
      const preview = conversation.lastMessage?.text?.toLowerCase() ?? "";
      return title.includes(keyword) || preview.includes(keyword);
    });
  }, [conversations, searchTerm]);

  const unreadMessageCount = useMemo(
    () => filteredConversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [filteredConversations],
  );

  const activeConversation = useMemo(() => {
    if (!filteredConversations.length) {
      return null;
    }

    if (selectedConversationId) {
      return filteredConversations.find((conversation) => conversation.id === selectedConversationId) ?? filteredConversations[0];
    }

    return filteredConversations[0];
  }, [filteredConversations, selectedConversationId]);

  useEffect(() => {
    if (!activeConversation) {
      setInspectorOpen(false);
    }
  }, [activeConversation]);

  return (
    <div className="relative flex h-full min-h-0">
      <section className="flex w-[320px] shrink-0 flex-col border-r border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(246,247,249,0.98),rgba(242,244,247,0.98))]">
        <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-4">
          <div className="flex items-center justify-end">
            <div className="text-xs text-[color:var(--text-muted)]">
              {filteredConversations.length} / {unreadMessageCount}
            </div>
          </div>
          <div className="mt-3">
            <TextField
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索"
              className="rounded-[18px] border-[rgba(15,23,42,0.06)] bg-white/92 px-4 py-2.5 shadow-none hover:bg-white focus:shadow-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
          {conversationsQuery.isLoading ? <LoadingBlock label="正在读取会话..." /> : null}
          {conversationsQuery.isError && conversationsQuery.error instanceof Error ? (
            <ErrorBlock message={conversationsQuery.error.message} />
          ) : null}
          {blockedQuery.isError && blockedQuery.error instanceof Error ? (
            <ErrorBlock message={blockedQuery.error.message} />
          ) : null}

          <div className="space-y-1.5">
            {filteredConversations.map((conversation) => (
              <ConversationCard
                key={conversation.id}
                active={conversation.id === activeConversation?.id}
                conversation={conversation}
              />
            ))}
          </div>

          {!conversationsQuery.isLoading && !filteredConversations.length ? (
            <div className="pt-4">
              <EmptyState
                title={searchTerm.trim() ? "没有匹配的会话" : "还没有任何会话"}
                description={searchTerm.trim() ? "换个关键词试试。" : "等第一条消息出现后，这里就会开始热起来。"}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="min-w-0 flex-1">
        {activeConversation ? (
          <ConversationThreadPanel
            conversationId={activeConversation.id}
            variant="desktop"
            inspectorOpen={inspectorOpen}
            onToggleInspector={() => setInspectorOpen((current) => !current)}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-10">
            <EmptyState
              title="先选择一个会话"
              description="会话列表会固定停留在左侧，当前对话会始终停留在中间区域。"
            />
          </div>
        )}
      </section>

      {activeConversation && inspectorOpen ? (
        <aside className="absolute bottom-0 right-0 top-[73px] z-20 hidden w-[280px] border-l border-[rgba(15,23,42,0.06)] bg-[rgba(248,249,251,0.98)] shadow-[-8px_0_24px_rgba(15,23,42,0.08)] xl:flex xl:flex-col">
          <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.06)] px-5 py-5">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-[color:var(--text-primary)]">
                {activeConversation.title}
              </div>
              <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                {activeConversation.type === "group" ? "群聊" : "单聊"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectorOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-white"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div className="rounded-[20px] border border-white/80 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
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

            <div className="rounded-[20px] border border-white/80 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
              <div className="grid grid-cols-1 gap-2">
                <Link
                  to="/tabs/contacts"
                  className="rounded-[14px] bg-[rgba(15,23,42,0.04)] px-3 py-3 text-sm text-[color:var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.07)] hover:text-[color:var(--text-primary)]"
                >
                  通讯录
                </Link>
                <Link
                  to="/tabs/profile"
                  className="rounded-[14px] bg-[rgba(15,23,42,0.04)] px-3 py-3 text-sm text-[color:var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.07)] hover:text-[color:var(--text-primary)]"
                >
                  我的资料
                </Link>
              </div>
            </div>
          </div>
        </aside>
      ) : null}
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
          ? "flex items-center gap-3 rounded-[18px] border border-transparent bg-[rgba(226,230,235,0.96)] px-4 py-3"
          : "flex items-center gap-3 rounded-[18px] border border-transparent bg-transparent px-4 py-3 transition-[background-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[rgba(255,255,255,0.82)]"
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
            <div className="min-w-6 rounded-full bg-[rgba(7,193,96,0.92)] px-2 py-0.5 text-center text-[11px] text-white">
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
    <div className="rounded-[20px] border border-white/80 bg-white/90 p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-3 text-base font-medium text-[color:var(--text-primary)]">{value}</div>
    </div>
  );
}
