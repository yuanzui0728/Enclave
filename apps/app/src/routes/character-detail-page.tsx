import { useEffect, useMemo, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Star } from "lucide-react";
import {
  blockCharacter,
  deleteFriend,
  getBlockedCharacters,
  getCharacter,
  getConversations,
  getFriendRequests,
  getFriends,
  getOrCreateConversation,
  markFollowupRecommendationChatStarted,
  markFollowupRecommendationFriendRequestPending,
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
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import { DigitalHumanEntryNotice } from "../features/chat/digital-human-entry-notice";
import { buildMobileChatRouteHash } from "../features/chat/mobile-chat-route-state";
import { useDigitalHumanEntryGuard } from "../features/chat/use-digital-human-entry-guard";
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { ContactDetailPane } from "../features/contacts/contact-detail-pane";
import {
  buildCharacterDetailRouteHash,
  parseCharacterDetailRouteState,
} from "../features/contacts/character-detail-route-state";
import { buildDesktopContactsRouteHash } from "../features/contacts/contacts-route-state";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
} from "../features/desktop/chat/desktop-chat-route-state";
import { buildMobileFriendRequestsRouteHash } from "../features/contacts/mobile-friend-requests-route-state";
import { buildMobileFriendMomentsRouteHash } from "../features/moments/mobile-friend-moments-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";
import { translateRuntimeMessage } from "@yinjie/i18n";

const CHARACTER_DETAIL_BLOCK_REASON = "character_detail_block";

type FriendProfileFormState = {
  remarkName: string;
  tags: string;
};

async function buildDesktopAddFriendRouteHashOnDemand(input: {
  keyword: string;
  characterId?: string;
  openCompose?: boolean;
  recommendationId?: string;
}) {
  const { buildDesktopAddFriendRouteHash } =
    await import("../features/contacts/add-friend-route-state");
  return buildDesktopAddFriendRouteHash(input);
}

async function buildDesktopFriendMomentsRouteHashOnDemand(input: {
  momentId?: string;
  source?: "character-detail";
  returnPath?: string;
  returnHash?: string;
}) {
  const { buildDesktopFriendMomentsRouteHash } =
    await import("../features/moments/friend-moments-route-state");
  return buildDesktopFriendMomentsRouteHash(input);
}

async function buildDesktopContactsRouteHashOnDemand(input: {
  characterId?: string;
  isFriend: boolean;
}) {
  const { buildDesktopContactsRouteHash } =
    await import("../features/contacts/contacts-route-state");
  return buildDesktopContactsRouteHash({
    pane: input.isFriend ? "friend" : "world-character",
    characterId: input.characterId,
    showWorldCharacters: !input.isFriend,
  });
}

export function CharacterDetailPage() {
  const t = translateRuntimeMessage;
  const { characterId } = useParams({ from: "/character/$characterId" });
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username) ?? t(msg`我`);
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const [notice, setNotice] = useState<{
    tone: "success" | "info" | "warning";
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [mobileSheetAction, setMobileSheetAction] = useState<
    "call" | "block" | "delete" | null
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
  const routeState = useMemo(
    () => parseCharacterDetailRouteState(hash),
    [hash],
  );
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const recommendationId = routeState.recommendationId;
  const safeMobileReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeMobileReturnHash = safeMobileReturnPath
    ? routeState.returnHash
    : undefined;
  const mobileCurrentRouteHash = useMemo(
    () =>
      buildCharacterDetailRouteHash({
        recommendationId,
        returnPath: safeMobileReturnPath,
        returnHash: safeMobileReturnHash,
      }),
    [recommendationId, safeMobileReturnHash, safeMobileReturnPath],
  );

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

    if (routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)) {
      void navigate({
        to: routeState.returnPath,
        ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/contacts", replace: true });
  }, [
    characterId,
    characterQuery.error,
    characterQuery.isLoading,
    navigate,
    routeState.returnHash,
    routeState.returnPath,
  ]);

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
  const unsetLabel = t(msg`未设置`);
  const worldContactLabel = t(msg`世界联系人`);
  const worldRoleLabel = t(msg`世界角色`);
  const friendInfoLabel = t(msg`朋友信息`);
  const detailInfoLabel = t(msg`详细资料`);
  const loadingFriendProfileLabel = t(msg`正在读取朋友资料...`);
  const loadingFriendProfileTitle = t(msg`正在读取朋友资料`);
  const loadingFriendProfileDescription = t(
    msg`稍等一下，正在同步这个联系人的资料和关系状态。`,
  );
  const unavailableContactBadge = t(msg`联系人`);
  const unavailableContactProfileTitle = t(msg`联系人资料暂时不可用`);
  const missingCharacterTitle = t(msg`角色不存在`);
  const missingCharacterDescription = t(
    msg`这个资料暂时不可用，返回通讯录再试一次。`,
  );
  const missingCharacterRetryPreviousDescription = t(
    msg`这个资料暂时不可用，可以先重试读取，或返回上一页后再试。`,
  );
  const missingCharacterRetryContactsDescription = t(
    msg`这个资料暂时不可用，可以先重试读取，或返回通讯录后再试。`,
  );
  const retryLoadLabel = t(msg`重试读取`);
  const backButtonLabel = t(msg`返回`);
  const backToPreviousPageLabel = t(msg`返回上一页`);
  const backToContactsLabel = t(msg`返回通讯录`);
  const loadingBadgeLabel = t(msg`读取中`);
  const viewCharacterProfileLabel = t(msg`查看角色资料`);
  const videoConnectingLabel = t(msg`正在接通视频...`);
  const voiceConnectingLabel = t(msg`正在接通语音...`);
  const openingLabel = t(msg`正在打开...`);
  const connectingLabel = t(msg`正在接通...`);
  const sendMessageLabel = t(msg`发消息`);
  const voiceCallLabel = t(msg`语音通话`);
  const audioVideoCallLabel = t(msg`音视频通话`);
  const viewFriendRequestLabel = t(msg`查看好友申请`);
  const sendingLabel = t(msg`发送中...`);
  const addToContactsLabel = t(msg`添加到通讯录`);
  const profileSectionTitle = t(msg`资料`);
  const settingsRemarkTagsLabel = t(msg`设置备注和标签`);
  const remarkLabel = t(msg`备注`);
  const remarkPlaceholder = t(msg`给朋友设置备注名`);
  const tagsLabel = t(msg`标签`);
  const tagsPlaceholder = t(msg`用逗号分隔，例如：同事，策展`);
  const cancelLabel = t(msg`取消`);
  const savingLabel = t(msg`保存中...`);
  const saveLabel = t(msg`保存`);
  const regionLabel = t(msg`地区`);
  const sourceLabel = t(msg`来源`);
  const metInWorldLabel = t(msg`世界内自然认识`);
  const momentsLabel = t(msg`朋友圈`);
  const momentsValueLabel = t(msg`查看这位角色最近的朋友圈`);
  const recommendToFriendLabel = t(msg`推荐给朋友`);
  const openSystemShareLabel = t(msg`打开系统分享面板`);
  const copyCardLabel = t(msg`复制这张隐界名片`);
  const moreInfoTitle = t(msg`更多资料`);
  const recentInteractionLabel = t(msg`最近互动`);
  const commonGroupsLabel = t(msg`共同群聊`);
  const currentStatusLabel = t(msg`当前状态`);
  const expertiseLabel = t(msg`擅长领域`);
  const toneStyleLabel = t(msg`语气风格`);
  const coreDirectiveLabel = t(msg`核心理念`);
  const bioLabel = t(msg`角色简介`);
  const noMoreIntroLabel = t(msg`暂时没有更多介绍。`);
  const friendPermissionsTitle = t(msg`朋友权限`);
  const relationshipManagementTitle = t(msg`关系管理`);
  const starredFriendLabel = t(msg`设为星标朋友`);
  const updatingLabel = t(msg`正在更新...`);
  const restoreNormalContactLabel = t(msg`恢复正常联系`);
  const stopReceivingInteractionLabel = t(msg`不再接收对方互动`);
  const deleteContactLabel = t(msg`删除联系人`);
  const deletingLabel = t(msg`正在删除...`);
  const removeFromContactsLabel = t(msg`从通讯录移除`);
  const remarkName = friendship?.remarkName?.trim() ?? "";
  const displayName = remarkName || character?.name || detailInfoLabel;
  const signature =
    character?.currentStatus?.trim() ||
    character?.bio?.trim() ||
    t(msg`这个角色还没有个性签名。`);
  const expertiseSummary = character?.expertDomains?.length
    ? character.expertDomains.join("、")
    : unsetLabel;
  const activitySummary =
    character?.currentActivity?.trim() ||
    character?.relationship?.trim() ||
    t(msg`暂无状态`);
  const toneSummary =
    character?.profile?.traits?.emotionalTone?.trim() || unsetLabel;
  const coreDirective = character?.profile?.coreDirective?.trim() || "";
  const tagSummary = friendship?.tags?.length
    ? friendship.tags.join("、")
    : unsetLabel;

  const navigateToDesktopContactsSelection = ({
    replace = false,
    isFriend: nextIsFriend = isFriend,
  }: {
    replace?: boolean;
    isFriend?: boolean;
  } = {}) => {
    void buildDesktopContactsRouteHashOnDemand({
      characterId,
      isFriend: nextIsFriend,
    })
      .then((desktopHash) => {
        void navigate({
          to: "/tabs/contacts",
          hash: desktopHash,
          replace,
        });
      })
      .catch(() => {
        void navigate({ to: "/tabs/contacts", replace });
      });
  };

  const navigateToRouteStateReturn = ({
    replace = false,
  }: {
    replace?: boolean;
  } = {}) => {
    if (!routeState.returnPath) {
      return false;
    }

    if (!isDesktopLayout && isDesktopOnlyPath(routeState.returnPath)) {
      return false;
    }

    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
      replace,
    });
    return true;
  };
  const renderMobileErrorBackAction = () => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
      onClick={() => {
        if (navigateToRouteStateReturn()) {
          return;
        }

        void navigate({ to: "/tabs/contacts" });
      }}
    >
      {safeMobileReturnPath ? backToPreviousPageLabel : backToContactsLabel}
    </Button>
  );
  const renderMobileRetryCharacterLoadAction = () => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
      onClick={() => {
        void characterQuery.refetch();
      }}
    >
      {retryLoadLabel}
    </Button>
  );

  useEffect(() => {
    setNotice(null);
    setMobileSheetAction(null);
    setIsEditingProfile(false);
    resetEntryGuard();
    setProfileForm({
      remarkName: friendship?.remarkName ?? "",
      tags: friendship?.tags?.join("，") ?? "",
    });
  }, [characterId, friendship?.remarkName, friendship?.tags, resetEntryGuard]);

  const startChatMutation = useMutation({
    mutationFn: async () => {
      if (!character) {
        return null;
      }

      return getOrCreateConversation({ characterId }, baseUrl);
    },
    onSuccess: async (conversation) => {
      if (!conversation) {
        return;
      }

      if (recommendationId) {
        await markFollowupRecommendationChatStarted(
          recommendationId,
          baseUrl,
        ).catch(() => undefined);
      }
      void navigate({
        to: isDesktopLayout
          ? buildDesktopChatThreadPath({
              conversationId: conversation.id,
            })
          : "/chat/$conversationId",
        params: isDesktopLayout
          ? undefined
          : { conversationId: conversation.id },
        hash: isDesktopLayout
          ? undefined
          : buildMobileChatRouteHash({
              returnPath: `/character/${characterId}`,
              returnHash: mobileCurrentRouteHash || undefined,
            }),
      });
    },
  });
  const openCallMutation = useMutation({
    mutationFn: async (kind: "voice" | "video") => {
      if (!character) {
        return null;
      }

      const conversation = await getOrCreateConversation(
        { characterId },
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
        to: isDesktopLayout
          ? "/tabs/chat"
          : result.kind === "voice"
            ? "/chat/$conversationId/voice-call"
            : "/chat/$conversationId/video-call",
        params: isDesktopLayout
          ? undefined
          : { conversationId: result.conversation.id },
        hash: isDesktopLayout
          ? buildDesktopChatRouteHash({
              conversationId: result.conversation.id,
              callAction: result.kind,
            })
          : buildMobileChatRouteHash({
              returnPath: `/character/${characterId}`,
              returnHash: mobileCurrentRouteHash || undefined,
            }),
      });
    },
  });
  const sendFriendRequestMutation = useMutation({
    mutationFn: async () => {
      const request = await sendFriendRequest(
        {
          characterId,
          greeting: t(msg`${ownerName} 想把你加到通讯录里。`),
          autoAccept: recommendationId ? false : true,
        },
        baseUrl,
      );
      if (recommendationId) {
        await markFollowupRecommendationFriendRequestPending(
          recommendationId,
          { friendRequestId: request.id },
          baseUrl,
        ).catch(() => undefined);
      }
      return request;
    },
    onSuccess: async () => {
      setNotice({
        tone: "success",
        message: recommendationId
          ? t(msg`好友申请已发送。`)
          : t(msg`已添加到通讯录。`),
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
        message: starred ? t(msg`已设为星标朋友。`) : t(msg`已取消星标朋友。`),
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
  });
  const pinMutation = useMutation({
    mutationFn: async (pinned: boolean) => {
      const conversationId =
        selectedConversation &&
        !isPersistedGroupConversation(selectedConversation)
          ? selectedConversation.id
          : (await getOrCreateConversation({ characterId }, baseUrl)).id;

      return setConversationPinned(conversationId, { pinned }, baseUrl);
    },
    onSuccess: async (_, pinned) => {
      setNotice({
        tone: "success",
        message: pinned ? t(msg`聊天已置顶。`) : t(msg`聊天已取消置顶。`),
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
  });
  const muteMutation = useMutation({
    mutationFn: async (muted: boolean) => {
      const conversationId =
        selectedConversation &&
        !isPersistedGroupConversation(selectedConversation)
          ? selectedConversation.id
          : (await getOrCreateConversation({ characterId }, baseUrl)).id;

      return setConversationMuted(conversationId, { muted }, baseUrl);
    },
    onSuccess: async (_, muted) => {
      setNotice({
        tone: "success",
        message: muted
          ? t(msg`已开启消息免打扰。`)
          : t(msg`已关闭消息免打扰。`),
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
        message: t(msg`朋友资料已更新。`),
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
          reason: CHARACTER_DETAIL_BLOCK_REASON,
        },
        baseUrl,
      );
    },
    onSuccess: async (_, blocked) => {
      setNotice({
        tone: "success",
        message: blocked ? t(msg`已移出黑名单。`) : t(msg`已加入黑名单。`),
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
      if (navigateToRouteStateReturn({ replace: true })) {
        return;
      }

      if (isDesktopLayout) {
        navigateToDesktopContactsSelection({ isFriend: false });
        return;
      }

      void navigate({ to: "/tabs/contacts" });
    },
  });

  const handleBack = () => {
    navigateBackOrFallback(() => {
      if (navigateToRouteStateReturn()) {
        return;
      }

      if (isDesktopLayout) {
        navigateToDesktopContactsSelection();
        return;
      }

      void navigate({ to: "/tabs/contacts" });
    });
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
      t(msg`${displayName} 的隐界名片`),
      character.relationship?.trim() || worldContactLabel,
      t(msg`隐界号：yinjie_${character.id.slice(0, 8)}`),
      profileUrl,
    ].join("\n");

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: t(msg`${displayName} 的隐界名片`),
        text: profileSummary,
        url: profileUrl,
      });

      if (shared) {
        setNotice({
          tone: "success",
          message: t(msg`已打开系统分享面板。`),
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
          ? t(msg`当前设备暂时无法打开系统分享，请稍后重试。`)
          : t(msg`当前环境暂不支持复制名片。`),
        actionLabel: nativeMobileShareSupported
          ? t(msg`重试分享`)
          : t(msg`重试复制`),
        onAction: () => {
          void handleShareCharacterCard();
        },
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(profileSummary);
      setNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? t(msg`系统分享暂时不可用，已复制名片摘要。`)
          : t(msg`名片摘要已复制。`),
      });
    } catch {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? t(msg`系统分享失败，请稍后重试。`)
          : t(msg`复制名片失败，请稍后重试。`),
        actionLabel: nativeMobileShareSupported
          ? t(msg`重试分享`)
          : t(msg`重试复制`),
        onAction: () => {
          void handleShareCharacterCard();
        },
      });
    }
  };
  const handleBlockAction = () => {
    if (isDesktopLayout) {
      const confirmed = window.confirm(
        isBlocked
          ? t(msg`确认把这个角色移出黑名单吗？`)
          : t(msg`加入黑名单后，将不再接收这个角色的互动。确认继续吗？`),
      );
      if (!confirmed) {
        return;
      }

      blockMutation.mutate(isBlocked);
      return;
    }

    setMobileSheetAction("block");
  };
  const handleDeleteFriendAction = () => {
    if (isDesktopLayout) {
      if (!window.confirm(t(msg`确认删除这个联系人吗？`))) {
        return;
      }

      deleteFriendMutation.mutate();
      return;
    }

    setMobileSheetAction("delete");
  };
  const handleAddToContacts = () => {
    if (hasPendingFriendRequest) {
      if (isDesktopLayout) {
        void navigate({
          to: "/tabs/contacts",
          hash: buildDesktopContactsRouteHash({
            pane: "new-friends",
            showWorldCharacters: false,
          }),
        });
        return;
      }

      void navigate({
        to: "/friend-requests",
        hash: buildMobileFriendRequestsRouteHash({
          returnPath: pathname,
          returnHash: mobileCurrentRouteHash || undefined,
        }),
      });
      return;
    }

    if (isDesktopLayout) {
      void buildDesktopAddFriendRouteHashOnDemand({
        keyword: character?.name ?? "",
        characterId,
        openCompose: true,
        recommendationId,
      })
        .then((desktopHash) => {
          void navigate({
            to: "/desktop/add-friend",
            hash: desktopHash,
          });
        })
        .catch(() => {
          void navigate({
            to: "/desktop/add-friend",
          });
        });
      return;
    }

    sendFriendRequestMutation.mutate();
  };
  const handleOpenMoments = () => {
    if (!character) {
      return;
    }

    if (isDesktopLayout) {
      void buildDesktopFriendMomentsRouteHashOnDemand({
        source: "character-detail",
        returnPath: `/character/${character.id}`,
        returnHash: normalizedHash || undefined,
      })
        .then((desktopHash) => {
          void navigate({
            to: "/desktop/friend-moments/$characterId",
            params: { characterId: character.id },
            hash: desktopHash,
          });
        })
        .catch(() => {
          void navigate({
            to: "/desktop/friend-moments/$characterId",
            params: { characterId: character.id },
          });
        });
      return;
    }

    void navigate({
      to: "/friend-moments/$characterId",
      params: { characterId: character.id },
      hash: buildMobileFriendMomentsRouteHash({
        returnPath: `/character/${character.id}`,
        returnHash: mobileCurrentRouteHash || undefined,
      }),
    });
  };
  const mobileSheetConfig =
    mobileSheetAction === "call"
      ? {
          title: t(msg`音视频通话`),
          description: t(msg`选择要发起的通话方式。`),
          actions: [
            {
              key: "voice",
              label: openCallMutation.isPending
                ? t(msg`正在接通语音...`)
                : t(msg`语音通话`),
              description: t(msg`进入语音通话`),
              disabled: openCallMutation.isPending,
              onClick: handleVoiceCall,
            },
            {
              key: "video",
              label: openCallMutation.isPending
                ? t(msg`正在接通视频...`)
                : t(msg`视频通话`),
              description: t(msg`进入视频通话`),
              disabled: openCallMutation.isPending,
              onClick: handleVideoCall,
            },
          ],
        }
      : mobileSheetAction === "block"
        ? {
            title: isBlocked ? t(msg`移出黑名单`) : t(msg`加入黑名单`),
            description: isBlocked
              ? t(msg`移出后将恢复正常联系与互动。`)
              : t(msg`加入黑名单后，将不再接收这个角色的互动。`),
            actions: [
              {
                key: "confirm",
                label: isBlocked ? t(msg`移出黑名单`) : t(msg`加入黑名单`),
                description: isBlocked
                  ? t(msg`恢复正常联系`)
                  : t(msg`后续互动会被拦截`),
                danger: !isBlocked,
                disabled: blockMutation.isPending,
                onClick: () => blockMutation.mutate(isBlocked),
              },
            ],
          }
        : mobileSheetAction === "delete"
          ? {
              title: t(msg`删除联系人`),
              description: t(msg`删除后会从通讯录移除这个联系人。`),
              actions: [
                {
                  key: "confirm",
                  label: t(msg`删除联系人`),
                  description: t(msg`此操作不可恢复`),
                  danger: true,
                  disabled: deleteFriendMutation.isPending,
                  onClick: () => deleteFriendMutation.mutate(),
                },
              ],
            }
          : null;

  if (isDesktopLayout && character && friendship) {
    return (
      <AppPage className="flex h-full min-h-0 flex-col overflow-hidden bg-[#ededed] px-0 py-0">
        <header className="shrink-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.95)] px-3 py-2 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-[640px] items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--text-primary)] transition active:bg-black/5"
              aria-label={backButtonLabel}
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                {friendInfoLabel}
              </div>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                      ? videoConnectingLabel
                      : entryNotice.continueLabel
                  }
                  voiceLabel={
                    openCallMutation.isPending
                      ? voiceConnectingLabel
                      : entryNotice.voiceLabel
                  }
                  compact={false}
                />
              </div>
            ) : null}
            {characterQuery.isLoading ? (
              <div className="mx-auto w-full max-w-[640px] px-3">
                <LoadingBlock label={loadingFriendProfileLabel} />
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
                void navigate({
                  to: buildDesktopChatThreadPath({
                    conversationId: groupId,
                  }),
                });
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
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage
      className={cn(
        "min-h-full space-y-0 bg-[#ededed] px-0 py-0 text-[color:var(--text-primary)]",
        !isDesktopLayout
          ? "flex h-full min-h-0 flex-col overflow-hidden"
          : undefined,
      )}
    >
      <header
        className={cn(
          "z-20 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.95)] px-2 py-2 backdrop-blur-xl",
          isDesktopLayout ? "sticky top-0" : "shrink-0",
        )}
      >
        <div className="relative flex min-h-10 items-center gap-1.5">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--text-primary)] transition active:bg-black/5"
            aria-label={backButtonLabel}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="pointer-events-none absolute inset-x-12 text-center">
            <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
              {isFriend ? friendInfoLabel : detailInfoLabel}
            </div>
            {isDesktopLayout ? (
              <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
                {character?.relationship || viewCharacterProfileLabel}
              </div>
            ) : null}
          </div>
          <div className="ml-auto h-9 w-9 shrink-0" aria-hidden="true" />
        </div>
      </header>

      <div
        className={cn(
          !isDesktopLayout
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain"
            : undefined,
        )}
      >
        {characterQuery.isLoading ? (
          <div className="px-4 py-3">
            {isDesktopLayout ? (
              <LoadingBlock label={loadingFriendProfileLabel} />
            ) : (
              <MobileCharacterStatusCard
                badge={loadingBadgeLabel}
                title={loadingFriendProfileTitle}
                description={loadingFriendProfileDescription}
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
                badge={unavailableContactBadge}
                title={unavailableContactProfileTitle}
                description={characterQuery.error.message}
                tone="danger"
                action={
                  <div className="flex flex-wrap gap-2">
                    {renderMobileRetryCharacterLoadAction()}
                    {renderMobileErrorBackAction()}
                  </div>
                }
              />
            )}
          </div>
        ) : null}

        {!characterQuery.isLoading && !character ? (
          <div className="px-4 py-3">
            {isDesktopLayout ? (
              <EmptyState
                title={missingCharacterTitle}
                description={missingCharacterDescription}
              />
            ) : (
              <MobileCharacterStatusCard
                badge={unavailableContactBadge}
                title={missingCharacterTitle}
                description={
                  safeMobileReturnPath
                    ? missingCharacterRetryPreviousDescription
                    : missingCharacterRetryContactsDescription
                }
                action={
                  <div className="flex flex-wrap gap-2">
                    {renderMobileRetryCharacterLoadAction()}
                    {renderMobileErrorBackAction()}
                  </div>
                }
              />
            )}
          </div>
        ) : null}

        {character ? (
          <div
            className={cn(
              "space-y-2.5 px-3 pt-2",
              isDesktopLayout
                ? "mx-auto w-full max-w-[720px] pb-8 pt-3"
                : "pb-4",
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
                {!isDesktopLayout && notice.tone === "info" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1">{notice.message}</span>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {notice.actionLabel && notice.onAction ? (
                        <InlineNoticeActionButton
                          label={notice.actionLabel}
                          onClick={notice.onAction}
                        />
                      ) : null}
                      {renderMobileErrorBackAction()}
                    </div>
                  </div>
                ) : (
                  notice.message
                )}
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
                    ? videoConnectingLabel
                    : entryNotice.continueLabel
                }
                voiceLabel={
                  openCallMutation.isPending
                    ? voiceConnectingLabel
                    : entryNotice.voiceLabel
                }
                compact={!isDesktopLayout}
              />
            ) : null}
            {friendsQuery.isError && friendsQuery.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={friendsQuery.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {friendsQuery.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {friendRequestsQuery.isError &&
            friendRequestsQuery.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={friendRequestsQuery.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {friendRequestsQuery.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {blockedQuery.isError && blockedQuery.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={blockedQuery.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {blockedQuery.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {startChatMutation.isError &&
            startChatMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={startChatMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {startChatMutation.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {openCallMutation.isError &&
            openCallMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={openCallMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {openCallMutation.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {sendFriendRequestMutation.isError &&
            sendFriendRequestMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={sendFriendRequestMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {sendFriendRequestMutation.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {setStarredMutation.isError &&
            setStarredMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={setStarredMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {setStarredMutation.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {updateProfileMutation.isError &&
            updateProfileMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={updateProfileMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {updateProfileMutation.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {blockMutation.isError && blockMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={blockMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {blockMutation.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {deleteFriendMutation.isError &&
            deleteFriendMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={deleteFriendMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {deleteFriendMutation.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}

            <section
              className={cn(
                "overflow-hidden bg-white",
                isDesktopLayout
                  ? "rounded-[18px] border border-black/5"
                  : "-mx-3 border-y border-[color:var(--border-faint)]",
              )}
            >
              <div className="flex items-start justify-between gap-4 px-4 py-4">
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
                  <div
                    className={cn(
                      "mt-1 text-[color:var(--text-secondary)]",
                      isDesktopLayout ? "text-sm" : "text-[13px]",
                    )}
                  >
                    {remarkName
                      ? t(msg`昵称：${character.name}`)
                      : character.relationship || worldContactLabel}
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-[color:var(--text-muted)]",
                      isDesktopLayout ? "text-sm" : "text-[12px]",
                    )}
                  >
                    {t(msg`隐界号：yinjie_${character.id.slice(0, 8)}`)}
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-[color:var(--text-muted)]",
                      isDesktopLayout ? "text-sm" : "text-[12px]",
                    )}
                  >
                    {isFriend
                      ? t(
                          msg`地区：${friendship?.region?.trim() || unsetLabel}`,
                        )
                      : t(
                          msg`身份：${character.relationship || worldRoleLabel}`,
                        )}
                  </div>
                </div>
                <AvatarChip
                  name={character.name}
                  src={character.avatar}
                  size={isDesktopLayout ? "xl" : "wechat"}
                />
              </div>
              <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
                <div
                  className={cn(
                    "text-[color:var(--text-secondary)]",
                    isDesktopLayout
                      ? "text-sm leading-6"
                      : "text-[13px] leading-6",
                  )}
                >
                  {signature}
                </div>
              </div>
            </section>

            {isDesktopLayout ? (
              <section className="overflow-hidden rounded-[18px] border border-black/5 bg-white p-4">
                <div
                  className={cn(
                    "grid gap-2",
                    isFriend ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  {isFriend ? (
                    <>
                      <Button
                        variant="primary"
                        onClick={() => {
                          setNotice(null);
                          startChatMutation.mutate();
                        }}
                        className="h-11 rounded-[12px] bg-[#07c160] text-[15px] text-white shadow-none hover:bg-[#06ad56]"
                        disabled={startChatMutation.isPending}
                      >
                        {startChatMutation.isPending
                          ? openingLabel
                          : sendMessageLabel}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setNotice(null);
                          handleVoiceCall();
                        }}
                        className="h-11 rounded-[12px] border-[color:var(--border-faint)] bg-white text-[15px] text-[color:var(--text-primary)] shadow-none hover:bg-[#f5f7f7]"
                        disabled={openCallMutation.isPending}
                      >
                        {openCallMutation.isPending
                          ? connectingLabel
                          : voiceCallLabel}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => {
                        setNotice(null);
                        handleAddToContacts();
                      }}
                      className="h-11 rounded-[12px] bg-[#07c160] text-[15px] text-white shadow-none hover:bg-[#06ad56]"
                      disabled={
                        sendFriendRequestMutation.isPending &&
                        !hasPendingFriendRequest
                      }
                    >
                      {hasPendingFriendRequest
                        ? viewFriendRequestLabel
                        : sendFriendRequestMutation.isPending
                          ? sendingLabel
                          : addToContactsLabel}
                    </Button>
                  )}
                </div>
              </section>
            ) : null}

            <ProfileSection
              title={profileSectionTitle}
              flatOnMobile={!isDesktopLayout}
              compact={!isDesktopLayout}
            >
              {isFriend ? (
                <ProfileRow
                  label={settingsRemarkTagsLabel}
                  value={buildRemarkSummary(
                    friendship?.remarkName,
                    friendship?.tags,
                    unsetLabel,
                  )}
                  onClick={() => setIsEditingProfile((current) => !current)}
                  compact={!isDesktopLayout}
                />
              ) : null}
              {isFriend && isEditingProfile ? (
                <div className="border-t border-[color:var(--border-faint)] bg-[#f7f7f7] px-4 py-3">
                  <div className="space-y-3">
                    <DetailInputField
                      label={remarkLabel}
                      value={profileForm.remarkName}
                      placeholder={remarkPlaceholder}
                      onChange={(value) =>
                        setProfileForm((current) => ({
                          ...current,
                          remarkName: value,
                        }))
                      }
                      compact={!isDesktopLayout}
                    />
                    <DetailInputField
                      label={tagsLabel}
                      value={profileForm.tags}
                      placeholder={tagsPlaceholder}
                      onChange={(value) =>
                        setProfileForm((current) => ({
                          ...current,
                          tags: value,
                        }))
                      }
                      compact={!isDesktopLayout}
                    />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsEditingProfile(false);
                        setProfileForm({
                          remarkName: friendship?.remarkName ?? "",
                          tags: friendship?.tags?.join("，") ?? "",
                        });
                      }}
                      className="h-9 flex-1 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[13px] shadow-none hover:bg-[#f5f7f7]"
                      disabled={updateProfileMutation.isPending}
                    >
                      {cancelLabel}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => void handleSaveProfile()}
                      className="h-9 flex-1 rounded-[10px] bg-[#07c160] px-3 text-[13px] text-white shadow-none hover:bg-[#06ad56]"
                      disabled={updateProfileMutation.isPending}
                    >
                      {updateProfileMutation.isPending
                        ? savingLabel
                        : saveLabel}
                    </Button>
                  </div>
                </div>
              ) : null}
              <ProfileRow
                label={regionLabel}
                value={
                  isFriend
                    ? friendship?.region?.trim() || unsetLabel
                    : character.relationship || worldRoleLabel
                }
                compact={!isDesktopLayout}
              />
              <ProfileRow
                label={sourceLabel}
                value={
                  isFriend
                    ? friendship?.source?.trim() || unsetLabel
                    : metInWorldLabel
                }
                compact={!isDesktopLayout}
              />
              {isFriend ? (
                <ProfileRow
                  label={tagsLabel}
                  value={tagSummary}
                  compact={!isDesktopLayout}
                />
              ) : null}
              <ProfileRow
                label={momentsLabel}
                value={momentsValueLabel}
                onClick={handleOpenMoments}
                compact={!isDesktopLayout}
              />
              <ProfileRow
                label={recommendToFriendLabel}
                value={
                  nativeMobileShareSupported
                    ? openSystemShareLabel
                    : copyCardLabel
                }
                onClick={() => void handleShareCharacterCard()}
                compact={!isDesktopLayout}
              />
            </ProfileSection>

            <ProfileSection
              title={moreInfoTitle}
              flatOnMobile={!isDesktopLayout}
              compact={!isDesktopLayout}
            >
              {isDesktopLayout ? (
                <ProfileRow
                  label={recentInteractionLabel}
                  value={
                    isFriend
                      ? formatTimestamp(
                          friendship?.lastInteractedAt ??
                            character.lastActiveAt,
                        )
                      : formatTimestamp(character.lastActiveAt)
                  }
                  compact={!isDesktopLayout}
                />
              ) : null}
              {commonGroups.length ? (
                <ProfileRow
                  label={commonGroupsLabel}
                  value={t(msg`${commonGroups.length} 个`)}
                  onClick={() => {
                    const firstGroup = commonGroups[0];
                    if (!firstGroup) {
                      return;
                    }

                    void navigate({
                      to: isDesktopLayout
                        ? buildDesktopChatThreadPath({
                            conversationId: firstGroup.id,
                          })
                        : "/group/$groupId",
                      params: isDesktopLayout
                        ? undefined
                        : { groupId: firstGroup.id },
                    });
                  }}
                  compact={!isDesktopLayout}
                />
              ) : null}
              {isDesktopLayout ? (
                <ProfileRow
                  label={currentStatusLabel}
                  value={activitySummary}
                  compact={!isDesktopLayout}
                />
              ) : null}
              {isDesktopLayout ? (
                <ProfileRow
                  label={expertiseLabel}
                  value={expertiseSummary}
                  multiline
                  compact={!isDesktopLayout}
                />
              ) : null}
              {isDesktopLayout ? (
                <ProfileRow
                  label={toneStyleLabel}
                  value={toneSummary}
                  compact={!isDesktopLayout}
                />
              ) : null}
              {coreDirective ? (
                <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
                  <div
                    className={cn(
                      "text-[color:var(--text-muted)]",
                      isDesktopLayout
                        ? "text-xs uppercase tracking-[0.16em]"
                        : "text-[11px]",
                    )}
                  >
                    {coreDirectiveLabel}
                  </div>
                  <div
                    className={cn(
                      "mt-2 text-[color:var(--text-secondary)]",
                      isDesktopLayout
                        ? "text-sm leading-7"
                        : "text-[13px] leading-6",
                    )}
                  >
                    {coreDirective}
                  </div>
                </div>
              ) : null}
              <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
                <div
                  className={cn(
                    "text-[color:var(--text-muted)]",
                    isDesktopLayout
                      ? "text-xs uppercase tracking-[0.16em]"
                      : "text-[11px]",
                  )}
                >
                  {bioLabel}
                </div>
                <div
                  className={cn(
                    "mt-2 text-[color:var(--text-secondary)]",
                    isDesktopLayout
                      ? "text-sm leading-7"
                      : "text-[13px] leading-6",
                  )}
                >
                  {character.bio?.trim() || noMoreIntroLabel}
                </div>
              </div>
            </ProfileSection>

            <ProfileSection
              title={
                isFriend ? friendPermissionsTitle : relationshipManagementTitle
              }
              flatOnMobile={!isDesktopLayout}
              compact={!isDesktopLayout}
            >
              {isFriend ? (
                <ProfileSwitchRow
                  label={starredFriendLabel}
                  checked={friendship?.isStarred ?? false}
                  onToggle={() =>
                    setStarredMutation.mutate(!(friendship?.isStarred ?? false))
                  }
                  disabled={setStarredMutation.isPending}
                  compact={!isDesktopLayout}
                />
              ) : null}
              <ProfileRow
                label={isBlocked ? t(msg`移出黑名单`) : t(msg`加入黑名单`)}
                value={
                  blockMutation.isPending
                    ? updatingLabel
                    : isBlocked
                      ? restoreNormalContactLabel
                      : stopReceivingInteractionLabel
                }
                danger
                onClick={handleBlockAction}
                disabled={blockMutation.isPending}
                compact={!isDesktopLayout}
              />
              {isFriend ? (
                <ProfileRow
                  label={deleteContactLabel}
                  value={
                    deleteFriendMutation.isPending
                      ? deletingLabel
                      : removeFromContactsLabel
                  }
                  danger
                  onClick={handleDeleteFriendAction}
                  disabled={deleteFriendMutation.isPending}
                  compact={!isDesktopLayout}
                />
              ) : null}
            </ProfileSection>
          </div>
        ) : null}
      </div>

      {!isDesktopLayout && character ? (
        <div className="shrink-0 border-t border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.96)] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur-xl">
          <div
            className={cn(
              "grid gap-2",
              isFriend ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {isFriend ? (
              <>
                <MobileProfileActionButton
                  primary
                  label={
                    startChatMutation.isPending
                      ? openingLabel
                      : sendMessageLabel
                  }
                  disabled={startChatMutation.isPending}
                  onClick={() => {
                    setNotice(null);
                    startChatMutation.mutate();
                  }}
                />
                <MobileProfileActionButton
                  label={
                    openCallMutation.isPending
                      ? connectingLabel
                      : audioVideoCallLabel
                  }
                  disabled={openCallMutation.isPending}
                  onClick={() => {
                    setNotice(null);
                    setMobileSheetAction("call");
                  }}
                />
              </>
            ) : (
              <MobileProfileActionButton
                primary
                label={
                  hasPendingFriendRequest
                    ? viewFriendRequestLabel
                    : sendFriendRequestMutation.isPending
                      ? sendingLabel
                      : addToContactsLabel
                }
                disabled={
                  sendFriendRequestMutation.isPending &&
                  !hasPendingFriendRequest
                }
                onClick={() => {
                  setNotice(null);
                  handleAddToContacts();
                }}
              />
            )}
          </div>
        </div>
      ) : null}

      {!isDesktopLayout ? (
        <MobileDetailsActionSheet
          open={mobileSheetConfig !== null}
          title={mobileSheetConfig?.title ?? ""}
          description={mobileSheetConfig?.description}
          onClose={() => setMobileSheetAction(null)}
          actions={
            mobileSheetConfig?.actions.map((action) => ({
              ...action,
              onClick: () => {
                setMobileSheetAction(null);
                action.onClick();
              },
            })) ?? []
          }
        />
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

function MobileCharacterErrorNotice({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <InlineNotice
      tone="danger"
      className="rounded-[11px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
    >
      {action ? (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {action}
        </div>
      ) : (
        children
      )}
    </InlineNotice>
  );
}

function MobileProfileActionButton({
  label,
  onClick,
  disabled = false,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-11 items-center justify-center rounded-[11px] border px-4 text-[15px] font-medium transition disabled:opacity-45",
        primary
          ? "border-[#07c160] bg-[#07c160] text-white active:bg-[#06ad56]"
          : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)] active:bg-[#f2f3f5]",
      )}
    >
      {label}
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
      <div className="border-t border-[color:var(--border-faint)]">
        {children}
      </div>
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
          compact
            ? "relative h-7 w-11 rounded-full transition-colors"
            : "relative h-8 w-13 rounded-full transition-colors",
          checked ? "bg-[#07c160]" : "bg-[#d5d5d5]",
        )}
      >
        <span
          className={cn(
            compact
              ? "absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
              : "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
            checked
              ? compact
                ? "translate-x-4"
                : "translate-x-6"
              : "translate-x-0",
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
  emptyLabel?: string,
) {
  const segments = [
    remarkName?.trim(),
    tags?.filter(Boolean).join("、"),
  ].filter(Boolean);

  return segments.length ? segments.join(" · ") : (emptyLabel ?? "");
}

function isMissingCharacterError(error: unknown, characterId: string) {
  return (
    error instanceof Error &&
    error.message.trim() === `Character ${characterId} not found`
  );
}
