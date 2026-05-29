import { type ComponentType, lazy } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./features/shell/root-layout";
import { recoverFromStaleAssets } from "./lib/stale-asset-recovery";
import { useWorldOwnerStore } from "./store/world-owner-store";

// 旧 entry bundle 持有一段时间后被 emptyOutDir 的新 build 顶掉，dynamic import
// 既可能 404（vite:preloadError 在 main.tsx 兜底）也可能拿到一个"看起来成功
// 但 namespace 里没我们要的命名导出"的结果（rollup output 形状变了 / browser
// HTTP cache 串到别的 hash 上等极端情况）。后者会让 mod.XxxPage 是 undefined，
// 进而 lazy 内层 throw TypeError，被 TelemetryErrorBoundary 接到，用户看到
// fallback。这里把它统一识别成 stale-asset，触发一次 reload 回到一致状态。
function lazyNamed<Props extends Record<string, unknown>>(
  importer: () => Promise<Record<string, unknown>>,
  exportName: string,
) {
  return lazy(async () => {
    const mod = await importer();
    const candidate =
      mod && typeof mod === "object" ? mod[exportName] : undefined;
    if (typeof candidate !== "function") {
      recoverFromStaleAssets();
      throw new Error(
        `Stale chunk: missing export "${exportName}" — triggering reload`,
      );
    }
    return { default: candidate as ComponentType<Props> };
  });
}

const SplashPage = lazyNamed(() => import("./routes/splash-page"), "SplashPage");

const WelcomePage = lazyNamed(() => import("./routes/welcome-page"), "WelcomePage");

const ChatListPage = lazyNamed(() => import("./routes/chat-list-page"), "ChatListPage");

const FavoritesPage = lazyNamed(() => import("./routes/favorites-page"), "FavoritesPage");

const MomentsPage = lazyNamed(() => import("./routes/moments-page"), "MomentsPage");

const MobileMomentsPublishPage = lazyNamed(() => import("./routes/mobile-moments-publish-page"), "MobileMomentsPublishPage");

const MobileFeedPublishPage = lazyNamed(() => import("./routes/mobile-feed-publish-page"), "MobileFeedPublishPage");

const FriendMomentsPage = lazyNamed(() => import("./routes/friend-moments-page"), "FriendMomentsPage");

const MobileFriendMomentsPage = lazyNamed(() => import("./routes/mobile-friend-moments-page"), "MobileFriendMomentsPage");

const LegacyFriendMomentsRedirectPage = lazyNamed(() => import("./routes/legacy-friend-moments-redirect-page"), "LegacyFriendMomentsRedirectPage");

const FeedPage = lazyNamed(() => import("./routes/feed-page"), "FeedPage");

const ChannelsPage = lazyNamed(() => import("./routes/channels-page"), "ChannelsPage");

const ChannelAuthorPage = lazyNamed(() => import("./routes/channel-author-page"), "ChannelAuthorPage");

const ChannelHistoryPage = lazyNamed(() => import("./routes/channel-history-page"), "ChannelHistoryPage");

const SearchPage = lazyNamed(() => import("./routes/search-page"), "SearchPage");

const GamesPage = lazyNamed(() => import("./routes/games-page"), "GamesPage");

const YinjieFarmPage = lazyNamed(() => import("./routes/yinjie-farm-page"), "YinjieFarmPage");
const GamePlayPage = lazyNamed(() => import("./routes/game-play-page"), "GamePlayPage");

const MiniProgramsPage = lazyNamed(() => import("./routes/mini-programs-page"), "MiniProgramsPage");

const DiscoverPage = lazyNamed(() => import("./routes/discover-page"), "DiscoverPage");

// 世界改造 Phase 1：新「世界」首屏（排版 C 双核）。先 gated——挂在 tabsRoute 下
// （自动 requireWorldReady），但不进 mobile-shell 的 nav，仅可直接访问 /tabs/world 预览。
const WorldPage = lazyNamed(() => import("./features/world/world-page"), "WorldPage");

const DiscoverEncounterPage = lazyNamed(() => import("./routes/discover-encounter-page"), "DiscoverEncounterPage");

const DiscoverAvatarEncounterPage = lazyNamed(() => import("./routes/discover-avatar-encounter-page"), "DiscoverAvatarEncounterPage");
const CyberAvatarPage = lazyNamed(() => import("./routes/cyber-avatar-page"), "CyberAvatarPage");

const DiscoverScenePage = lazyNamed(() => import("./routes/discover-scene-page"), "DiscoverScenePage");

const DiscoverFeedPage = lazyNamed(() => import("./routes/discover-feed-page"), "DiscoverFeedPage");

const DiscoverChannelsPage = lazyNamed(() => import("./routes/channels-page"), "ChannelsPage");

const ContactsPage = lazyNamed(() => import("./routes/contacts-page"), "ContactsPage");

const StarredFriendsPage = lazyNamed(() => import("./routes/starred-friends-page"), "StarredFriendsPage");

const WorldCharactersPage = lazyNamed(() => import("./routes/world-characters-page"), "WorldCharactersPage");

const OfficialAccountsPage = lazyNamed(() => import("./routes/official-accounts-page"), "OfficialAccountsPage");

const GroupContactsPage = lazyNamed(() => import("./routes/group-contacts-page"), "GroupContactsPage");

const TagsPage = lazyNamed(() => import("./routes/tags-page"), "TagsPage");

const OfficialAccountDetailPage = lazyNamed(() => import("./routes/official-account-detail-page"), "OfficialAccountDetailPage");

const OfficialAccountArticlePage = lazyNamed(() => import("./routes/official-account-article-page"), "OfficialAccountArticlePage");

const OfficialAccountServicePage = lazyNamed(() => import("./routes/official-account-service-page"), "OfficialAccountServicePage");

const SubscriptionInboxPage = lazyNamed(() => import("./routes/subscription-inbox-page"), "SubscriptionInboxPage");

const ProfilePage = lazyNamed(() => import("./routes/profile-page"), "ProfilePage");

const ProfileSettingsPage = lazyNamed(() => import("./routes/profile-settings-page"), "ProfileSettingsPage");

const ProfileSettingsLanguagePage = lazyNamed(() => import("./routes/profile-settings-language-page"), "ProfileSettingsLanguagePage");

const ProfileSettingsAccountSecurityPage = lazyNamed(() => import("./routes/profile-settings-account-security-page"), "ProfileSettingsAccountSecurityPage");

const ProfileInfoPage = lazyNamed(() => import("./routes/profile-info-page"), "ProfileInfoPage");

const ProfileInfoNamePage = lazyNamed(() => import("./routes/profile-info-name-page"), "ProfileInfoNamePage");

const ProfileInfoSignaturePage = lazyNamed(() => import("./routes/profile-info-signature-page"), "ProfileInfoSignaturePage");

const ProfileInfoContactPage = lazyNamed(() => import("./routes/profile-info-contact-page"), "ProfileInfoContactPage");

const ProfileInfoFieldPage = lazyNamed(() => import("./routes/profile-info-field-page"), "ProfileInfoFieldPage");

const ProfileSubscriptionPage = lazyNamed(() => import("./routes/profile-subscription-page"), "ProfileSubscriptionPage");

const ProfileXhsRewardPage = lazyNamed(() => import("./routes/profile-xhs-reward-page"), "ProfileXhsRewardPage");

const WalletPage = lazyNamed(() => import("./routes/wallet-page"), "WalletPage");
const KnowledgeBasePage = lazyNamed(() => import("./routes/knowledge-base-page"), "KnowledgeBasePage");

const WalletTransactionsPage = lazyNamed(() => import("./routes/wallet-transactions-page"), "WalletTransactionsPage");
const ShopPage = lazyNamed(() => import("./routes/shop-page"), "ShopPage");
const ShopCheckoutPage = lazyNamed(() => import("./routes/shop-checkout-page"), "ShopCheckoutPage");
const ShopOrdersPage = lazyNamed(() => import("./routes/shop-orders-page"), "ShopOrdersPage");
const GiftCabinetPage = lazyNamed(() => import("./routes/gift-cabinet-page"), "GiftCabinetPage");

const ProfileFavoritesPage = lazyNamed(() => import("./routes/profile-favorites-page"), "ProfileFavoritesPage");

const ProfileMomentsPage = lazyNamed(() => import("./routes/profile-moments-page"), "ProfileMomentsPage");

const ProfileFeedPage = lazyNamed(() => import("./routes/profile-feed-page"), "ProfileFeedPage");

const DesktopMobilePage = lazyNamed(() => import("./routes/desktop-mobile-page"), "DesktopMobilePage");

const DesktopChatFilesPage = lazyNamed(() => import("./routes/desktop-chat-files-page"), "DesktopChatFilesPage");

const DesktopChatHistoryPage = lazyNamed(() => import("./routes/desktop-chat-history-page"), "DesktopChatHistoryPage");

const DesktopChatImageViewerPage = lazyNamed(() => import("./routes/desktop-chat-image-viewer-page"), "DesktopChatImageViewerPage");

const DesktopChatWindowPage = lazyNamed(() => import("./routes/desktop-chat-window-page"), "DesktopChatWindowPage");

const DesktopOfficialArticleWindowPage = lazyNamed(() => import("./routes/desktop-official-article-window-page"), "DesktopOfficialArticleWindowPage");

const DesktopNoteWindowPage = lazyNamed(() => import("./routes/desktop-note-window-page"), "DesktopNoteWindowPage");

const DesktopFeedbackPage = lazyNamed(() => import("./routes/desktop-feedback-page"), "DesktopFeedbackPage");

const ProfileFeedbackPage = lazyNamed(() => import("./routes/profile-feedback-page"), "ProfileFeedbackPage");

const ProfileCharacterImportPage = lazyNamed(() => import("./routes/profile-character-import-page"), "ProfileCharacterImportPage");

const DesktopAddFriendPage = lazyNamed(() => import("./routes/desktop-add-friend-page"), "DesktopAddFriendPage");

const DesktopSettingsPage = lazyNamed(() => import("./routes/desktop-settings-page"), "DesktopSettingsPage");

const LiveCompanionPage = lazyNamed(() => import("./routes/live-companion-page"), "LiveCompanionPage");

const ChatRoomPage = lazyNamed(() => import("./routes/chat-room-page"), "ChatRoomPage");

const ChatVoiceCallPage = lazyNamed(() => import("./routes/chat-voice-call-page"), "ChatVoiceCallPage");

const ChatVideoCallPage = lazyNamed(() => import("./routes/chat-video-call-page"), "ChatVideoCallPage");

const GroupVoiceCallPage = lazyNamed(() => import("./routes/group-voice-call-page"), "GroupVoiceCallPage");

const GroupVideoCallPage = lazyNamed(() => import("./routes/group-video-call-page"), "GroupVideoCallPage");

const ChatBackgroundPage = lazyNamed(() => import("./routes/chat-background-page"), "ChatBackgroundPage");

const GroupChatBackgroundPage = lazyNamed(() => import("./routes/group-chat-background-page"), "GroupChatBackgroundPage");

const ChatDetailsPage = lazyNamed(() => import("./routes/chat-details-page"), "ChatDetailsPage");

const ChatMessageSearchPage = lazyNamed(() => import("./routes/chat-message-search-page"), "ChatMessageSearchPage");

const CharacterDetailPage = lazyNamed(() => import("./routes/character-detail-page"), "CharacterDetailPage");

const FriendRequestsPage = lazyNamed(() => import("./routes/friend-requests-page"), "FriendRequestsPage");

const MobileAddFriendPage = lazyNamed(() => import("./routes/mobile-add-friend-page"), "MobileAddFriendPage");

const GroupChatPage = lazyNamed(() => import("./routes/group-chat-page"), "GroupChatPage");

const GroupChatDetailsPage = lazyNamed(() => import("./routes/group-chat-details-page"), "GroupChatDetailsPage");

const GroupChatNameEditPage = lazyNamed(() => import("./routes/group-chat-edit-page"), "GroupChatNameEditPage");

const GroupChatNicknameEditPage = lazyNamed(() => import("./routes/group-chat-edit-page"), "GroupChatNicknameEditPage");

const GroupAnnouncementPage = lazyNamed(() => import("./routes/group-announcement-page"), "GroupAnnouncementPage");

const GroupMessageSearchPage = lazyNamed(() => import("./routes/group-message-search-page"), "GroupMessageSearchPage");

const GroupMemberAddPage = lazyNamed(() => import("./routes/group-member-picker-page"), "GroupMemberAddPage");

const GroupMemberRemovePage = lazyNamed(() => import("./routes/group-member-picker-page"), "GroupMemberRemovePage");

const CreateGroupPage = lazyNamed(() => import("./routes/create-group-page"), "CreateGroupPage");

const NotesPage = lazyNamed(() => import("./routes/notes-page"), "NotesPage");

const MobileNoteEditorPage = lazyNamed(() => import("./routes/mobile-note-editor-page"), "MobileNoteEditorPage");

const LegalPrivacyPage = lazyNamed(() => import("./routes/legal-privacy-page"), "LegalPrivacyPage");

const LegalTermsPage = lazyNamed(() => import("./routes/legal-terms-page"), "LegalTermsPage");

const LegalCommunityPage = lazyNamed(() => import("./routes/legal-community-page"), "LegalCommunityPage");

const rootRoute = createRootRoute({
  component: RootLayout,
});

function requireWorldReady() {
  const state = useWorldOwnerStore.getState();
  if (!state.onboardingCompleted) {
    throw redirect({ to: "/welcome" });
  }
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: SplashPage,
});

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/welcome",
  component: WelcomePage,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  beforeLoad: () => {
    throw redirect({ to: "/welcome", replace: true });
  },
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  beforeLoad: () => {
    throw redirect({ to: "/welcome", replace: true });
  },
});

const tabsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tabs",
  beforeLoad: requireWorldReady,
});

const chatListRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/chat",
  component: ChatListPage,
});

const subscriptionInboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/subscription-inbox",
  beforeLoad: requireWorldReady,
  component: SubscriptionInboxPage,
});

const momentsRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/moments",
  component: MomentsPage,
});

const friendMomentsRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/moments/friend/$characterId",
  component: LegacyFriendMomentsRedirectPage,
});

const mobileFriendMomentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/friend-moments/$characterId",
  beforeLoad: requireWorldReady,
  component: MobileFriendMomentsPage,
});

const desktopFriendMomentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/friend-moments/$characterId",
  beforeLoad: requireWorldReady,
  component: FriendMomentsPage,
});

const favoritesRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/favorites",
  component: FavoritesPage,
});

const feedRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/feed",
  component: FeedPage,
});

const channelsRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/channels",
  component: ChannelsPage,
});

const channelAuthorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/channels/authors/$authorId",
  beforeLoad: requireWorldReady,
  component: ChannelAuthorPage,
});

// 视频号「观看历史」——pushed detail（仿 channelAuthorRoute 挂 rootRoute，不在 tabs 下）。
const channelHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/channels/history",
  beforeLoad: requireWorldReady,
  component: ChannelHistoryPage,
});

const searchRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/search",
  component: SearchPage,
});

const gamesRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/games",
  component: GamesPage,
});

const yinjieFarmRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/games/yinjie-farm",
  beforeLoad: requireWorldReady,
  component: YinjieFarmPage,
});

const gamePlayRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/games/play/$gameId",
  beforeLoad: requireWorldReady,
  component: GamePlayPage,
});

const miniProgramsRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/mini-programs",
  component: MiniProgramsPage,
});

const discoverRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/discover",
  component: DiscoverPage,
});

const worldRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/world",
  component: WorldPage,
});

const contactsRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/contacts",
  component: ContactsPage,
});

const profileRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/profile",
  component: ProfilePage,
});

const chatRoomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId",
  beforeLoad: requireWorldReady,
  component: ChatRoomPage,
});

const chatDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId/details",
  beforeLoad: requireWorldReady,
  component: ChatDetailsPage,
});

const chatVoiceCallRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId/voice-call",
  beforeLoad: requireWorldReady,
  component: ChatVoiceCallPage,
});

const chatVideoCallRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId/video-call",
  beforeLoad: requireWorldReady,
  component: ChatVideoCallPage,
});

const chatBackgroundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId/background",
  beforeLoad: requireWorldReady,
  component: ChatBackgroundPage,
});

const chatMessageSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId/search",
  beforeLoad: requireWorldReady,
  component: ChatMessageSearchPage,
});

const characterDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/character/$characterId",
  beforeLoad: requireWorldReady,
  component: CharacterDetailPage,
});

const friendRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/friend-requests",
  beforeLoad: requireWorldReady,
  component: FriendRequestsPage,
});

const mobileAddFriendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/add-friend",
  beforeLoad: requireWorldReady,
  component: MobileAddFriendPage,
});

const starredFriendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contacts/starred",
  beforeLoad: requireWorldReady,
  component: StarredFriendsPage,
});

const worldCharactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contacts/world-characters",
  beforeLoad: requireWorldReady,
  component: WorldCharactersPage,
});

const groupContactsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contacts/groups",
  beforeLoad: requireWorldReady,
  component: GroupContactsPage,
});

const tagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contacts/tags",
  beforeLoad: requireWorldReady,
  component: TagsPage,
});

const officialAccountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contacts/official-accounts",
  beforeLoad: requireWorldReady,
  component: OfficialAccountsPage,
});

const officialAccountDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/official-accounts/$accountId",
  beforeLoad: requireWorldReady,
  component: OfficialAccountDetailPage,
});

const officialAccountArticleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/official-accounts/articles/$articleId",
  beforeLoad: requireWorldReady,
  component: OfficialAccountArticlePage,
});

const officialAccountServiceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/official-accounts/service/$accountId",
  beforeLoad: requireWorldReady,
  component: OfficialAccountServicePage,
});

const groupChatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId",
  beforeLoad: requireWorldReady,
  component: GroupChatPage,
});

const groupVoiceCallRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/voice-call",
  beforeLoad: requireWorldReady,
  component: GroupVoiceCallPage,
});

const groupVideoCallRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/video-call",
  beforeLoad: requireWorldReady,
  component: GroupVideoCallPage,
});

const groupChatDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/details",
  beforeLoad: requireWorldReady,
  component: GroupChatDetailsPage,
});

const groupChatNameEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/edit/name",
  beforeLoad: requireWorldReady,
  component: GroupChatNameEditPage,
});

const groupChatNicknameEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/edit/nickname",
  beforeLoad: requireWorldReady,
  component: GroupChatNicknameEditPage,
});

const groupChatBackgroundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/background",
  beforeLoad: requireWorldReady,
  component: GroupChatBackgroundPage,
});

const groupAnnouncementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/announcement",
  beforeLoad: requireWorldReady,
  component: GroupAnnouncementPage,
});

const groupMessageSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/search",
  beforeLoad: requireWorldReady,
  component: GroupMessageSearchPage,
});

const groupMemberAddRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/members/add",
  beforeLoad: requireWorldReady,
  component: GroupMemberAddPage,
});

const groupMemberRemoveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/members/remove",
  beforeLoad: requireWorldReady,
  component: GroupMemberRemovePage,
});

const createGroupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/new",
  beforeLoad: requireWorldReady,
  component: CreateGroupPage,
});

const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  beforeLoad: requireWorldReady,
  component: NotesPage,
});

const mobileNoteEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes/new",
  beforeLoad: requireWorldReady,
  component: MobileNoteEditorPage,
});

const discoverMomentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/moments",
  beforeLoad: requireWorldReady,
  component: MomentsPage,
});

const discoverMomentsPublishRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/moments/publish",
  beforeLoad: requireWorldReady,
  component: MobileMomentsPublishPage,
});

const discoverFeedPublishRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/feed/publish",
  beforeLoad: requireWorldReady,
  component: MobileFeedPublishPage,
});

const discoverEncounterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/encounter",
  beforeLoad: requireWorldReady,
  component: DiscoverEncounterPage,
});

const discoverAvatarEncounterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/avatar-encounter",
  beforeLoad: requireWorldReady,
  component: DiscoverAvatarEncounterPage,
});

const cyberAvatarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cyber-avatar",
  beforeLoad: requireWorldReady,
  component: CyberAvatarPage,
});

const discoverSceneRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/scene",
  beforeLoad: requireWorldReady,
  component: DiscoverScenePage,
});

const discoverFeedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/feed",
  beforeLoad: requireWorldReady,
  component: DiscoverFeedPage,
});

const discoverChannelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/channels",
  beforeLoad: requireWorldReady,
  component: DiscoverChannelsPage,
});

const discoverGamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/games",
  beforeLoad: requireWorldReady,
  component: GamesPage,
});

const discoverMiniProgramsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/mini-programs",
  beforeLoad: requireWorldReady,
  component: MiniProgramsPage,
});

const profileSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/settings",
  beforeLoad: requireWorldReady,
  component: ProfileSettingsPage,
});

const profileSettingsLanguageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/settings/language",
  beforeLoad: requireWorldReady,
  component: ProfileSettingsLanguagePage,
});

const profileSettingsAccountSecurityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/settings/account-security",
  beforeLoad: requireWorldReady,
  component: ProfileSettingsAccountSecurityPage,
});

const profileInfoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/info",
  beforeLoad: requireWorldReady,
  component: ProfileInfoPage,
});

const profileInfoNameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/info/name",
  beforeLoad: requireWorldReady,
  component: ProfileInfoNamePage,
});

const profileInfoSignatureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/info/signature",
  beforeLoad: requireWorldReady,
  component: ProfileInfoSignaturePage,
});

const profileInfoContactRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/info/contact",
  beforeLoad: requireWorldReady,
  component: ProfileInfoContactPage,
});

// 个人资料通用字段编辑页：$field 指明编辑哪个字段（gender/age/occupation/...）。
const profileInfoFieldRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/info/field/$field",
  beforeLoad: requireWorldReady,
  component: ProfileInfoFieldPage,
});

const profileSubscriptionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/subscription",
  beforeLoad: requireWorldReady,
  component: ProfileSubscriptionPage,
});

const profileXhsRewardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/xhs-reward",
  beforeLoad: requireWorldReady,
  component: ProfileXhsRewardPage,
});

const walletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/wallet",
  beforeLoad: requireWorldReady,
  component: WalletPage,
});

const knowledgeBaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/knowledge",
  beforeLoad: requireWorldReady,
  component: KnowledgeBasePage,
});

const shopRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shop",
  beforeLoad: requireWorldReady,
  component: ShopPage,
});

const shopCheckoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shop/checkout/$goodsId",
  beforeLoad: requireWorldReady,
  component: ShopCheckoutPage,
});

const shopOrdersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shop/orders",
  beforeLoad: requireWorldReady,
  component: ShopOrdersPage,
});

const giftCabinetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gift-cabinet",
  beforeLoad: requireWorldReady,
  component: GiftCabinetPage,
});

const walletTransactionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/wallet/transactions",
  beforeLoad: requireWorldReady,
  component: WalletTransactionsPage,
});

const profileFavoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/favorites",
  beforeLoad: requireWorldReady,
  component: ProfileFavoritesPage,
});

const profileMomentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/moments",
  beforeLoad: requireWorldReady,
  component: ProfileMomentsPage,
});

const profileFeedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/feed",
  beforeLoad: requireWorldReady,
  component: ProfileFeedPage,
});

const profileFeedbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/feedback",
  beforeLoad: requireWorldReady,
  component: ProfileFeedbackPage,
});

const profileCharacterImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/character-import",
  beforeLoad: requireWorldReady,
  component: ProfileCharacterImportPage,
});

const desktopMobileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/mobile",
  beforeLoad: requireWorldReady,
  component: DesktopMobilePage,
});

const desktopChatFilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/chat-files",
  beforeLoad: requireWorldReady,
  component: DesktopChatFilesPage,
});

const desktopChatHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/chat-history",
  beforeLoad: requireWorldReady,
  component: DesktopChatHistoryPage,
});

const desktopChatImageViewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/chat-image-viewer",
  beforeLoad: requireWorldReady,
  component: DesktopChatImageViewerPage,
});

const desktopChatWindowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/chat-window",
  beforeLoad: requireWorldReady,
  component: DesktopChatWindowPage,
});

const desktopOfficialArticleWindowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/official-article-window",
  beforeLoad: requireWorldReady,
  component: DesktopOfficialArticleWindowPage,
});

const desktopNoteWindowRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/note-window",
  beforeLoad: requireWorldReady,
  component: DesktopNoteWindowPage,
});

const desktopFeedbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/feedback",
  beforeLoad: requireWorldReady,
  component: DesktopFeedbackPage,
});

const desktopAddFriendRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/add-friend",
  beforeLoad: requireWorldReady,
  component: DesktopAddFriendPage,
});

const desktopSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/settings",
  beforeLoad: requireWorldReady,
  component: DesktopSettingsPage,
});

const liveCompanionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/channels/live-companion",
  beforeLoad: requireWorldReady,
  component: LiveCompanionPage,
});

const legalPrivacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/legal/privacy",
  component: LegalPrivacyPage,
});

const legalTermsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/legal/terms",
  component: LegalTermsPage,
});

const legalCommunityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/legal/community",
  component: LegalCommunityPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  welcomeRoute,
  onboardingRoute,
  setupRoute,
  tabsRoute.addChildren([
    chatListRoute,
    favoritesRoute,
    momentsRoute,
    friendMomentsRoute,
    feedRoute,
    channelsRoute,
    searchRoute,
    gamesRoute,
    yinjieFarmRoute,
    gamePlayRoute,
    miniProgramsRoute,
    discoverRoute,
    worldRoute,
    contactsRoute,
    profileRoute,
  ]),
  channelAuthorRoute,
  channelHistoryRoute,
  subscriptionInboxRoute,
  chatRoomRoute,
  chatDetailsRoute,
  chatVoiceCallRoute,
  chatVideoCallRoute,
  chatBackgroundRoute,
  chatMessageSearchRoute,
  characterDetailRoute,
  friendRequestsRoute,
  starredFriendsRoute,
  worldCharactersRoute,
  groupContactsRoute,
  tagsRoute,
  officialAccountsRoute,
  officialAccountDetailRoute,
  officialAccountArticleRoute,
  officialAccountServiceRoute,
  groupChatRoute,
  groupVoiceCallRoute,
  groupVideoCallRoute,
  groupChatDetailsRoute,
  groupChatNameEditRoute,
  groupChatNicknameEditRoute,
  groupChatBackgroundRoute,
  groupAnnouncementRoute,
  groupMessageSearchRoute,
  groupMemberAddRoute,
  groupMemberRemoveRoute,
  createGroupRoute,
  notesRoute,
  mobileNoteEditorRoute,
  discoverMomentsRoute,
  discoverMomentsPublishRoute,
  discoverEncounterRoute,
  discoverAvatarEncounterRoute,
  cyberAvatarRoute,
  discoverSceneRoute,
  discoverFeedRoute,
  discoverFeedPublishRoute,
  discoverChannelsRoute,
  discoverGamesRoute,
  discoverMiniProgramsRoute,
  profileSettingsRoute,
  profileSettingsLanguageRoute,
  profileSettingsAccountSecurityRoute,
  profileInfoRoute,
  profileInfoNameRoute,
  profileInfoSignatureRoute,
  profileInfoContactRoute,
  profileInfoFieldRoute,
  profileSubscriptionRoute,
  profileXhsRewardRoute,
  walletRoute,
  knowledgeBaseRoute,
  walletTransactionsRoute,
  shopRoute,
  shopCheckoutRoute,
  shopOrdersRoute,
  giftCabinetRoute,
  profileFavoritesRoute,
  profileMomentsRoute,
  profileFeedRoute,
  profileFeedbackRoute,
  profileCharacterImportRoute,
  desktopMobileRoute,
  mobileFriendMomentsRoute,
  desktopFriendMomentsRoute,
  desktopChatFilesRoute,
  desktopChatHistoryRoute,
  desktopChatImageViewerRoute,
  desktopChatWindowRoute,
  desktopOfficialArticleWindowRoute,
  desktopNoteWindowRoute,
  desktopFeedbackRoute,
  desktopAddFriendRoute,
  mobileAddFriendRoute,
  desktopSettingsRoute,
  liveCompanionRoute,
  legalPrivacyRoute,
  legalTermsRoute,
  legalCommunityRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  // 用户从外部链接（含官网语言前缀 /zh-CN 等）误入 app 入口时，与其卡在
  // tanstack-router 默认的 Not Found，不如把所有未匹配路径归到 splash，
  // splash 会按 onboarding/world 状态决定后续目的地。
  defaultNotFoundComponent: () => <Navigate to="/" replace />,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
