import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
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
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
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
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "../features/chat/mobile-chat-route-state";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { isDesktopOnlyPath } from "../lib/history-back";
import {
  openAppSettings,
  requestNotificationPermission,
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ChatDetailsPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/details",
  });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={conversationId}
        panel="details"
        title="正在打开桌面聊天信息"
        description="正在切换到桌面聊天工作区中的聊天信息侧栏。"
        loadingLabel="打开桌面聊天信息..."
      />
    );
  }

  return <MobileChatDetailsPage conversationId={conversationId} />;
}

function MobileChatDetailsPage({ conversationId }: { conversationId: string }) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const routeState = useMemo(() => parseMobileChatRouteState(hash), [hash]);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const chatRouteHash = useMemo(
    () =>
      buildMobileChatRouteHash({
        highlightedMessageId: routeState.highlightedMessageId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }) || undefined,
    [routeState.highlightedMessageId, safeReturnHash, safeReturnPath],
  );
  const ownerName = useWorldOwnerStore((state) => state.username) ?? "我";
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "warning";
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    secondaryActionLabel?: string;
    onSecondaryAction?: () => void;
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

  const navigateToRouteStateReturn = ({
    replace = false,
  }: {
    replace?: boolean;
  } = {}) => {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
      replace,
    });
    return true;
  };
  const handleOperationBack = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({ to: "/tabs/chat" });
  };
  const statusBackLabel = safeReturnPath ? "返回上一页" : "返回消息列表";
  const renderStatusBackAction = () => (
    <Button
      type="button"
      variant="secondary"
      onClick={handleOperationBack}
      className="rounded-full"
    >
      {statusBackLabel}
    </Button>
  );
  const renderStatusRetryAction = (onRetry: () => void) => (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={onRetry}
        className="rounded-full"
      >
        重试读取
      </Button>
      {renderStatusBackAction()}
    </div>
  );
  const renderOperationBackAction = () => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
      onClick={handleOperationBack}
    >
      {statusBackLabel}
    </Button>
  );

  useEffect(() => {
    if (
      conversationsQuery.isLoading ||
      conversationsQuery.isError ||
      conversation
    ) {
      return;
    }

    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    conversation,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
  ]);

  useEffect(() => {
    if (conversation?.type !== "group") {
      return;
    }

    void navigate({
      to: "/group/$groupId/details",
      params: { groupId: conversation.id },
      ...(chatRouteHash ? { hash: chatRouteHash } : {}),
      replace: true,
    });
  }, [chatRouteHash, conversation, navigate]);

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
  const friendRecord = useMemo(
    () =>
      (friendsQuery.data ?? []).find(
        (item) => item.character.id === targetCharacterId,
      ) ?? null,
    [friendsQuery.data, targetCharacterId],
  );
  const friendship = friendRecord?.friendship ?? null;
  const isFriend = Boolean(friendship);
  const isBlocked = (blockedQuery.data ?? []).some(
    (item) => item.characterId === targetCharacterId,
  );
  const contactDisplayName =
    friendship?.remarkName?.trim() ||
    targetCharacter?.name ||
    conversation?.title ||
    "对方";
  const contactProfileSubtitle = friendship?.remarkName?.trim()
    ? `昵称：${targetCharacter?.name ?? "未设置"}`
    : targetCharacter?.relationship?.trim() ||
      (isFriend ? "通讯录朋友" : "世界联系人");
  const contactIdentifier = targetCharacterId
    ? `隐界号：yinjie_${targetCharacterId.slice(0, 8)}`
    : null;
  const contactSummary = useMemo(() => {
    if (!conversation) {
      return null;
    }

    const contactPath = targetCharacterId
      ? `/character/${targetCharacterId}`
      : `/chat/${conversationId}/details`;
    const contactUrl =
      typeof window === "undefined"
        ? contactPath
        : `${window.location.origin}${contactPath}`;
    const contactName =
      friendship?.remarkName?.trim() ||
      targetCharacter?.name ||
      conversation.title ||
      "联系人";
    const relationship =
      targetCharacter?.relationship?.trim() ||
      (isFriend ? "通讯录朋友" : "世界联系人");

    return {
      title: `${contactName} 的隐界名片`,
      text: [
        `${contactName} 的隐界名片`,
        relationship,
        targetCharacterId
          ? `隐界号：yinjie_${targetCharacterId.slice(0, 8)}`
          : undefined,
        contactUrl,
      ]
        .filter(Boolean)
        .join("\n"),
      url: contactUrl,
    };
  }, [
    conversation,
    conversationId,
    friendship?.remarkName,
    isFriend,
    targetCharacter?.name,
    targetCharacter?.relationship,
    targetCharacterId,
  ]);

  const handleOpenCharacterProfile = () => {
    if (!targetCharacterId) {
      return;
    }

    void navigate({
      to: "/character/$characterId",
      params: { characterId: targetCharacterId },
      hash: buildCharacterDetailRouteHash({
        returnPath: `/chat/${conversationId}/details`,
        returnHash: chatRouteHash,
      }),
    });
  };

  async function handleShareContact() {
    if (!contactSummary) {
      return;
    }

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell(contactSummary);
      if (shared) {
        setNotice({
          tone: "success",
          message: "已打开系统分享面板。",
        });
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制联系人摘要。",
        actionLabel: statusBackLabel,
        onAction: handleOperationBack,
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(contactSummary.text);
      setNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制联系人摘要。"
          : "联系人摘要已复制。",
      });
    } catch {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制联系人摘要失败，请稍后重试。",
        actionLabel: statusBackLabel,
        onAction: handleOperationBack,
      });
    }
  }

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
          message: nativeMobileShareSupported
            ? "已开启 3 小时强提醒，但系统通知未开启。可前往系统设置继续打开通知。"
            : "已开启 3 小时强提醒，但系统通知未开启。",
          actionLabel: nativeMobileShareSupported ? "去设置" : undefined,
          onAction: nativeMobileShareSupported
            ? () => {
                void openAppSettings();
              }
            : undefined,
          secondaryActionLabel: statusBackLabel,
          onSecondaryAction: handleOperationBack,
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
      if (navigateToRouteStateReturn({ replace: true })) {
        return;
      }

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
      label: contactDisplayName,
      src: targetCharacter?.avatar,
      onClick: targetCharacterId ? handleOpenCharacterProfile : undefined,
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
            returnPath: `/chat/${conversationId}/details`,
            returnHash: chatRouteHash,
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
            description:
              "仅清空当前聊天历史消息，对方资料和会话入口会继续保留。",
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
  const handleSaveToContacts = () => {
    if (!targetCharacterId) {
      return;
    }

    saveToContactsMutation.mutate();
  };

  return (
    <ChatDetailsShell
      title={conversation?.title ?? "聊天信息"}
      onBack={() => {
        void navigate({
          to: "/chat/$conversationId",
          params: { conversationId },
          ...(chatRouteHash ? { hash: chatRouteHash } : {}),
        });
      }}
    >
      {conversationsQuery.isLoading ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge="读取中"
            title="正在读取聊天信息"
            description="稍等一下，正在同步聊天资料和设置。"
            tone="loading"
          />
        </div>
      ) : null}
      {conversationsQuery.isError &&
      conversationsQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge="读取失败"
            title="聊天信息暂时不可用"
            description={conversationsQuery.error.message}
            tone="danger"
            action={renderStatusRetryAction(() => {
              void conversationsQuery.refetch();
            })}
          />
        </div>
      ) : null}
      {characterQuery.isError && characterQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge="读取失败"
            title="联系人资料暂时不可用"
            description={characterQuery.error.message}
            tone="danger"
            action={renderStatusRetryAction(() => {
              void characterQuery.refetch();
            })}
          />
        </div>
      ) : null}
      {friendsQuery.isError && friendsQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge="读取失败"
            title="通讯录信息暂时不可用"
            description={friendsQuery.error.message}
            tone="danger"
            action={renderStatusRetryAction(() => {
              void friendsQuery.refetch();
            })}
          />
        </div>
      ) : null}
      {blockedQuery.isError && blockedQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge="读取失败"
            title="黑名单状态暂时不可用"
            description={blockedQuery.error.message}
            tone="danger"
            action={renderStatusRetryAction(() => {
              void blockedQuery.refetch();
            })}
          />
        </div>
      ) : null}
      {notice ? (
        <div className="px-2.5">
          <InlineNotice
            tone={notice.tone}
            className="flex items-center justify-between gap-2.5 rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
          >
            <span>{notice.message}</span>
            {notice.actionLabel && notice.onAction ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <InlineNoticeActionButton
                  label={notice.actionLabel}
                  onClick={notice.onAction}
                />
                {notice.secondaryActionLabel && notice.onSecondaryAction ? (
                  <InlineNoticeActionButton
                    label={notice.secondaryActionLabel}
                    onClick={notice.onSecondaryAction}
                  />
                ) : null}
              </div>
            ) : notice.secondaryActionLabel && notice.onSecondaryAction ? (
              <InlineNoticeActionButton
                label={notice.secondaryActionLabel}
                onClick={notice.onSecondaryAction}
              />
            ) : null}
          </InlineNotice>
        </div>
      ) : null}
      {entryNotice ? (
        <div className="px-2.5">
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
                ...(chatRouteHash ? { hash: chatRouteHash } : {}),
              });
            }}
            onSwitchToVoice={() => {
              resetEntryGuard();
              void navigate({
                to: "/chat/$conversationId/voice-call",
                params: { conversationId },
                ...(chatRouteHash ? { hash: chatRouteHash } : {}),
              });
            }}
            compact
          />
        </div>
      ) : null}

      {!conversationsQuery.isLoading && !conversation ? (
        <div className="px-2.5">
          <MobileChatDetailsStatusCard
            badge="会话"
            title="会话不存在"
            description="这段聊天暂时不可用，可以先重试读取，或返回消息列表后再试。"
            action={renderStatusRetryAction(() => {
              void conversationsQuery.refetch();
            })}
          />
        </div>
      ) : null}

      {conversation ? (
        <>
          <ChatDetailsSection
            title={isFriend ? "朋友资料" : "详细资料"}
            variant="wechat"
          >
            <button
              type="button"
              onClick={handleOpenCharacterProfile}
              disabled={!targetCharacterId}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-[color:var(--surface-card-hover)] disabled:opacity-60"
            >
              <AvatarChip
                name={contactDisplayName}
                src={targetCharacter?.avatar}
                size="wechat"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] text-[#111827]">
                  {contactDisplayName}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
                  {contactProfileSubtitle}
                </div>
                {contactIdentifier ? (
                  <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
                    {contactIdentifier}
                  </div>
                ) : null}
              </div>
              <ChevronRight size={18} className="shrink-0 text-[#c7c7cc]" />
            </button>
            {contactSummary ? (
              <div className="border-t border-[color:var(--border-faint)]">
                <ChatSettingRow
                  label="推荐给朋友"
                  value={
                    nativeMobileShareSupported
                      ? "打开系统分享面板"
                      : "复制联系人摘要"
                  }
                  variant="wechat"
                  onClick={() => {
                    void handleShareContact();
                  }}
                />
              </div>
            ) : null}
          </ChatDetailsSection>

          <ChatDetailsSection variant="wechat">
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
                    ...(chatRouteHash ? { hash: chatRouteHash } : {}),
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
                ...(chatRouteHash ? { hash: chatRouteHash } : {}),
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
                onClick={handleSaveToContacts}
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
                    ...(chatRouteHash ? { hash: chatRouteHash } : {}),
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
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {clearMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {hideMutation.isError && hideMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {hideMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {pinMutation.isError && pinMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {pinMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {muteMutation.isError && muteMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {muteMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {saveToContactsMutation.isError &&
          saveToContactsMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {saveToContactsMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {reportMutation.isError && reportMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {reportMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {blockMutation.isError && blockMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {blockMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
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

function MobileChatDetailsStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}
