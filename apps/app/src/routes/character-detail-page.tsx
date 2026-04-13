import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  MessageCircleMore,
  Phone,
  Share2,
  Star,
  Video,
} from "lucide-react";
import {
  blockCharacter,
  deleteFriend,
  getBlockedCharacters,
  getCharacter,
  getConversations,
  getFriendRequests,
  getFriends,
  getOrCreateConversation,
  sendFriendRequest,
  setConversationMuted,
  setConversationPinned,
  setFriendStarred,
  unblockCharacter,
  updateFriendProfile,
  type UpdateFriendProfileRequest,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { DigitalHumanEntryNotice } from "../features/chat/digital-human-entry-notice";
import { useDigitalHumanEntryGuard } from "../features/chat/use-digital-human-entry-guard";
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { ContactDetailPane } from "../features/contacts/contact-detail-pane";
import { buildDesktopAddFriendRouteHash } from "../features/desktop/contacts/desktop-add-friend-route-state";
import { buildDesktopMomentsRouteHash } from "../features/desktop/moments/desktop-moments-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { formatTimestamp } from "../lib/format";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type FriendProfileFormState = {
  remarkName: string;
  tags: string;
};

export function CharacterDetailPage() {
  const { characterId } = useParams({ from: "/character/$characterId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username) ?? "我";
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "warning";
    message: string;
  } | null>(null);
  const [dangerSheetAction, setDangerSheetAction] = useState<
    "block" | "delete" | null
  >(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const { entryNotice, guardVideoEntry, resetEntryGuard } =
    useDigitalHumanEntryGuard({
      baseUrl,
    });
  const [profileForm, setProfileForm] = useState<FriendProfileFormState>({
    remarkName: "",
    tags: "",
  });

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId, baseUrl),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });
  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-chat-details-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: isDesktopLayout,
  });

  useEffect(() => {
    if (
      characterQuery.isLoading ||
      !isMissingCharacterError(characterQuery.error, characterId)
    ) {
      return;
    }

    void navigate({ to: "/tabs/contacts", replace: true });
  }, [characterId, characterQuery.error, characterQuery.isLoading, navigate]);

  const character = characterQuery.data;
  const friendship = useMemo(
    () =>
      (friendsQuery.data ?? []).find(
        (item) => item.character.id === characterId,
      )?.friendship ?? null,
    [characterId, friendsQuery.data],
  );
  const selectedConversation = useMemo(
    () =>
      (conversationsQuery.data ?? []).find(
        (item) =>
          !isPersistedGroupConversation(item) &&
          item.participants.includes(characterId),
      ) ?? null,
    [characterId, conversationsQuery.data],
  );
  const commonGroups = useMemo(
    () =>
      (conversationsQuery.data ?? [])
        .filter(
          (item) =>
            isPersistedGroupConversation(item) &&
            item.participants.includes(characterId),
        )
        .map((item) => ({
          id: item.id,
          name: item.title,
        })),
    [characterId, conversationsQuery.data],
  );
  const isFriend = Boolean(friendship);
  const isBlocked = (blockedQuery.data ?? []).some(
    (item) => item.characterId === characterId,
  );
  const hasPendingFriendRequest = (friendRequestsQuery.data ?? []).some(
    (item) => item.characterId === characterId && item.status === "pending",
  );
  const remarkName = friendship?.remarkName?.trim() ?? "";
  const displayName = remarkName || character?.name || "详细资料";
  const signature =
    character?.currentStatus?.trim() ||
    character?.bio?.trim() ||
    (isFriend ? "这个朋友还没有个性签名。" : "这个角色还没有个性签名。");
  const expertiseSummary = character?.expertDomains?.length
    ? character.expertDomains.join("、")
    : "未设置";
  const activitySummary =
    character?.currentActivity?.trim() ||
    character?.relationship?.trim() ||
    "暂无状态";
  const toneSummary =
    character?.profile?.traits?.emotionalTone?.trim() || "未设置";
  const tagSummary = friendship?.tags?.length
    ? friendship.tags.join("、")
    : "未设置";

  useEffect(() => {
    setNotice(null);
    setDangerSheetAction(null);
    setIsEditingProfile(false);
    resetEntryGuard();
    setProfileForm({
      remarkName: friendship?.remarkName ?? "",
      tags: friendship?.tags?.join("，") ?? "",
    });
  }, [
    characterId,
    friendship?.remarkName,
    friendship?.tags,
    resetEntryGuard,
  ]);

  const startChatMutation = useMutation({
    mutationFn: async () => {
      if (!character) {
        return null;
      }

      return getOrCreateConversation({ characterId: character.id }, baseUrl);
    },
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }

      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: conversation.id },
      });
    },
  });
  const openCallMutation = useMutation({
    mutationFn: async (kind: "voice" | "video") => {
      if (!character) {
        return null;
      }

      const conversation = await getOrCreateConversation(
        { characterId: character.id },
        baseUrl,
      );

      return {
        conversation,
        kind,
      };
    },
    onSuccess: (result) => {
      if (!result?.conversation) {
        return;
      }

      void navigate({
        to:
          result.kind === "voice"
            ? "/chat/$conversationId/voice-call"
            : "/chat/$conversationId/video-call",
        params: { conversationId: result.conversation.id },
      });
    },
  });
  const sendFriendRequestMutation = useMutation({
    mutationFn: () =>
      sendFriendRequest(
        {
          characterId,
          greeting: `${ownerName} 想把你加到通讯录里。`,
          autoAccept: true,
        },
        baseUrl,
      ),
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
      ]);
    },
  });
  const setStarredMutation = useMutation({
    mutationFn: (starred: boolean) =>
      setFriendStarred(characterId, { starred }, baseUrl),
    onSuccess: async (_, starred) => {
      setNotice({
        tone: "success",
        message: starred ? "已设为星标朋友。" : "已取消星标朋友。",
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
  });
  const pinMutation = useMutation({
    mutationFn: async (pinned: boolean) => {
      const conversationId =
        selectedConversation && !isPersistedGroupConversation(selectedConversation)
          ? selectedConversation.id
          : (await getOrCreateConversation({ characterId }, baseUrl)).id;

      return setConversationPinned(conversationId, { pinned }, baseUrl);
    },
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
    mutationFn: async (muted: boolean) => {
      const conversationId =
        selectedConversation && !isPersistedGroupConversation(selectedConversation)
          ? selectedConversation.id
          : (await getOrCreateConversation({ characterId }, baseUrl)).id;

      return setConversationMuted(conversationId, { muted }, baseUrl);
    },
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
  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateFriendProfileRequest) =>
      updateFriendProfile(characterId, payload, baseUrl),
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: "朋友资料已更新。",
      });
      setIsEditingProfile(false);
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
  });
  const blockMutation = useMutation({
    mutationFn: async (blocked: boolean) => {
      if (blocked) {
        await unblockCharacter({ characterId }, baseUrl);
        return;
      }

      await blockCharacter(
        {
          characterId,
          reason: "来自好友资料页加入黑名单",
        },
        baseUrl,
      );
    },
    onSuccess: async (_, blocked) => {
      setNotice({
        tone: "success",
        message: blocked ? "已移出黑名单。" : "已加入黑名单。",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-chat-details-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-contacts-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-chat-blocked-characters", baseUrl],
        }),
      ]);
    },
  });
  const deleteFriendMutation = useMutation({
    mutationFn: () => deleteFriend(characterId, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({ to: "/tabs/contacts" });
    },
  });

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    void navigate({ to: "/tabs/contacts" });
  };

  const handleSaveProfile = async () => {
    await updateProfileMutation.mutateAsync({
      remarkName: profileForm.remarkName.trim() || null,
      tags: profileForm.tags
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
  };

  const handleVoiceCall = () => {
    setNotice(null);
    resetEntryGuard();
    openCallMutation.mutate("voice");
  };

  const handleVideoCall = () => {
    setNotice(null);
    if (!guardVideoEntry()) {
      return;
    }
    openCallMutation.mutate("video");
  };
  const handleShareCharacterCard = async () => {
    if (!character) {
      return;
    }

    const profilePath = `/character/${character.id}`;
    const profileUrl =
      typeof window === "undefined"
        ? profilePath
        : `${window.location.origin}${profilePath}`;
    const profileSummary = [
      `${displayName} 的隐界名片`,
      character.relationship?.trim() || "世界联系人",
      `隐界号：yinjie_${character.id.slice(0, 8)}`,
      profileUrl,
    ].join("\n");

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${displayName} 的隐界名片`,
        text: profileSummary,
        url: profileUrl,
      });

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
          : "当前环境暂不支持复制名片。",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(profileSummary);
      setNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制名片摘要。"
          : "名片摘要已复制。",
      });
    } catch {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制名片失败，请稍后重试。",
      });
    }
  };
  const handleBlockAction = () => {
    if (isDesktopLayout) {
      const confirmed = window.confirm(
        isBlocked
          ? "确认把这个角色移出黑名单吗？"
          : "加入黑名单后，将不再接收这个角色的互动。确认继续吗？",
      );
      if (!confirmed) {
        return;
      }

      blockMutation.mutate(isBlocked);
      return;
    }

    setDangerSheetAction("block");
  };
  const handleDeleteFriendAction = () => {
    if (isDesktopLayout) {
      if (!window.confirm("确认删除这个联系人吗？")) {
        return;
      }

      deleteFriendMutation.mutate();
      return;
    }

    setDangerSheetAction("delete");
  };
  const handleAddToContacts = () => {
    if (hasPendingFriendRequest) {
      void navigate({ to: "/friend-requests" });
      return;
    }

    if (isDesktopLayout) {
      void navigate({
        to: "/desktop/add-friend",
        hash: buildDesktopAddFriendRouteHash({
          keyword: character?.name ?? "",
          characterId,
          openCompose: true,
        }),
      });
      return;
    }

    sendFriendRequestMutation.mutate();
  };
  const handleOpenMoments = () => {
    if (!character) {
      return;
    }

    void navigate({
      to: "/tabs/moments",
      hash: buildDesktopMomentsRouteHash({
        authorId: character.id,
      }),
    });
  };
  const dangerSheetConfig =
    dangerSheetAction === "block"
      ? {
          title: isBlocked ? "移出黑名单" : "加入黑名单",
          description: isBlocked
            ? "移出后将恢复正常联系与互动。"
            : "加入黑名单后，将不再接收这个角色的互动。",
          confirmLabel: isBlocked ? "移出黑名单" : "加入黑名单",
          confirmDescription: isBlocked
            ? "恢复正常联系"
            : "后续互动会被拦截",
          confirmDanger: !isBlocked,
          onConfirm: () => blockMutation.mutate(isBlocked),
        }
      : dangerSheetAction === "delete"
        ? {
            title: "删除联系人",
            description: "删除后会从通讯录移除这个联系人。",
            confirmLabel: "删除联系人",
            confirmDescription: "此操作不可恢复",
            confirmDanger: true,
            onConfirm: () => deleteFriendMutation.mutate(),
          }
        : null;

  if (isDesktopLayout && character && friendship) {
    return (
      <AppPage className="min-h-full bg-[#ededed] px-0 py-0">
        <header className="sticky top-0 z-20 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.95)] px-3 py-2 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[640px] items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--text-primary)] transition active:bg-black/5"
              aria-label="返回"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                朋友信息
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-3 py-3">
          {notice ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
            </div>
          ) : null}
          {entryNotice ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <DigitalHumanEntryNotice
                tone={entryNotice.tone}
                message={entryNotice.message}
                onDismiss={() => {
                  resetEntryGuard();
                }}
                onContinue={() => {
                  resetEntryGuard();
                  openCallMutation.mutate("video");
                }}
                onSwitchToVoice={() => {
                  resetEntryGuard();
                  openCallMutation.mutate("voice");
                }}
                continueLabel={
                  openCallMutation.isPending
                    ? "正在接通视频..."
                    : entryNotice.continueLabel
                }
                voiceLabel={
                  openCallMutation.isPending
                    ? "正在接通语音..."
                    : entryNotice.voiceLabel
                }
                compact={false}
              />
            </div>
          ) : null}
          {characterQuery.isLoading ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <LoadingBlock label="正在读取朋友资料..." />
            </div>
          ) : null}
          {characterQuery.isError && characterQuery.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={characterQuery.error.message} />
            </div>
          ) : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={friendsQuery.error.message} />
            </div>
          ) : null}
          {conversationsQuery.isError &&
          conversationsQuery.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={conversationsQuery.error.message} />
            </div>
          ) : null}
          {startChatMutation.isError &&
          startChatMutation.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={startChatMutation.error.message} />
            </div>
          ) : null}
          {openCallMutation.isError &&
          openCallMutation.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={openCallMutation.error.message} />
            </div>
          ) : null}
          {setStarredMutation.isError &&
          setStarredMutation.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={setStarredMutation.error.message} />
            </div>
          ) : null}
          {pinMutation.isError && pinMutation.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={pinMutation.error.message} />
            </div>
          ) : null}
          {muteMutation.isError && muteMutation.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={muteMutation.error.message} />
            </div>
          ) : null}
          {blockMutation.isError && blockMutation.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={blockMutation.error.message} />
            </div>
          ) : null}
          {deleteFriendMutation.isError &&
          deleteFriendMutation.error instanceof Error ? (
            <div className="mx-auto w-full max-w-[640px] px-3">
              <ErrorBlock message={deleteFriendMutation.error.message} />
            </div>
          ) : null}

          <ContactDetailPane
            character={character}
            friendship={friendship}
            commonGroups={commonGroups}
            onOpenGroup={(groupId) => {
              void navigate({ to: "/group/$groupId", params: { groupId } });
            }}
            onOpenMoments={handleOpenMoments}
            onOpenProfile={() => {}}
            showProfileEntry={false}
            onStartChat={() => {
              setNotice(null);
              startChatMutation.mutate();
            }}
            chatPending={startChatMutation.isPending}
            isPinned={selectedConversation?.isPinned ?? false}
            pinPending={pinMutation.isPending}
            onTogglePinned={() => {
              setNotice(null);
              pinMutation.mutate(!(selectedConversation?.isPinned ?? false));
            }}
            isMuted={selectedConversation?.isMuted ?? false}
            mutePending={muteMutation.isPending}
            onToggleMuted={() => {
              setNotice(null);
              muteMutation.mutate(!(selectedConversation?.isMuted ?? false));
            }}
            isStarred={friendship.isStarred}
            starPending={setStarredMutation.isPending}
            onToggleStarred={() => {
              setNotice(null);
              setStarredMutation.mutate(!friendship.isStarred);
            }}
            isBlocked={isBlocked}
            blockPending={blockMutation.isPending}
            onToggleBlock={() => {
              setNotice(null);
              blockMutation.mutate(isBlocked);
            }}
            deletePending={deleteFriendMutation.isPending}
            onDeleteFriend={() => {
              handleDeleteFriendAction();
            }}
          />
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      className={cn(
        "min-h-full space-y-0 px-0 py-0 text-[color:var(--text-primary)]",
        isDesktopLayout ? "bg-[#ededed]" : "bg-[color:var(--bg-canvas)]",
      )}
    >
      <header className="sticky top-0 z-20 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.95)] px-2 py-2 backdrop-blur-xl">
        <div className="relative flex min-h-10 items-center gap-1.5">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--text-primary)] transition active:bg-black/5"
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="pointer-events-none absolute inset-x-12 text-center">
            <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
              {isFriend ? "朋友信息" : "详细资料"}
            </div>
            {isDesktopLayout ? (
              <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
                {character?.relationship || "查看角色资料"}
              </div>
            ) : null}
          </div>
          {character ? (
            <button
              type="button"
              onClick={() => void handleShareCharacterCard()}
              className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--text-primary)] transition active:bg-black/5"
              aria-label={nativeMobileShareSupported ? "分享名片" : "复制名片"}
            >
              {nativeMobileShareSupported ? <Share2 size={17} /> : <Copy size={17} />}
            </button>
          ) : (
            <div className="ml-auto h-9 w-9 shrink-0" aria-hidden="true" />
          )}
        </div>
      </header>

      {characterQuery.isLoading ? (
        <div className="px-4 py-3">
          {isDesktopLayout ? (
            <LoadingBlock label="正在读取朋友资料..." />
          ) : (
            <MobileCharacterStatusCard
              badge="读取中"
              title="正在读取朋友资料"
              description="稍等一下，正在同步这个联系人的资料和关系状态。"
              tone="loading"
            />
          )}
        </div>
      ) : null}

      {characterQuery.isError && characterQuery.error instanceof Error ? (
        <div className="px-4 py-3">
          {isDesktopLayout ? (
            <ErrorBlock message={characterQuery.error.message} />
          ) : (
            <MobileCharacterStatusCard
              badge="联系人"
              title="联系人资料暂时不可用"
              description={characterQuery.error.message}
              tone="danger"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void characterQuery.refetch();
                  }}
                  className="rounded-full"
                >
                  重新加载
                </Button>
              }
            />
          )}
        </div>
      ) : null}

      {!characterQuery.isLoading && !character ? (
        <div className="px-4 py-3">
          {isDesktopLayout ? (
            <EmptyState
              title="角色不存在"
              description="这个资料暂时不可用，返回通讯录再试一次。"
            />
          ) : (
            <MobileCharacterStatusCard
              badge="联系人"
              title="角色不存在"
              description="这个资料暂时不可用，返回通讯录再试一次。"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    void navigate({ to: "/tabs/contacts" });
                  }}
                  className="rounded-full"
                >
                  返回通讯录
                </Button>
              }
            />
          )}
        </div>
      ) : null}

      {character ? (
        <div
          className={cn(
            "space-y-1.5 px-3 pb-6 pt-2.5",
            isDesktopLayout ? "mx-auto w-full max-w-[720px]" : undefined,
          )}
        >
          {notice ? (
            <InlineNotice
              tone={notice.tone}
              className={
                isDesktopLayout
                  ? undefined
                  : "rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
              }
            >
              {notice.message}
            </InlineNotice>
          ) : null}
          {entryNotice ? (
            <DigitalHumanEntryNotice
              tone={entryNotice.tone}
              message={entryNotice.message}
              onDismiss={() => {
                resetEntryGuard();
              }}
              onContinue={() => {
                resetEntryGuard();
                openCallMutation.mutate("video");
              }}
              onSwitchToVoice={() => {
                resetEntryGuard();
                openCallMutation.mutate("voice");
              }}
              continueLabel={
                openCallMutation.isPending
                  ? "正在接通视频..."
                  : entryNotice.continueLabel
              }
              voiceLabel={
                openCallMutation.isPending
                  ? "正在接通语音..."
                  : entryNotice.voiceLabel
              }
              compact={!isDesktopLayout}
            />
          ) : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={friendsQuery.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {friendsQuery.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {friendRequestsQuery.isError &&
          friendRequestsQuery.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={friendRequestsQuery.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {friendRequestsQuery.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {blockedQuery.isError && blockedQuery.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={blockedQuery.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {blockedQuery.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {startChatMutation.isError &&
          startChatMutation.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={startChatMutation.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {startChatMutation.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {openCallMutation.isError &&
          openCallMutation.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={openCallMutation.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {openCallMutation.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {sendFriendRequestMutation.isError &&
          sendFriendRequestMutation.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={sendFriendRequestMutation.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {sendFriendRequestMutation.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {setStarredMutation.isError &&
          setStarredMutation.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={setStarredMutation.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {setStarredMutation.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {updateProfileMutation.isError &&
          updateProfileMutation.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={updateProfileMutation.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {updateProfileMutation.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {blockMutation.isError && blockMutation.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={blockMutation.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {blockMutation.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}
          {deleteFriendMutation.isError &&
          deleteFriendMutation.error instanceof Error ? (
            isDesktopLayout ? (
              <ErrorBlock message={deleteFriendMutation.error.message} />
            ) : (
              <MobileCharacterErrorNotice>
                {deleteFriendMutation.error.message}
              </MobileCharacterErrorNotice>
            )
          ) : null}

          <section
            className={cn(
              "overflow-hidden border bg-white",
              isDesktopLayout
                ? "rounded-[18px] border-black/5"
                : "mt-2 -mx-3 rounded-none border-x-0 border-[color:var(--border-faint)]",
            )}
          >
            <div className="flex items-start gap-4 px-4 py-4">
              <AvatarChip
                name={character.name}
                src={character.avatar}
                size={isDesktopLayout ? "xl" : "lg"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "truncate font-medium text-[color:var(--text-primary)]",
                      isDesktopLayout ? "text-[24px]" : "text-[22px]",
                    )}
                  >
                    {displayName}
                  </div>
                  {friendship?.isStarred ? (
                    <Star
                      size={16}
                      className="shrink-0 text-[#d4a72c]"
                      fill="currentColor"
                    />
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  {remarkName
                    ? `昵称：${character.name}`
                    : character.relationship}
                </div>
                <div
                  className={cn(
                    "mt-1 text-[color:var(--text-muted)]",
                    isDesktopLayout ? "text-sm" : "text-[12px]",
                  )}
                >
                  隐界号：yinjie_{character.id.slice(0, 8)}
                </div>
                <div
                  className={cn(
                    "text-[color:var(--text-secondary)]",
                    isDesktopLayout
                      ? "mt-3 text-sm leading-6"
                      : "mt-2 text-[13px] leading-5",
                  )}
                >
                  {signature}
                </div>
              </div>
            </div>
          </section>

          <section
            className={cn(
              "overflow-hidden border",
              isDesktopLayout
                ? "rounded-[18px] border-black/5 bg-black/5"
                : "-mx-3 rounded-none border-x-0 border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
            )}
          >
            <div
              className={cn(
                "grid gap-px",
                isFriend ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              <ActionPanelButton
                icon={<MessageCircleMore size={18} />}
                label={startChatMutation.isPending ? "正在打开..." : "发消息"}
                onClick={() => startChatMutation.mutate()}
                disabled={startChatMutation.isPending}
                compact={!isDesktopLayout}
              />
              {isFriend ? (
                <>
                  <ActionPanelButton
                    icon={<Phone size={18} />}
                    label={
                      openCallMutation.isPending ? "正在接通..." : "语音通话"
                    }
                    onClick={handleVoiceCall}
                    disabled={openCallMutation.isPending}
                    compact={!isDesktopLayout}
                  />
                  <ActionPanelButton
                    icon={<Video size={18} />}
                    label={
                      openCallMutation.isPending ? "正在接通..." : "视频通话"
                    }
                    onClick={handleVideoCall}
                    disabled={openCallMutation.isPending}
                    compact={!isDesktopLayout}
                  />
                </>
              ) : (
                <ActionPanelButton
                  icon={<ChevronRight size={18} />}
                  label={
                    hasPendingFriendRequest
                      ? isDesktopLayout
                        ? "查看好友申请"
                        : "通过好友申请"
                      : sendFriendRequestMutation.isPending
                        ? "发送中..."
                        : "添加到通讯录"
                  }
                  onClick={handleAddToContacts}
                  disabled={
                    isDesktopLayout
                      ? !characterId
                      : sendFriendRequestMutation.isPending
                  }
                  compact={!isDesktopLayout}
                />
              )}
            </div>
          </section>

          <ProfileSection
            title={isFriend ? "资料设置" : "基本资料"}
            flatOnMobile={!isDesktopLayout}
            compact={!isDesktopLayout}
          >
            {isFriend ? (
              <ProfileRow
                label="设置备注和标签"
                value={buildRemarkSummary(
                  friendship?.remarkName,
                  friendship?.tags,
                )}
                onClick={() => setIsEditingProfile((current) => !current)}
                compact={!isDesktopLayout}
              />
            ) : null}
            {isFriend && isEditingProfile ? (
              <div className="border-t border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] px-4 py-2.5">
                <div className="space-y-3">
                  <DetailInputField
                    label="备注"
                    value={profileForm.remarkName}
                    placeholder="给朋友设置备注名"
                    onChange={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        remarkName: value,
                      }))
                    }
                    compact={!isDesktopLayout}
                  />
                  <DetailInputField
                    label="标签"
                    value={profileForm.tags}
                    placeholder="用逗号分隔，例如：同事，策展"
                    onChange={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        tags: value,
                      }))
                    }
                    compact={!isDesktopLayout}
                  />
                </div>
                <div className="mt-3.5 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIsEditingProfile(false);
                      setProfileForm({
                        remarkName: friendship?.remarkName ?? "",
                        tags: friendship?.tags?.join("，") ?? "",
                      });
                    }}
                    className="h-8 flex-1 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[#f5f7f7]"
                    disabled={updateProfileMutation.isPending}
                  >
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void handleSaveProfile()}
                    className="h-8 flex-1 rounded-[10px] bg-[#07c160] px-3 text-[12px] text-white shadow-none hover:bg-[#06ad56]"
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending ? "保存中..." : "保存"}
                  </Button>
                </div>
              </div>
            ) : null}
            <ProfileRow
              label="地区"
              value={
                isFriend
                  ? friendship?.region?.trim() || "未设置"
                  : character.relationship || "世界角色"
              }
              compact={!isDesktopLayout}
            />
            <ProfileRow
              label="来源"
              value={
                isFriend
                  ? friendship?.source?.trim() || "未设置"
                  : "世界内自然认识"
              }
              compact={!isDesktopLayout}
            />
            <ProfileRow
              label="标签"
              value={isFriend ? tagSummary : "未设置"}
              compact={!isDesktopLayout}
            />
            <ProfileRow
              label="个性签名"
              value={signature}
              multiline
              compact={!isDesktopLayout}
            />
            <ProfileRow
              label="最近互动"
              value={
                isFriend
                  ? formatTimestamp(
                      friendship?.lastInteractedAt ?? character.lastActiveAt,
                    )
                  : formatTimestamp(character.lastActiveAt)
              }
              compact={!isDesktopLayout}
            />
            <ProfileRow
              label="朋友圈"
              value={
                !isFriend
                  ? "加为好友后可查看"
                  : isDesktopLayout
                    ? "查看这位好友最近的朋友圈"
                    : "请在桌面端查看"
              }
              onClick={
                isFriend && isDesktopLayout
                  ? () => {
                      void navigate({
                        to: "/tabs/moments",
                        hash: buildDesktopMomentsRouteHash({
                          authorId: character.id,
                        }),
                      });
                    }
                  : undefined
              }
              compact={!isDesktopLayout}
            />
          </ProfileSection>

          <ProfileSection
            title="更多信息"
            flatOnMobile={!isDesktopLayout}
            compact={!isDesktopLayout}
          >
            <ProfileRow label="当前状态" value={activitySummary} compact={!isDesktopLayout} />
            <ProfileRow
              label="擅长领域"
              value={expertiseSummary}
              multiline
              compact={!isDesktopLayout}
            />
            <ProfileRow label="语气风格" value={toneSummary} compact={!isDesktopLayout} />
            <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
              <div
                className={cn(
                  "text-[color:var(--text-muted)]",
                  isDesktopLayout
                    ? "text-xs uppercase tracking-[0.16em]"
                    : "text-[11px]",
                )}
              >
                角色简介
              </div>
              <div
                className={cn(
                  "mt-2 text-[color:var(--text-secondary)]",
                  isDesktopLayout ? "text-sm leading-7" : "text-[13px] leading-6",
                )}
              >
                {character.bio?.trim() || "暂时没有更多介绍。"}
              </div>
            </div>
          </ProfileSection>

          <ProfileSection
            title="关系管理"
            flatOnMobile={!isDesktopLayout}
            compact={!isDesktopLayout}
          >
            {isFriend ? (
              <ProfileSwitchRow
                label="设为星标朋友"
                checked={friendship?.isStarred ?? false}
                onToggle={() =>
                  setStarredMutation.mutate(!(friendship?.isStarred ?? false))
                }
                disabled={setStarredMutation.isPending}
                compact={!isDesktopLayout}
              />
            ) : null}
            <ProfileRow
              label={isBlocked ? "移出黑名单" : "加入黑名单"}
              value={
                blockMutation.isPending
                  ? "正在更新..."
                  : isBlocked
                    ? "恢复正常联系"
                    : "不再接收对方互动"
              }
              danger
              onClick={handleBlockAction}
              disabled={blockMutation.isPending}
              compact={!isDesktopLayout}
            />
            {isFriend ? (
              <ProfileRow
                label="删除联系人"
                value={
                  deleteFriendMutation.isPending
                    ? "正在删除..."
                    : "从通讯录移除"
                }
                danger
                onClick={handleDeleteFriendAction}
                disabled={deleteFriendMutation.isPending}
                compact={!isDesktopLayout}
              />
            ) : null}
          </ProfileSection>

          {!isDesktopLayout ? (
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
                        disabled:
                          blockMutation.isPending || deleteFriendMutation.isPending,
                        onClick: () => {
                          setDangerSheetAction(null);
                          dangerSheetConfig.onConfirm();
                        },
                      },
                    ]
                  : []
              }
            />
          ) : null}
        </div>
      ) : null}
    </AppPage>
  );
}

function MobileCharacterStatusCard({
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

function MobileCharacterErrorNotice({ children }: { children: ReactNode }) {
  return (
    <InlineNotice
      tone="danger"
      className="rounded-[11px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
    >
      {children}
    </InlineNotice>
  );
}

function ActionPanelButton({
  icon,
  label,
  onClick,
  disabled = false,
  compact = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center bg-white text-[color:var(--text-primary)] transition active:bg-[color:var(--surface-console)] disabled:opacity-45",
        compact ? "min-h-[70px] gap-1.5" : "min-h-[78px] gap-2",
      )}
    >
      <span className="text-[color:var(--text-secondary)]">{icon}</span>
      <span className={compact ? "text-[13px]" : "text-sm"}>{label}</span>
    </button>
  );
}

function ProfileSection({
  title,
  children,
  flatOnMobile = false,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  flatOnMobile?: boolean;
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden bg-white",
        flatOnMobile
          ? "-mx-3 rounded-none border-y border-[color:var(--border-faint)]"
          : "rounded-[18px] border border-[color:var(--border-faint)]",
      )}
    >
      <div
        className={cn(
          flatOnMobile
            ? compact
              ? "px-4 py-2 text-[11px] text-[color:var(--text-muted)]"
              : "px-4 py-2.5 text-[12px] text-[color:var(--text-muted)]"
            : "px-4 py-3 text-xs uppercase tracking-[0.16em] text-[#8c8c8c]",
        )}
      >
        {title}
      </div>
      <div className="border-t border-[color:var(--border-faint)]">{children}</div>
    </section>
  );
}

function ProfileRow({
  label,
  value,
  onClick,
  danger = false,
  disabled = false,
  multiline = false,
  compact = false,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  compact?: boolean;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex w-full items-center gap-4 text-left transition active:bg-[color:var(--surface-card-hover)] disabled:opacity-60",
          compact ? "px-4 py-3 text-[13px]" : "px-4 py-4 text-sm",
        )}
      >
        <div
          className={cn(
            compact ? "w-[5.5rem] shrink-0" : "w-24 shrink-0",
            danger ? "text-[#d74b45]" : "text-[color:var(--text-primary)]",
          )}
        >
          {label}
        </div>
        <div
          className={cn(
            "min-w-0 flex-1 text-right",
            multiline
              ? "whitespace-pre-wrap break-words text-[color:var(--text-muted)]"
              : "truncate text-[color:var(--text-muted)]",
            danger ? "text-[#d74b45]" : undefined,
          )}
        >
          {value}
        </div>
        <ChevronRight
          size={compact ? 16 : 18}
          className="shrink-0 text-[#c7c7cc]"
        />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full items-center gap-4 text-left",
        compact ? "px-4 py-3 text-[13px]" : "px-4 py-4 text-sm",
      )}
    >
      <div
        className={cn(
          compact ? "w-[5.5rem] shrink-0" : "w-24 shrink-0",
          danger ? "text-[#d74b45]" : "text-[color:var(--text-primary)]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 text-right text-[color:var(--text-muted)]",
          multiline ? "whitespace-pre-wrap break-words" : "truncate",
          danger ? "text-[#d74b45]" : undefined,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ProfileSwitchRow({
  label,
  checked,
  onToggle,
  disabled = false,
  compact = false,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 text-left transition active:bg-[color:var(--surface-card-hover)] disabled:opacity-60",
        compact ? "min-h-12" : "min-h-14",
      )}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={cn(
          "text-[color:var(--text-primary)]",
          compact ? "text-[14px]" : "text-[16px]",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          compact ? "relative h-7 w-11 rounded-full transition-colors" : "relative h-8 w-13 rounded-full transition-colors",
          checked ? "bg-[#07c160]" : "bg-[#d5d5d5]",
        )}
      >
        <span
          className={cn(
            compact
              ? "absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
              : "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
            checked ? (compact ? "translate-x-4" : "translate-x-6") : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

function DetailInputField({
  label,
  value,
  placeholder,
  onChange,
  compact = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <div
        className={cn(
          "mb-2 text-[color:var(--text-muted)]",
          compact ? "text-[11px]" : "text-xs uppercase tracking-[0.12em]",
        )}
      >
        {label}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full border border-[color:var(--border-faint)] bg-white px-3 text-[color:var(--text-primary)] outline-none transition focus:border-[rgba(7,193,96,0.18)] focus:bg-white placeholder:text-[color:var(--text-dim)]",
          compact
            ? "rounded-[11px] py-2.5 text-[13px]"
            : "rounded-[12px] py-3 text-sm",
        )}
      />
    </label>
  );
}

function buildRemarkSummary(
  remarkName?: string | null,
  tags?: string[] | null,
) {
  const segments = [
    remarkName?.trim(),
    tags?.filter(Boolean).join("、"),
  ].filter(Boolean);

  return segments.length ? segments.join(" · ") : "未设置";
}

function isMissingCharacterError(error: unknown, characterId: string) {
  return (
    error instanceof Error &&
    error.message.trim() === `Character ${characterId} not found`
  );
}
