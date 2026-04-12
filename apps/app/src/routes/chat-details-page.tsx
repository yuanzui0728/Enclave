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
  hideConversation,
  sendFriendRequest,
  setConversationStrongReminder,
  setConversationMuted,
  setConversationPinned,
} from "@yinjie/contracts";
import { ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import { EmptyState } from "../components/empty-state";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { DigitalHumanEntryNotice } from "../features/chat/digital-human-entry-notice";
import { useDigitalHumanEntryGuard } from "../features/chat/use-digital-human-entry-guard";
import { useConversationBackground } from "../features/chat/backgrounds/use-conversation-background";
import {
  CONVERSATION_STRONG_REMINDER_DURATION_HOURS,
  formatConversationStrongReminderRemaining,
  isConversationStrongReminderActive,
} from "../features/chat/conversation-strong-reminder";
import { ChatCallFallbackSection } from "../features/chat-details/chat-call-fallback-section";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { ChatMemberGrid } from "../features/chat-details/chat-member-grid";
import { ChatSettingRow } from "../features/chat-details/chat-setting-row";
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import {
  isNativeMobileBridgeAvailable,
  openAppSettings,
  requestNotificationPermission,
} from "../runtime/mobile-bridge";
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
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "warning";
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  const [managementSheetOpen, setManagementSheetOpen] = useState(false);
  const [dangerSheetAction, setDangerSheetAction] = useState<
    "hide" | "clear" | "report" | "block" | null
  >(null);
  const { entryNotice, guardVideoEntry, resetEntryGuard } =
    useDigitalHumanEntryGuard({
      baseUrl,
    });

  useEffect(() => {
    setNotice(null);
    setManagementSheetOpen(false);
    setDangerSheetAction(null);
    resetEntryGuard();
  }, [conversationId, resetEntryGuard]);

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

  useEffect(() => {
    if (conversationsQuery.isLoading || conversationsQuery.isError || conversation) {
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    conversation,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigate,
  ]);

  useEffect(() => {
    if (conversation?.type !== "group") {
      return;
    }

    void navigate({
      to: "/group/$groupId/details",
      params: { groupId: conversation.id },
      replace: true,
    });
  }, [conversation, navigate]);

  const targetCharacter = characterQuery.data;
  const isPinned = conversation?.isPinned ?? false;
  const strongReminderActive = isConversationStrongReminderActive(
    conversation?.strongReminderUntil,
    nowTimestamp,
  );
  const strongReminderLabel = formatConversationStrongReminderRemaining(
    conversation?.strongReminderUntil,
    nowTimestamp,
  );
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
      setNotice({
        tone: "success",
        message: pinned ? "聊天已置顶。" : "聊天已取消置顶。",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });
  const muteMutation = useMutation({
    mutationFn: (muted: boolean) =>
      setConversationMuted(conversationId, { muted }, baseUrl),
    onSuccess: async (_, muted) => {
      setNotice({
        tone: "success",
        message: muted ? "已开启消息免打扰。" : "已关闭消息免打扰。",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });
  const strongReminderMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const conversation = await setConversationStrongReminder(
        conversationId,
        {
          enabled,
          durationHours: CONVERSATION_STRONG_REMINDER_DURATION_HOURS,
        },
        baseUrl,
      );
      const permission = enabled
        ? await requestNotificationPermission()
        : undefined;
      return { conversation, enabled, permission };
    },
    onSuccess: async ({ enabled, permission }) => {
      if (!enabled) {
        setNotice({
          tone: "success",
          message: "已关闭强提醒。",
        });
      } else if (permission === "granted") {
        setNotice({
          tone: "success",
          message: "已开启 3 小时强提醒，系统通知已开启。",
        });
      } else if (permission === "denied") {
        setNotice({
          tone: "warning",
          message: isNativeMobileBridgeAvailable()
            ? "已开启 3 小时强提醒，但系统通知未开启。可前往系统设置继续打开通知。"
            : "已开启 3 小时强提醒，但系统通知未开启。",
          actionLabel: isNativeMobileBridgeAvailable() ? "去设置" : undefined,
          onAction: isNativeMobileBridgeAvailable()
            ? () => {
                void openAppSettings();
              }
            : undefined,
        });
      } else {
        setNotice({
          tone: "success",
          message: "已开启 3 小时强提醒。",
        });
      }

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
          autoAccept: true,
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: "已添加到通讯录。",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-friends", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-friends-quick-start", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-friends", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-messages", baseUrl, conversationId],
        }),
      ]);
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearConversationHistory(conversationId, baseUrl),
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: "聊天记录已清空。",
      });
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
  const hideMutation = useMutation({
    mutationFn: () => hideConversation(conversationId, baseUrl),
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: "聊天已隐藏。",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      void navigate({ to: "/tabs/chat", replace: true });
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
      setNotice({
        tone: "success",
        message: "已提交投诉。",
      });
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
      setNotice({
        tone: "success",
        message: "已加入黑名单。",
      });
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
    strongReminderMutation.isPending ||
    pinMutation.isPending ||
    saveToContactsMutation.isPending ||
    hideMutation.isPending ||
    clearMutation.isPending ||
    reportMutation.isPending ||
    blockMutation.isPending;

  useEffect(() => {
    if (!strongReminderActive) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [strongReminderActive]);

  const memberItems = [
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
        void navigate({
          to: "/group/new",
          hash: buildCreateGroupRouteHash({
            source: "chat-details",
            conversationId,
            seedMemberIds: targetCharacterId ? [targetCharacterId] : [],
          }),
        });
      },
    },
  ];
  const dangerSheetConfig =
    dangerSheetAction === "hide"
      ? {
          title: "隐藏聊天",
          description: "该聊天会先从消息列表中隐藏，收到新消息后会再次出现。",
          confirmLabel: "隐藏聊天",
          confirmDescription: "不删除现有聊天记录",
          confirmDanger: false,
          onConfirm: () => hideMutation.mutate(),
        }
      : dangerSheetAction === "clear"
        ? {
            title: "清空聊天记录",
            description: "仅清空当前聊天历史消息，对方资料和会话入口会继续保留。",
            confirmLabel: "清空聊天记录",
            confirmDescription: "此操作不可恢复",
            confirmDanger: true,
            onConfirm: () => clearMutation.mutate(),
          }
        : dangerSheetAction === "report"
          ? {
              title: "提交投诉",
              description: "会以当前会话作为来源，提交一次聊天场景投诉。",
              confirmLabel: "确认投诉",
              confirmDescription: "投诉后可继续查看聊天",
              confirmDanger: true,
              onConfirm: () => reportMutation.mutate(),
            }
          : dangerSheetAction === "block"
            ? {
                title: "加入黑名单",
                description:
                  "加入黑名单后，将不再接收该角色的互动，也不会再继续这段聊天。",
                confirmLabel: "加入黑名单",
                confirmDescription: "该角色后续互动会被拦截",
                confirmDanger: true,
                onConfirm: () => blockMutation.mutate(),
              }
            : null;

  return (
    <ChatDetailsShell
      title={conversation?.title ?? "聊天信息"}
      subtitle={targetCharacter?.relationship?.trim() || undefined}
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
          <InlineNotice
            tone={notice.tone}
            className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-[11px] leading-[18px] shadow-none"
          >
            <span>{notice.message}</span>
            {notice.actionLabel && notice.onAction ? (
              <InlineNoticeActionButton
                label={notice.actionLabel}
                onClick={notice.onAction}
              />
            ) : null}
          </InlineNotice>
        </div>
      ) : null}
      {entryNotice ? (
        <div className="px-3">
          <DigitalHumanEntryNotice
            tone={entryNotice.tone}
            message={entryNotice.message}
            continueLabel={entryNotice.continueLabel}
            onDismiss={() => {
              resetEntryGuard();
            }}
            voiceLabel={entryNotice.voiceLabel}
            onContinue={() => {
              resetEntryGuard();
              void navigate({
                to: "/chat/$conversationId/video-call",
                params: { conversationId },
              });
            }}
            onSwitchToVoice={() => {
              resetEntryGuard();
              void navigate({
                to: "/chat/$conversationId/voice-call",
                params: { conversationId },
              });
            }}
            compact
          />
        </div>
      ) : null}

      {!conversationsQuery.isLoading && !conversation ? (
        <div className="px-3">
          <EmptyState
            title="会话不存在"
            description="这段聊天暂时不可用，返回消息列表再试一次。"
            action={
              <button
                type="button"
                onClick={() => {
                  void navigate({ to: "/tabs/chat" });
                }}
                className="rounded-full border border-[color:var(--border-faint)] bg-white px-4 py-2 text-[13px] text-[color:var(--text-primary)]"
              >
                返回消息列表
              </button>
            }
          />
        </div>
      ) : null}

      {conversation ? (
        <>
          <ChatDetailsSection title="聊天成员" variant="wechat">
            <ChatMemberGrid items={memberItems} variant="wechat" />
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天记录" variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label="查找聊天记录"
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/chat/$conversationId/search",
                    params: { conversationId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="消息设置" variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label="消息免打扰"
                variant="wechat"
                checked={conversation?.isMuted ?? false}
                onToggle={(checked) => muteMutation.mutate(checked)}
              />
              <ChatSettingRow
                label="置顶聊天"
                variant="wechat"
                checked={isPinned}
                onToggle={(checked) => pinMutation.mutate(checked)}
              />
              <ChatSettingRow
                label="强提醒"
                value={strongReminderActive ? strongReminderLabel : undefined}
                variant="wechat"
                checked={strongReminderActive}
                disabled={busy}
                onToggle={(checked) => strongReminderMutation.mutate(checked)}
              />
            </div>
          </ChatDetailsSection>

          <ChatCallFallbackSection
            variant="wechat"
            disabled={!targetCharacterId}
            voiceValue="AI 语音"
            videoValue="AI 数字人"
            onSelectKind={(kind) => {
              setNotice(null);
              if (kind === "video") {
                if (!guardVideoEntry()) {
                  return;
                }
              }
              void navigate({
                to:
                  kind === "voice"
                    ? "/chat/$conversationId/voice-call"
                    : "/chat/$conversationId/video-call",
                params: { conversationId },
              });
            }}
          />

          <ChatDetailsSection title="聊天扩展" variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label="保存到通讯录"
                value={isFriend ? "已添加" : undefined}
                variant="wechat"
                disabled={isFriend || !targetCharacterId}
                onClick={() => saveToContactsMutation.mutate()}
              />
              <ChatSettingRow
                label="设置当前聊天背景"
                value={getChatBackgroundLabel(
                  backgroundQuery.data?.effectiveBackground,
                )}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/chat/$conversationId/background",
                    params: { conversationId },
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天管理" variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label="更多聊天操作"
                value={
                  isBlocked ? "隐藏 / 清空 / 投诉" : "隐藏 / 清空 / 投诉 / 拉黑"
                }
                variant="wechat"
                disabled={busy}
                onClick={() => setManagementSheetOpen(true)}
              />
            </div>
          </ChatDetailsSection>

          {clearMutation.isError && clearMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={clearMutation.error.message} />
            </div>
          ) : null}
          {hideMutation.isError && hideMutation.error instanceof Error ? (
            <div className="px-3">
              <ErrorBlock message={hideMutation.error.message} />
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

          <MobileDetailsActionSheet
            open={managementSheetOpen}
            title="聊天管理"
            description={`对 ${targetCharacter?.name ?? conversation.title ?? "当前聊天"} 进行隐藏、清空或安全操作。`}
            onClose={() => setManagementSheetOpen(false)}
            actions={[
              {
                key: "hide",
                label: "隐藏聊天",
                description: "先从消息列表隐藏，后续有新消息时再次出现",
                disabled: busy,
                onClick: () => {
                  setManagementSheetOpen(false);
                  setDangerSheetAction("hide");
                },
              },
              {
                key: "clear",
                label: "清空聊天记录",
                description: "仅清空这段聊天，不影响联系人关系",
                danger: true,
                disabled: busy,
                onClick: () => {
                  setManagementSheetOpen(false);
                  setDangerSheetAction("clear");
                },
              },
              {
                key: "report",
                label: "投诉",
                description: "提交一次聊天场景投诉",
                danger: true,
                disabled: busy || !targetCharacterId,
                onClick: () => {
                  setManagementSheetOpen(false);
                  setDangerSheetAction("report");
                },
              },
              {
                key: "block",
                label: isBlocked ? "已加入黑名单" : "加入黑名单",
                description: isBlocked
                  ? "当前已经处于黑名单中"
                  : "不再接收该角色后续互动",
                danger: true,
                disabled: busy || isBlocked || !targetCharacterId,
                onClick: () => {
                  setManagementSheetOpen(false);
                  setDangerSheetAction("block");
                },
              },
            ]}
          />

          <MobileDetailsActionSheet
            open={dangerSheetConfig !== null}
            title={dangerSheetConfig?.title ?? ""}
            description={dangerSheetConfig?.description}
            onClose={() => setDangerSheetAction(null)}
            actions={
              dangerSheetConfig
                ? [
                    {
                      key: "confirm",
                      label: dangerSheetConfig.confirmLabel,
                      description: dangerSheetConfig.confirmDescription,
                      danger: dangerSheetConfig.confirmDanger,
                      disabled: busy,
                      onClick: () => {
                        setDangerSheetAction(null);
                        dangerSheetConfig.onConfirm();
                      },
                    },
                  ]
                : []
            }
          />
        </>
      ) : null}
    </ChatDetailsShell>
  );
}
