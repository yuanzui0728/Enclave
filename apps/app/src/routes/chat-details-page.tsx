import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  blockCharacter,
  clearConversationHistory,
  createModerationReport,
  getBlockedCharacters,
  getCharacter,
  getConversations,
  getFriends,
  sendFriendRequest,
  setConversationMuted,
  setConversationPinned,
} from "@yinjie/contracts";
import { ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { useConversationBackground } from "../features/chat/backgrounds/use-conversation-background";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { ChatMemberGrid } from "../features/chat-details/chat-member-grid";
import {
  readDirectChatDetailPreferences,
  writeDirectChatDetailPreferences,
} from "../features/chat-details/chat-detail-preferences";
import { ChatSettingRow } from "../features/chat-details/chat-setting-row";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ChatDetailsPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/details",
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username) ?? "我";
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const [notice, setNotice] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(() =>
    readDirectChatDetailPreferences(conversationId),
  );

  useEffect(() => {
    setPreferences(readDirectChatDetailPreferences(conversationId));
    setNotice(null);
  }, [conversationId]);

  useEffect(() => {
    writeDirectChatDetailPreferences(conversationId, preferences);
  }, [conversationId, preferences]);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const conversation = useMemo(
    () =>
      (conversationsQuery.data ?? []).find(
        (item) => item.id === conversationId,
      ) ?? null,
    [conversationId, conversationsQuery.data],
  );
  const backgroundQuery = useConversationBackground(conversationId);
  const targetCharacterId = conversation?.participants[0] ?? "";

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, targetCharacterId],
    queryFn: () => getCharacter(targetCharacterId, baseUrl),
    enabled: Boolean(targetCharacterId),
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });

  const blockedQuery = useQuery({
    queryKey: ["app-chat-details-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: Boolean(targetCharacterId),
  });

  const targetCharacter = characterQuery.data;
  const isPinned = conversation?.isPinned ?? false;
  const isFriend = (friendsQuery.data ?? []).some(
    (item) => item.character.id === targetCharacterId,
  );
  const isBlocked = (blockedQuery.data ?? []).some(
    (item) => item.characterId === targetCharacterId,
  );

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) =>
      setConversationPinned(conversationId, { pinned }, baseUrl),
    onSuccess: async (_, pinned) => {
      setNotice(pinned ? "聊天已置顶。" : "聊天已取消置顶。");
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });
  const muteMutation = useMutation({
    mutationFn: (muted: boolean) =>
      setConversationMuted(conversationId, { muted }, baseUrl),
    onSuccess: async (_, muted) => {
      setNotice(muted ? "已开启消息免打扰。" : "已关闭消息免打扰。");
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });

  const saveToContactsMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return sendFriendRequest(
        {
          characterId: targetCharacterId,
          greeting: `${ownerName} 想把你加到通讯录里。`,
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      setNotice("已发起保存到通讯录请求。");
      await queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearConversationHistory(conversationId, baseUrl),
    onSuccess: async () => {
      setNotice("聊天记录已清空。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-messages", baseUrl, conversationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return createModerationReport(
        {
          targetType: "character",
          targetId: targetCharacterId,
          reason: "聊天页举报",
          details: `来自会话 ${conversationId}`,
        },
        baseUrl,
      );
    },
    onSuccess: () => {
      setNotice("已提交投诉。");
    },
  });

  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!targetCharacterId) {
        return;
      }

      return blockCharacter(
        {
          characterId: targetCharacterId,
          reason: "来自聊天详情页加入黑名单",
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      setNotice("已加入黑名单。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-chat-details-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-chat-blocked-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const busy =
    muteMutation.isPending ||
    pinMutation.isPending ||
    saveToContactsMutation.isPending ||
    clearMutation.isPending ||
    reportMutation.isPending ||
    blockMutation.isPending;

  const memberItems = [
    {
      key: "owner",
      label: ownerName,
      src: ownerAvatar,
    },
    {
      key: targetCharacterId || conversation?.title || "character",
      label: targetCharacter?.name ?? conversation?.title ?? "对方",
      src: targetCharacter?.avatar,
      onClick: targetCharacterId
        ? () => {
            void navigate({
              to: "/character/$characterId",
              params: { characterId: targetCharacterId },
            });
          }
        : undefined,
    },
    {
      key: "add",
      label: "发起群聊",
      kind: "add" as const,
      onClick: () => {
        void navigate({ to: "/group/new" });
      },
    },
  ];

  return (
    <ChatDetailsShell
      title={conversation?.title ?? "聊天信息"}
      subtitle={targetCharacter?.relationship ?? "聊天信息"}
      onBack={() => {
        void navigate({
          to: "/chat/$conversationId",
          params: { conversationId },
        });
      }}
    >
      {conversationsQuery.isLoading ? (
        <LoadingBlock label="正在读取聊天信息..." />
      ) : null}
      {conversationsQuery.isError &&
      conversationsQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={conversationsQuery.error.message} />
        </div>
      ) : null}
      {characterQuery.isError && characterQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={characterQuery.error.message} />
        </div>
      ) : null}
      {friendsQuery.isError && friendsQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={friendsQuery.error.message} />
        </div>
      ) : null}
      {blockedQuery.isError && blockedQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={blockedQuery.error.message} />
        </div>
      ) : null}
      {notice ? (
        <div className="px-3">
          <InlineNotice tone="success">{notice}</InlineNotice>
        </div>
      ) : null}

      {!conversationsQuery.isLoading && !conversation ? (
        <div className="px-3">
          <EmptyState
            title="会话不存在"
            description="这段聊天暂时不可用，返回消息列表再试一次。"
          />
        </div>
      ) : null}

      {conversation ? (
        <>
          <ChatDetailsSection title="聊天成员">
            <ChatMemberGrid items={memberItems} />
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天记录">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="查找聊天记录"
                onClick={() => {
                  void navigate({
                    to: "/chat/$conversationId/search",
                    params: { conversationId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="消息设置">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="消息免打扰"
                checked={conversation?.isMuted ?? false}
                onToggle={(checked) => muteMutation.mutate(checked)}
              />
              <ChatSettingRow
                label="置顶聊天"
                checked={isPinned}
                onToggle={(checked) => pinMutation.mutate(checked)}
              />
              <ChatSettingRow
                label="强提醒"
                checked={preferences.strongReminder}
                onToggle={(checked) => {
                  setPreferences((current) => ({
                    ...current,
                    strongReminder: checked,
                  }));
                  setNotice(checked ? "已开启强提醒。" : "已关闭强提醒。");
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天扩展">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="保存到通讯录"
                value={isFriend ? "已添加" : undefined}
                disabled={isFriend || !targetCharacterId}
                onClick={() => saveToContactsMutation.mutate()}
              />
              <ChatSettingRow
                label="设置当前聊天背景"
                value={getChatBackgroundLabel(
                  backgroundQuery.data?.effectiveBackground,
                )}
                onClick={() => {
                  void navigate({
                    to: "/chat/$conversationId/background",
                    params: { conversationId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="危险操作">
            <div className="divide-y divide-black/5">
              <ChatSettingRow
                label="清空聊天记录"
                danger
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("确认清空这段聊天记录吗？")) {
                    return;
                  }
                  clearMutation.mutate();
                }}
              />
              <ChatSettingRow
                label="投诉"
                danger
                disabled={busy || !targetCharacterId}
                onClick={() => {
                  if (!window.confirm("确认提交投诉吗？")) {
                    return;
                  }
                  reportMutation.mutate();
                }}
              />
              <ChatSettingRow
                label={isBlocked ? "已加入黑名单" : "加入黑名单"}
                danger
                disabled={busy || isBlocked || !targetCharacterId}
                onClick={() => {
                  if (
                    !window.confirm(
                      "加入黑名单后，将不再接收该角色的互动。确认继续吗？",
                    )
                  ) {
                    return;
                  }
                  blockMutation.mutate();
                }}
              />
            </div>
          </ChatDetailsSection>

          {clearMutation.isError && clearMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={clearMutation.error.message} />
            </div>
          ) : null}
          {pinMutation.isError && pinMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={pinMutation.error.message} />
            </div>
          ) : null}
          {muteMutation.isError && muteMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={muteMutation.error.message} />
            </div>
          ) : null}
          {saveToContactsMutation.isError &&
          saveToContactsMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={saveToContactsMutation.error.message} />
            </div>
          ) : null}
          {reportMutation.isError && reportMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={reportMutation.error.message} />
            </div>
          ) : null}
          {blockMutation.isError && blockMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={blockMutation.error.message} />
            </div>
          ) : null}
        </>
      ) : null}
    </ChatDetailsShell>
  );
}
