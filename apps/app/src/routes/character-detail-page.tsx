import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  SELF_CHARACTER_ID,
  sendFriendRequest,
  setCharacterDefaultVoiceReply,
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
import { SparkBadge } from "../components/spark-badge";
import { DigitalHumanEntryNotice } from "../features/chat/digital-human-entry-notice";
import { buildMobileChatRouteHash } from "../features/chat/mobile-chat-route-state";
import { useDigitalHumanEntryGuard } from "../features/chat/use-digital-human-entry-guard";
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { ContactDetailPane } from "../features/contacts/contact-detail-pane";
import { invalidateFriendDisplayQueries } from "../features/contacts/invalidate-friend-display";
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
import { useCappedPending } from "../hooks/use-capped-pending";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { formatTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { buildPublicShareUrl } from "../lib/share-url";
import { buildYinjieId } from "../lib/yinjie-id";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  translateCharacterActivity,
  translateCharacterBio,
  translateExpertDomains,
} from "../lib/character-i18n";

const CHARACTER_DETAIL_BLOCK_REASON = "character_detail_block";
// 走查 R1：备注/标签后端 social.service updateFriendProfile 走 normalizeOptionalText
// + normalizeTags，不卡长度也不卡条目数 —— 之前测过粘 500 字 / 200 条标签都能落库。
// remarkName 跟随 profile-info-name-page 的 NAME_MAX_LENGTH=20；tags 输入框是一整段
// "tag1, tag2, ..." 字符串，给 200 字符足够放十几条短 tag，再加 disable + counter 让
// 用户看见上限。后端缺校验是更深的问题，但作为前端兜底先把超长粘贴挡在表单层。
const REMARK_NAME_MAX_LENGTH = 20;
const TAGS_INPUT_MAX_LENGTH = 200;

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
  // 走查新 R5：原来用静态 translateRuntimeMessage，不订阅 locale。用户在这页时
  // 切换语言（设置 → 语言）→ 整页 t(msg`xxx`) 表达式卡在旧 locale，直到下一次
  // 因别的 state 推渲染才补上。chat-details-page (L96) 已经在用 useRuntimeTranslator
  // 解决同样问题（背后 deps 列了 activationVersion + locale）。
  const t = useRuntimeTranslator();
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

  // 走查 R5（第 5 轮）：和 chat-details-page / mobile-ai-call-screen / desktop
  // 三处共享 "app-character"，其余 5 处都对齐到 15s staleTime；本页一直裸跑
  // → 用户从 chat-details 点联系人卡片进入资料页时上一页刚拉过的 character
  // cache 还热，按 mobile-web 60s / 其它 10s 默认会被判 stale 重发一次 GET。
  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId, baseUrl),
    staleTime: 15_000,
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    // 走查第七轮 R1：contacts-page / mobile-add-friend-page / tags-page /
    // starred-friends-page / create-group-page 在挂这条 query 时都配了
    // staleTime: 15_000，character-detail-page 反而缺，从 contacts tab 跳
    // 资料页时 friend 列表刚刚 15s 内还热，又被强制 refetch 一次（默认
    // staleTime=0 + refetchOnMount=true）。跟其它入口对齐避免无用重拉。
    staleTime: 15_000,
  });
  const isAlreadyFriend = useMemo(
    () =>
      (friendsQuery.data ?? []).some(
        (item) => item.character.id === characterId,
      ),
    [characterId, friendsQuery.data],
  );
  // 走查 R1：character-detail 进来时如果已经是好友（绝大多数从消息 tab→详情进入
  // 都是这条路径），底部按钮直接渲染「发消息 / 音视频通话」，friendRequestsQuery
  // 的结果只在 "添加到通讯录" / "等待对方通过" / "查看好友申请" 三种非好友状态下
  // 使用。原来无条件 enabled 让每个名片打开都触发一次 /social/friend-requests
  // 全量查询，毫无价值地多一次后台往返。已确认是好友就 skip；friendsQuery 还在
  // loading / 报错时仍允许拉，保证非好友态下 UI 能拿到 inbound/outbound 状态。
  //
  // 走查 R2：上面那条改动留了个尾巴——冷启动时 friendsQuery 还在 loading，
  // isAlreadyFriend 默认就是 false，friendRequestsQuery enabled 立刻成 true 直接发车。
  // 之后 friendsQuery 拿到数据发现"其实是好友"再翻 enabled 已经晚了，这一次
  // /social/friend-requests 已经空跑掉。改成：friendsQuery 还在 loading 阶段先
  // 按住别发；等 friendsQuery 结束（成功或失败）再按 isAlreadyFriend 决策。
  // 好友态下能彻底省一次后台往返；非好友态只比原来晚 ~一次 RTT，无感。
  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl, "all"],
    queryFn: () => getFriendRequests(baseUrl, { direction: "all" }),
    enabled: !friendsQuery.isLoading && !isAlreadyFriend,
    // 走查第七轮 R2：跟 mobile-add-friend-page / contacts-page 对齐 15s
    // staleTime——同一 queryKey 在多个入口共享，缺 staleTime 时挂到一个
    // 新页面就强制 refetch，浪费一次 round-trip。
    staleTime: 15_000,
  });
  // 走查 R2 试过按 isAlreadyFriend gate 这条 query 省一次后台往返，但 R3 复查
  // 发现会留 TOCTOU 窗口：用户在好友页点「加入黑名单」→ blockMutation.onSuccess
  // 同时 invalidate friends + blocked → friendsQuery 先回（isAlreadyFriend=false）
  // → blockedQuery 这一刻才被 enabled，开始重新发车 → 中间一拍 isBlocked 仍是
  // false，底部按钮翻成「添加到通讯录」enabled。用户那一秒点下去 → 后端
  // activateFriendship 看到 existing.status='blocked' 不在 ACTIVE_FRIENDSHIP_
  // STATUSES（'friend'/'close'/'best'）里，直接 existing.status='friend' 把
  // 刚拉黑的 friendship 重置回来，绕过黑名单 —— 正是 line 2147-2152 的注释
  // 提前提防住的场景。一次 /social/blocks 不值得这种正确性 regression，保持
  // 始终 enabled。
  // 走查 R5（第 5 轮）：和 chat-details-page / contacts-page / desktop-chat-details-panel
  // 共享 "app-chat-details-blocked"，那 3 处对齐到 15s staleTime（chat-details
  // 走查新一轮 R7 commit 8ccbb528d 已修），本页一直裸跑——上方那段大注释里
  // "character-detail-page (line 247)" 其实是 conversationsQuery 的 staleTime，
  // 不是 blockedQuery；这条 blockedQuery 是从 chat-details 跳进资料页时同
  // queryKey cache 已经热的，缺 staleTime 会按默认重发一次 GET /social/blocks。
  const blockedQuery = useQuery({
    queryKey: ["app-chat-details-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    staleTime: 15_000,
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: isDesktopLayout,
    // 走查第七轮 R2：跟 contacts-page 对齐 15s staleTime。
    staleTime: 15_000,
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
  // 走查 R5：char-default-self 是用户在隐界里的"自我镜像"角色，本质就是用户
  // 自己。后端 social.service.ts 已在 blockCharacter/deleteFriend 这两个端口
  // 走 SELF_CHARACTER_ID 守卫直接抛 400（SOCIAL_CANNOT_BLOCK_SELF /
  // SOCIAL_CANNOT_DELETE_SELF），但前端这页对这两个按钮没做任何 gate。如果
  // 用户从通讯录列表 / 私聊详情 / 群成员里点到「我自己」并误触：
  //   (a) 老 world child 还没装上后端守卫的版本会真把"自己"拉黑 / 删掉，
  //       自我镜像 friendship 永久变 'blocked'/'removed'，自我对谈链路彻底断；
  //   (b) 装上守卫的世界会回 400 + 英文 legacyMessage "Cannot block self
  //       mirror character"，用户看到一条很技术、看不懂的报错。
  // 跟桌面 ContactDetailPane 的"通过不传 onToggleBlock/onDeleteFriend 来隐
  // 藏 row"思路一致：这里识别自我镜像，对应 row / 按钮整体不渲染。
  // 桌面分支不传 onToggleBlock/onDeleteFriend；移动分支条件渲染。
  // 其它操作（备注 / 标签 / 星标 / 默认语音回复 / 推荐名片）后端没禁，对自我
  // 镜像也有合理语义（自己给自己起备注、把自己的隐界名片复制出去），保留。
  const isSelfMirror = characterId === SELF_CHARACTER_ID;
  const pendingFriendRequest = (friendRequestsQuery.data ?? []).find(
    (item) => item.characterId === characterId && item.status === "pending",
  );
  const hasInboundFriendRequest =
    !!pendingFriendRequest && !pendingFriendRequest.acceptAt;
  const hasOutboundFriendRequest =
    !!pendingFriendRequest && !!pendingFriendRequest.acceptAt;
  const hasPendingFriendRequest =
    hasInboundFriendRequest || hasOutboundFriendRequest;
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
  const awaitingAcceptanceLabel = t(msg`等待对方通过`);
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
    translateCharacterBio(t, character?.bio) ||
    t(msg`这个角色还没有个性签名。`);
  const expertiseSummary = character?.expertDomains?.length
    ? translateExpertDomains(t, character.expertDomains, "join")
    : unsetLabel;
  const activitySummary =
    translateCharacterActivity(t, character?.currentActivity) ||
    character?.relationship?.trim() ||
    t(msg`暂无状态`);
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

  // 切角色才清状态；如果只是同一角色的 friendship 重新拉回来，不要把刚弹出的
  // 成功提示和正在编辑的备注/标签输入框一并冲掉。
  useEffect(() => {
    setNotice(null);
    setMobileSheetAction(null);
    setIsEditingProfile(false);
    resetEntryGuard();
  }, [characterId, resetEntryGuard]);

  // 走查 R7：success notice 没有自动消失定时器 —— 用户点「设为星标朋友 / 加入
  // 黑名单 / 添加到通讯录 / 朋友资料已更新」之后那条绿色横幅会一直挂着，直到
  // 用户跳页 / 触发下一个 mutation 才会被替换。桌面 ContactDetailPane 的
  // profileNotice 早就加过 2.4s 兜底（contact-detail-pane.tsx L147-L153），这
  // 边只给 success 加同款（info 自带"重试 / 返回上一页"按钮，需要用户主动确认；
  // warning 是失败提示，留着让用户看见错误原因）。
  useEffect(() => {
    if (!notice || notice.tone !== "success") {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // 走查 Round 1：friendship.tags 是数组，每次 friendsQuery 重新拉就换一份引用，
  // 之前把 tags 作为 deps 直接放进上面的 effect → 后台刷新时 setNotice(null) 把
  // updateProfileMutation onSuccess 刚弹的"朋友资料已更新"瞬间吃掉，正在编辑的
  // 备注/标签输入框也被强行关闭并清空。改成只在非编辑态时把表单同步成服务器值，
  // 同时把 tags 数组扁平成字符串当 dep，避免引用抖动。
  const friendshipTagsKey = friendship?.tags?.join("，") ?? "";
  useEffect(() => {
    if (isEditingProfile) {
      return;
    }
    setProfileForm({
      remarkName: friendship?.remarkName ?? "",
      tags: friendshipTagsKey,
    });
  }, [characterId, friendship?.remarkName, friendshipTagsKey, isEditingProfile]);

  // 走查新 R6：entryNotice（数字人入口提示）在页面顶部 inline 渲染，但用户触发
  // 它的「视频通话」按钮在底部 action bar。底部点视频通话 → sheet 关掉 + entryNotice
  // 出现在顶部 → 用户当前在底部根本看不到。当前 mock_iframe 模式下每次点视频通话
  // 都会触发这条 notice，UX 影响实在。notice 出现就滚到它，让用户能看到。
  const entryNoticeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!entryNotice || !entryNoticeRef.current) {
      return;
    }
    entryNoticeRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [entryNotice]);

  // 走查新 R2：用户在备注/标签 inline 表单里输到一半按 Android 硬件返回 → 默认
  // history.back 直接走出 /character/$id，没保存的输入丢光。MobileDetailsActionSheet
  // 那条交互一直有同款 interceptor（mobile-details-action-sheet.tsx L39-L49）。
  // 这里补上：表单打开时吃掉一次 back，关表单并把 form 重置回服务器值；用户再按
  // 一次才真的退页。
  useEffect(() => {
    if (!isEditingProfile) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      setIsEditingProfile(false);
      setProfileForm({
        remarkName: friendship?.remarkName ?? "",
        tags: friendshipTagsKey,
      });
      return true;
    });
    return unregister;
  }, [isEditingProfile, friendship?.remarkName, friendshipTagsKey]);

  // 走查 R4：getOrCreateConversation 后端有两个会改 conversation 行的副作用：
  // (a) 第一次跟某角色聊天会 INSERT 一条新 direct conversation；(b) 用户之前
  // 从 /chat 列表 hide 过的会话，再次 getOr* 会把 isHidden 翻回 false 并清
  // hiddenAt（chat.service.ts L246-L250）。这两种情况下 app-conversations 缓存
  // 都已经脏。原 onSuccess 直接 navigate 不 invalidate，用户从 character-detail
  // 点"发消息"进入聊天 → 看完按 back → /tabs/chat 列表里要么少这条新会话，要么
  // 还把它显示在隐藏列表（导致冗余 hide 提示反复弹）。openCallMutation 同样会
  // 触发 getOrCreateConversation，需要一并补上。
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
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
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
    onSuccess: async (result) => {
      if (!result?.conversation) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
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
      // 走查 R10：autoAccept=true 时 backend 会立刻 activateFriendship + 写一条
      // 系统消息进对话；同时 moments.service.canOwnerViewPost 用
      // ownerFriendCharacterIds 决定可见性，新好友过去发过的 moments / feed post
      // 这一刻起就该出现在用户的 feed 里。但原 onSuccess 只 invalidate
      // app-friend-requests / app-friends / app-conversations，moments / feed
      // 这一堆 surface 上加好友前的旧 post 要等 query 自然 stale 才补进来。改用
      // invalidateFriendDisplayQueries 覆盖 friend / conversation / messages /
      // moments / feed 全套；app-friend-requests 不在它里面，单独留一条。
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        invalidateFriendDisplayQueries(queryClient, baseUrl),
      ]);
    },
  });
  const sendFriendRequestDisplayedPending = useCappedPending(
    sendFriendRequestMutation.isPending,
    500,
  );
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
  const setDefaultVoiceReplyMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setCharacterDefaultVoiceReply(characterId, enabled, baseUrl),
    onSuccess: async (_, enabled) => {
      setNotice({
        tone: "success",
        message: enabled
          ? t(msg`已开启默认语音回复（消耗 token plan 配额）。`)
          : t(msg`已关闭默认语音回复。`),
      });
      await queryClient.invalidateQueries({
        queryKey: ["app-character", baseUrl, characterId],
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
      await invalidateFriendDisplayQueries(queryClient, baseUrl);
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
      // 走查 R3：blockCharacter 后端把 friendship.status 改成 'blocked' 且
      // 把 isStarred 一并清掉，getFriends() 此后不再返回这条 friendship。
      // 走查 R9：moments.service.getFeed 用 ownerFriendCharacterIds 判断
      // canOwnerViewPost，加入黑名单后这个 character 的 moments / 广场动态都该
      // 从结果里消失。但 onSuccess 没动 app-moments-paged / app-feed-paged，
      // 用户拉黑后回 /tabs/discover/moments 仍然看到这位被拉黑用户的旧 post
      // 直到 query stale。改用 invalidateFriendDisplayQueries 覆盖 friend /
      // conversation / moments / feed / individual post 全套缓存。
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
        invalidateFriendDisplayQueries(queryClient, baseUrl),
      ]);
    },
  });
  const deleteFriendMutation = useMutation({
    mutationFn: () => deleteFriend(characterId, baseUrl),
    onSuccess: async () => {
      // 走查 R9：deleteFriend 把 friendship.status 改成 'removed'，跟 block 一样
      // 让 canOwnerViewPost 把对方过往的 moments / feed post 全过滤掉。原来只
      // invalidate app-friends + app-conversations，moments / feed 这两条
      // surface 上的脏 post 要等下一次 staleTime 才更新。用 invalidateFriend-
      // DisplayQueries 一并覆盖。
      await invalidateFriendDisplayQueries(queryClient, baseUrl);
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

  // 走查 R4：每个 mutation hook 在整个 CharacterDetailPage 生命周期内是同一个
  // 实例，character 切换只走 useParams 路由 re-render 不会 unmount。意味着用户
  // 在 A 的资料页"拉黑/删除/改备注"失败留下的 mutation.error，挂到 B 的页面上
  // 同样会被 isError && error instanceof Error 那一组 MobileCharacterErrorNotice
  // 全部点亮——Bob 没动一下就看到一条"加入黑名单失败：xxx"，会以为是自己页面
  // 的 Bug。桌面 ContactDetailPane 早就给 updateProfileMutation 加过 reset()
  // (contact-detail-pane.tsx L135-L145)，但只覆盖了 desktop pane 自己持有的一个；
  // 移动 page 这一侧 10 个 mutation 全漏。切角色时把它们一并 reset。
  // mutations 在上面已经全部用 const 初始化完成，这个 effect 在 mount/update
  // 之后才执行，闭包能拿到它们；不放进 deps 因为每次 render 引用都新，避免无限
  // 重置死循环。
  useEffect(() => {
    startChatMutation.reset();
    openCallMutation.reset();
    sendFriendRequestMutation.reset();
    setStarredMutation.reset();
    setDefaultVoiceReplyMutation.reset();
    pinMutation.reset();
    muteMutation.reset();
    updateProfileMutation.reset();
    blockMutation.reset();
    deleteFriendMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  const handleBack = () => {
    // 走查新 R3：跟新 R2 的 Android back interceptor 对齐 —— 用户在 inline 备注/
    // 标签表单输到一半点左上角箭头，跟硬件返回是同一份心智模型，应该先收回表单
    // 不丢输入。Android back 走 registerAndroidBackInterceptor 自动收，软件按钮
    // 走这里手动收一次再返回。
    if (isEditingProfile) {
      setIsEditingProfile(false);
      setProfileForm({
        remarkName: friendship?.remarkName ?? "",
        tags: friendshipTagsKey,
      });
      return;
    }
    const expectedPreviousPath = safeMobileReturnPath ?? "/tabs/contacts";
    navigateBackOrFallback(
      () => {
        if (navigateToRouteStateReturn()) {
          return;
        }

        if (isDesktopLayout) {
          navigateToDesktopContactsSelection();
          return;
        }

        void navigate({ to: "/tabs/contacts" });
      },
      expectedPreviousPath,
    );
  };

  // 走查 R2：手机端备注/标签编辑表单的「保存」按钮只看 isPending 决定 disabled，
  // 即便用户没动过任何字符也会发一次 updateFriendProfile。后端会照样写 friendship
  // + 触发 cyber_avatar.captureSignal 这一整路审计/数字人 signal。点了「设置备注和
  // 标签」只是想关一下面板的人会无意识地刷一次后台 IO。对比一下"normalize 后"的
  // remarkName 和 tags，跟服务器值完全等价就 setIsEditingProfile(false) 直接关
  // 面板，跟桌面 DesktopContactTextEditDialog 的 confirmDisabled 行为对齐。
  const handleSaveProfile = async () => {
    // 走查 R1：input maxLength 拦的是键盘 / 常规粘贴，但 IME 合成态、自动填充、
    // 编程式 setValue 都能绕开。Save 之前再卡一次硬上限，超限直接吃掉（避免
    // 把超长 remarkName/tags 写进后端 — social.service 现在不会拒）。
    if (
      profileForm.remarkName.length > REMARK_NAME_MAX_LENGTH ||
      profileForm.tags.length > TAGS_INPUT_MAX_LENGTH
    ) {
      return;
    }
    const nextRemarkName = profileForm.remarkName.trim() || null;
    const nextTags = profileForm.tags
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const currentRemarkName = friendship?.remarkName?.trim() || null;
    const currentTags = friendship?.tags ?? [];
    const tagsUnchanged =
      nextTags.length === currentTags.length &&
      nextTags.every((tag, index) => tag === currentTags[index]);
    if (nextRemarkName === currentRemarkName && tagsUnchanged) {
      setIsEditingProfile(false);
      return;
    }
    await updateProfileMutation.mutateAsync({
      remarkName: nextRemarkName,
      tags: nextTags,
    });
  };

  const handleVoiceCall = () => {
    setNotice(null);
    setMobileSheetAction(null);
    openCallMutation.mutate("voice");
  };

  const handleVideoCall = () => {
    setNotice(null);
    setMobileSheetAction(null);
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
    const profileUrl = buildPublicShareUrl(profilePath);
    // 走查新 R4：原来分享 title/summary 用 displayName，但 displayName =
    // remarkName || character.name —— 用户把对方备注成「妈妈」之后分享出去，
    // 对方收到的是「妈妈 的隐界名片」，根本不知道是谁。备注是 viewer-local
    // 概念，对外分享必须用 character 的真实 name。
    const shareDisplayName = character.name || displayName;
    const profileSummary = [
      t(msg`${shareDisplayName} 的隐界名片`),
      character.relationship?.trim() || worldContactLabel,
      t(msg`隐界号：${buildYinjieId(character.id)}`),
      profileUrl,
    ].join("\n");

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: t(msg`${shareDisplayName} 的隐界名片`),
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
    if (hasInboundFriendRequest) {
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
              // 走查 R1：原 sheet 主标题写「删除后会从通讯录移除这个联系人。」，
              // 二级 description 写「此操作不可恢复」—— 后者是错的：后端
              // deleteFriend 只是把 friendship.status='removed'，再发一次好友
              // 申请就能恢复。桌面 ContactDetailPane 的 DangerConfirmDialog 一直
              // 用「删除后将不会通知对方，可重新添加。」，两端拉齐，避免用户被
              // "不可恢复"四个字吓住不敢操作。
              description: t(msg`删除后将不会通知对方，可重新添加。`),
              actions: [
                {
                  key: "confirm",
                  label: t(msg`删除联系人`),
                  description: t(msg`对方不会收到通知`),
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
              <div
                ref={entryNoticeRef}
                className="mx-auto w-full max-w-[640px] px-3"
              >
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
                  // 走查第四轮 R1：mutation pending 中按钮 label 已换成
                  // 「正在接通...」但按钮 enabled 不变，双击就再发一次
                  // openCallMutation.mutate(...)。disabled 收尾防一次。
                  disabled={openCallMutation.isPending}
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
            {setDefaultVoiceReplyMutation.isError &&
            setDefaultVoiceReplyMutation.error instanceof Error ? (
              <div className="mx-auto w-full max-w-[640px] px-3">
                <ErrorBlock
                  message={setDefaultVoiceReplyMutation.error.message}
                />
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
              // 走查新 R1：character-detail-page 自身就是"详细资料"目的地，
              // ContactDetailPane 里的「详细资料」入口行 onOpenProfile={() => {}}
              // 点了什么都不会发生，行尾的箭头还在邀请用户去戳。把这一行直接
              // 隐掉（showProfileEntry=false），同时把"朋友圈"那行需要的 fallback
              // 收口到 onOpenMoments——本来 contact-detail-pane 在 onOpenMoments
              // 缺失时还会 fallback 到 onOpenProfile，传一个 throw 兜底避免误用。
              showProfileEntry={false}
              onOpenProfile={() => {}}
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
              defaultVoiceReply={character.defaultVoiceReply ?? false}
              defaultVoiceReplyPending={
                setDefaultVoiceReplyMutation.isPending
              }
              onToggleDefaultVoiceReply={() => {
                setNotice(null);
                setDefaultVoiceReplyMutation.mutate(
                  !(character.defaultVoiceReply ?? false),
                );
              }}
              isBlocked={isBlocked}
              blockPending={blockMutation.isPending}
              onToggleBlock={
                isSelfMirror
                  ? undefined
                  : () => {
                      setNotice(null);
                      blockMutation.mutate(isBlocked);
                    }
              }
              deletePending={deleteFriendMutation.isPending}
              // 走查第三遍 R1：原来 onDeleteFriend 走 handleDeleteFriendAction →
              // 里面 isDesktopLayout 分支又 window.confirm 一次，跟 ContactDetailPane
              // 自己的 DangerConfirmDialog 叠成 double-confirm（用户在 pane 里点
              // 「删除」→ 又弹原生 confirm "确认删除这个联系人吗？"）。隔壁的
              // onToggleBlock 写法已经直接 blockMutation.mutate(isBlocked)，因为
              // pane 已经确认过；delete 这里漏对齐。改成同款直 mutate。
              onDeleteFriend={
                isSelfMirror
                  ? undefined
                  : () => {
                      setNotice(null);
                      deleteFriendMutation.mutate();
                    }
              }
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
        isDesktopLayout
          ? "h-full overflow-y-auto"
          : "flex h-full min-h-0 flex-col overflow-hidden",
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
                : "pb-6",
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
                {!isDesktopLayout &&
                notice.tone === "info" &&
                notice.actionLabel &&
                notice.onAction ? (
                  // 走查 R3：原 info notice 永远会在右侧拼一个「返回通讯录 / 返回上
                  // 一页」按钮。但实际两条 info 落点都是分享场景的 retry 提示——
                  // "复制名片失败，请稍后重试" / "当前环境暂不支持复制名片"，都已经
                  // 带有 actionLabel/onAction 触发的重试 button。再加一个"返回"按钮
                  // 等于把分享失败误导成"该退回上一页"。AppPage 顶 header 已经有
                  // 左上角 ArrowLeft 返回，info notice 就只暴露 retry 一颗按钮够了。
                  // 兜底：如果某次 info 没带 actionLabel/onAction（目前没有这种调用
                  // 点，但保留以防回潮），就 fall through 到纯文本，不再补 back。
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1">{notice.message}</span>
                    <InlineNoticeActionButton
                      label={notice.actionLabel}
                      onClick={notice.onAction}
                    />
                  </div>
                ) : (
                  notice.message
                )}
              </InlineNotice>
            ) : null}
            {entryNotice ? (
              <div ref={entryNoticeRef}>
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
                  // 见上方 desktop entryNotice 的注释 —— mobile/desktop 都走
                  // 同一份 mutate 直调，双击同样会开两路。
                  disabled={openCallMutation.isPending}
                  compact={!isDesktopLayout}
                />
              </div>
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
            {/* 走查 Round 4：默认语音回复 switch 在桌面/移动两端都暴露，但
                整页就这一个 mutation 没接 error 渲染——失败（如 token plan 配额
                耗尽 / 网络抖动）时开关回弹但用户得不到任何提示，怀疑自己点漏。 */}
            {setDefaultVoiceReplyMutation.isError &&
            setDefaultVoiceReplyMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock
                  message={setDefaultVoiceReplyMutation.error.message}
                />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {setDefaultVoiceReplyMutation.error.message}
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
            {/* 走查新 R1：之前 pinMutation/muteMutation 的 ErrorBlock 只挂在
                desktop 分支（旧 1318-1326）；mobile 静默失败，开关回弹但屏幕
                没任何反馈，用户怀疑自己点漏。统一到 isDesktopLayout ?
                <ErrorBlock> : <MobileCharacterErrorNotice> 的范式，跟上下
                10 个 mutation 写法对齐，避免一处双写。 */}
            {pinMutation.isError && pinMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={pinMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {pinMutation.error.message}
                </MobileCharacterErrorNotice>
              )
            ) : null}
            {muteMutation.isError && muteMutation.error instanceof Error ? (
              isDesktopLayout ? (
                <ErrorBlock message={muteMutation.error.message} />
              ) : (
                <MobileCharacterErrorNotice
                  action={renderMobileErrorBackAction()}
                >
                  {muteMutation.error.message}
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
                    {t(msg`隐界号：${buildYinjieId(character.id)}`)}
                  </div>
                  <div
                    className={cn(
                      "mt-1 text-[color:var(--text-muted)]",
                      isDesktopLayout ? "text-sm" : "text-[12px]",
                    )}
                  >
                    {isFriend
                      ? t(
                          msg`地区：${friendship?.region?.trim() || character?.region?.trim() || unsetLabel}`,
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
                      // 走查新 R1：disabled 没把 friendsQuery.isLoading 算进去。
                      // characterQuery 命中缓存秒回时底部 bar 已经渲染，friendsQuery
                      // 还在拉就 isAlreadyFriend=false 走非好友 layout，按钮显示
                      // 「添加到通讯录」enabled。用户抢着点 → 后端 sendFriendRequest
                      // 给已经是好友的 character 又创建一条 friend_request 行 +
                      // cyber_avatar 一条 friend_request_auto_accept signal（虽然
                      // activateFriendship 看到 status 已经是 'friend' 不会改 DB，
                      // 但 audit 流水照样污染）。等 friendsQuery 回来再放行。
                      disabled={
                        friendsQuery.isLoading ||
                        isBlocked ||
                        hasOutboundFriendRequest ||
                        (sendFriendRequestMutation.isPending &&
                          !hasPendingFriendRequest)
                      }
                    >
                      {isBlocked
                        ? t(msg`已加入黑名单`)
                        : hasOutboundFriendRequest
                          ? awaitingAcceptanceLabel
                          : hasInboundFriendRequest
                            ? viewFriendRequestLabel
                            : sendFriendRequestDisplayedPending
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
                // border-t 由父级 ProfileSection 的 divide-y 统一管（走查 R5），
                // 这里只留 background 跟 padding 避免叠成双线。
                <div className="bg-[#f7f7f7] px-4 py-3">
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
                      maxLength={REMARK_NAME_MAX_LENGTH}
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
                      maxLength={TAGS_INPUT_MAX_LENGTH}
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
                      disabled={
                        updateProfileMutation.isPending ||
                        profileForm.remarkName.length >
                          REMARK_NAME_MAX_LENGTH ||
                        profileForm.tags.length > TAGS_INPUT_MAX_LENGTH
                      }
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
                  (isFriend
                    ? friendship?.region?.trim() ||
                      character.region?.trim()
                    : character.region?.trim()) || unsetLabel
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
              {/* 走查 R1：朋友圈入口在移动端无条件渲染，非好友点进去后端按"未授权"
                  返回空列表/错误，跟 desktop ContactDetailPane（已用 isFriend 包过）
                  不一致；非好友本来就拿不到对方朋友圈，挪到 isFriend 分支里。
                  走查 R3：用户从「朋友权限管理」把这位朋友的"看 TA 的朋友圈"关掉
                  (friendship.momentsHiddenFromMe=true) 之后，moments.service
                  canOwnerViewPost 这边就会把 TA 过去发的 moments 全部过滤掉
                  —但 contact-profile 这行 value 还是「查看这位角色最近的朋友圈」，
                  点进去拿到的是一片空，连为什么空都没人告诉。和 friendship 字段
                  对齐：hideTheir 状态下 value 文案改成「已不再看 TA 的朋友圈」，
                  click 仍然带用户去 mobile-friend-moments，让 ta 在那一页能拿到
                  empty state 解释 / 撤销路径，不再让人盯着空白页面发呆。 */}
              {isFriend ? (
                <ProfileRow
                  label={momentsLabel}
                  value={
                    friendship?.momentsHiddenFromMe
                      ? t(msg`已不再看 TA 的朋友圈`)
                      : momentsValueLabel
                  }
                  onClick={handleOpenMoments}
                  compact={!isDesktopLayout}
                />
              ) : null}
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

            {isDesktopLayout ? (
              <ProfileSection
                title={moreInfoTitle}
                flatOnMobile={!isDesktopLayout}
                compact={!isDesktopLayout}
              >
                {isFriend ? (
                  <ProfileRow
                    label={recentInteractionLabel}
                    value={formatTimestamp(
                      friendship?.lastInteractedAt ?? character.lastActiveAt,
                    )}
                    compact={!isDesktopLayout}
                  />
                ) : null}
                {isFriend && (friendship?.sparkStreak ?? 0) >= 3 ? (
                  <ProfileRow
                    label={t(msg`火花`)}
                    value={
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <SparkBadge
                          streak={friendship?.sparkStreak}
                          size="md"
                        />
                        <span className="text-[12px] text-[color:var(--text-muted)]">
                          {t(msg`已连续 ${friendship?.sparkStreak ?? 0} 天`)}
                        </span>
                      </span>
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
                        to: buildDesktopChatThreadPath({
                          conversationId: firstGroup.id,
                        }),
                      });
                    }}
                    compact={!isDesktopLayout}
                  />
                ) : null}
                {isFriend ? (
                  <ProfileRow
                    label={currentStatusLabel}
                    value={activitySummary}
                    compact={!isDesktopLayout}
                  />
                ) : null}
                <ProfileRow
                  label={expertiseLabel}
                  value={expertiseSummary}
                  multiline
                  compact={!isDesktopLayout}
                />
                <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
                  <div className="text-[color:var(--text-muted)] text-xs uppercase tracking-[0.16em]">
                    {bioLabel}
                  </div>
                  <div className="mt-2 text-[color:var(--text-secondary)] text-sm leading-7">
                    {translateCharacterBio(t, character.bio) || noMoreIntroLabel}
                  </div>
                </div>
              </ProfileSection>
            ) : null}

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
                  onToggle={() => {
                    // 走查第三遍 R2：桌面 onToggleStarred wrapper (line 1351) 一直
                    // setNotice(null) 起手，移动 ProfileSwitchRow 这里漏了，前一条
                    // success notice 会跟新 toggle 重叠几百 ms 才被替换。对齐。
                    setNotice(null);
                    setStarredMutation.mutate(
                      !(friendship?.isStarred ?? false),
                    );
                  }}
                  disabled={setStarredMutation.isPending}
                  compact={!isDesktopLayout}
                />
              ) : null}
              {/* 走查 R1：「默认用语音回复」只对已经在通讯录里的好友有意义——
                  你还没加上 ta，根本没有 chat conversation 可以"默认转语音"。桌面
                  ContactDetailPane 早就把这个 toggle 关在 isFriend 块里
                  (contact-detail-pane.tsx L409-L438)，移动端这里漏了 gate，导致
                  非好友 / 黑名单状态的"关系管理"面板里挂着一个动了也没人会受影响
                  的语音开关。和桌面行为对齐：只给好友显示。 */}
              {isFriend ? (
                <ProfileSwitchRow
                  label={t(msg`默认用语音回复`)}
                  checked={character.defaultVoiceReply ?? false}
                  onToggle={() => {
                    // 走查第三遍 R2：同上 —— 桌面 onToggleDefaultVoiceReply 已经
                    // setNotice(null) 起手，对齐移动这里。
                    setNotice(null);
                    setDefaultVoiceReplyMutation.mutate(
                      !(character.defaultVoiceReply ?? false),
                    );
                  }}
                  disabled={setDefaultVoiceReplyMutation.isPending}
                  compact={!isDesktopLayout}
                />
              ) : null}
              {/* 走查 R5：char-default-self 是用户自我镜像，后端 social.service
                  在 block / delete 两端都装了 SELF_CHARACTER_ID 守卫；前端必须
                  对应把这两 row 整体隐藏，不然用户从通讯录或私聊点到自我镜像
                  会看到误导性按钮 → 误触后要么破坏自我对谈链路、要么看到一条
                  英文 legacyMessage。和桌面 ContactDetailPane 通过不传
                  onToggleBlock/onDeleteFriend 来隐藏 row 的思路对齐。 */}
              {!isSelfMirror ? (
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
              ) : null}
              {isFriend && !isSelfMirror ? (
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
        // 走查再 R2：/character/$id 不走 MobileShell 的 safeBottom，AppPage 自己也
        // 没补 safe-area。原来 pb-3=12px 在 iPhone X+ 34pt 的 home indicator 下
        // "发消息 / 音视频通话 / 添加到通讯录"会被横条盖到一半。和
        // chat-message-list / message-quote-selection-sheet 已经在用的写法对齐，
        // pb 走 env(safe-area-inset-bottom)。
        <div className="shrink-0 border-t border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.96)] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-3 backdrop-blur-xl">
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
              // 走查 R1：拉黑后会把 friendship 删掉，整页转回非好友 layout，bottom
              // bar 直接展示「添加到通讯录」邀请用户再 sendFriendRequest——但用户
              // 刚刚才点了"加入黑名单"，此刻再发一次好友请求只会跑去后端被审计
              // (autoAccept=true 时甚至会立刻 reactivate friendship 把 block
              // 的效果绕过)。黑名单态下把主按钮换成不可点的「已加入黑名单」，
              // 让用户先走"移出黑名单"那条 row 才能继续添加。
              <MobileProfileActionButton
                primary
                label={
                  isBlocked
                    ? t(msg`已加入黑名单`)
                    : hasOutboundFriendRequest
                      ? awaitingAcceptanceLabel
                      : hasInboundFriendRequest
                        ? viewFriendRequestLabel
                        : sendFriendRequestDisplayedPending
                          ? sendingLabel
                          : addToContactsLabel
                }
                // 走查新 R1：见上方 desktop add-button 的注释 —— characterQuery
                // 缓存命中时底部 bar 就渲染，friendsQuery 还在拉就让 isAlreadyFriend
                // 默认 false 走非好友 layout，按钮 enabled 给用户抢点的机会，给
                // 已经是好友的 character 又发一次 friend_request。等 friendsQuery
                // 回来再放行。
                disabled={
                  friendsQuery.isLoading ||
                  isBlocked ||
                  hasOutboundFriendRequest ||
                  (sendFriendRequestMutation.isPending &&
                    !hasPendingFriendRequest)
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
      {/* 走查 R5：ProfileSection 的 children 容器只画了顶部一条横线（隔开 title
          跟第一行），相邻 ProfileRow / ProfileSwitchRow 之间没有任何 separator。
          移动端"设置备注和标签 / 地区 / 来源 / 标签 / 朋友圈 / 推荐给朋友"这堆
          ProfileRow 在 WeChat 白底面板里挨在一起、视觉上糊成一块连看哪行是哪行
          都得数 label 字数。和 chat-details-page 用的 divide-y 模式对齐，给所
          有非首子加 border-t。inline 编辑表单本身就有 border-t（line 1671），
          配合 divide-y 会把它跟自己叠成双线，下方把它移除让 divide 统一管。 */}
      <div className="divide-y divide-[color:var(--border-faint)] border-t border-[color:var(--border-faint)]">
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
  value: ReactNode;
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
            compact
            ? "min-w-[5.5rem] shrink-0 whitespace-nowrap"
            : "min-w-24 shrink-0 whitespace-nowrap",
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
          compact
            ? "min-w-[5.5rem] shrink-0 whitespace-nowrap"
            : "min-w-24 shrink-0 whitespace-nowrap",
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
  maxLength,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  compact?: boolean;
  maxLength?: number;
}) {
  // 走查 R1：备注 / 标签输入框原本没设 maxLength，用户粘 500+ 字符直接落 friendship 表，
  // displayName / chat 列表标题 / 聊天 header 全被撑爆。后端 social.service.updateFriendProfile
  // 只做 trim 不卡长度，前端先兜底。maxLength 一并喂到 <input> 让浏览器/IME 直接截断，
  // 旁边再画一条 length/max 的 counter 给用户反馈。
  const showCounter = typeof maxLength === "number";
  const overLimit = showCounter && value.length > (maxLength as number);
  return (
    <label className="block">
      <div
        className={cn(
          "mb-2 flex items-center justify-between gap-2 text-[color:var(--text-muted)]",
          compact ? "text-[11px]" : "text-xs uppercase tracking-[0.12em]",
        )}
      >
        <span>{label}</span>
        {showCounter ? (
          <span
            className={cn(
              "tabular-nums",
              overLimit
                ? "text-[color:var(--state-danger-text)]"
                : "text-[color:var(--text-dim)]",
            )}
          >
            {value.length}/{maxLength}
          </span>
        ) : null}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        // text-[16px]: iOS Safari/WKWebView focus 时 <16px 会强制 viewport
        // zoom-in。原本 compact (mobile) 给 text-[13px]、desktop 给 text-sm
        // (14px) 都不够；mobile 走 DetailInputField 在角色详情页里铺了 10+ 处
        // (备注名 / 备注标签 / 朋友圈权限 ...)，挨个点过去整页会反复弹缩。
        // 移动端固定 16px；桌面端没有 zoom 问题继续用 14px 维持视觉密度。
        className={cn(
          "w-full border border-[color:var(--border-faint)] bg-white px-3 text-[color:var(--text-primary)] outline-none transition focus:border-[rgba(7,193,96,0.18)] focus:bg-white placeholder:text-[color:var(--text-dim)]",
          compact
            ? "rounded-[11px] py-2.5 text-[16px]"
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
