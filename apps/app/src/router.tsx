import { lazy } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { RootLayout } from "./features/shell/root-layout";
import { useWorldOwnerStore } from "./store/world-owner-store";

const SplashPage = lazy(async () => {
  const mod = await import("./routes/splash-page");
  return { default: mod.SplashPage };
});

const WelcomePage = lazy(async () => {
  const mod = await import("./routes/welcome-page");
  return { default: mod.WelcomePage };
});

const ChatListPage = lazy(async () => {
  const mod = await import("./routes/chat-list-page");
  return { default: mod.ChatListPage };
});

const FavoritesPage = lazy(async () => {
  const mod = await import("./routes/favorites-page");
  return { default: mod.FavoritesPage };
});

const MomentsPage = lazy(async () => {
  const mod = await import("./routes/moments-page");
  return { default: mod.MomentsPage };
});

const FeedPage = lazy(async () => {
  const mod = await import("./routes/feed-page");
  return { default: mod.FeedPage };
});

const ChannelsPage = lazy(async () => {
  const mod = await import("./routes/channels-page");
  return { default: mod.ChannelsPage };
});

const SearchPage = lazy(async () => {
  const mod = await import("./routes/search-page");
  return { default: mod.SearchPage };
});

const GamesPage = lazy(async () => {
  const mod = await import("./routes/games-page");
  return { default: mod.GamesPage };
});

const MiniProgramsPage = lazy(async () => {
  const mod = await import("./routes/mini-programs-page");
  return { default: mod.MiniProgramsPage };
});

const DiscoverPage = lazy(async () => {
  const mod = await import("./routes/discover-page");
  return { default: mod.DiscoverPage };
});

const DiscoverEncounterPage = lazy(async () => {
  const mod = await import("./routes/discover-encounter-page");
  return { default: mod.DiscoverEncounterPage };
});

const DiscoverScenePage = lazy(async () => {
  const mod = await import("./routes/discover-scene-page");
  return { default: mod.DiscoverScenePage };
});

const DiscoverFeedPage = lazy(async () => {
  const mod = await import("./routes/discover-feed-page");
  return { default: mod.DiscoverFeedPage };
});

const ContactsPage = lazy(async () => {
  const mod = await import("./routes/contacts-page");
  return { default: mod.ContactsPage };
});

const StarredFriendsPage = lazy(async () => {
  const mod = await import("./routes/starred-friends-page");
  return { default: mod.StarredFriendsPage };
});

const OfficialAccountsPage = lazy(async () => {
  const mod = await import("./routes/official-accounts-page");
  return { default: mod.OfficialAccountsPage };
});

const OfficialAccountDetailPage = lazy(async () => {
  const mod = await import("./routes/official-account-detail-page");
  return { default: mod.OfficialAccountDetailPage };
});

const OfficialAccountArticlePage = lazy(async () => {
  const mod = await import("./routes/official-account-article-page");
  return { default: mod.OfficialAccountArticlePage };
});

const SubscriptionInboxPage = lazy(async () => {
  const mod = await import("./routes/subscription-inbox-page");
  return { default: mod.SubscriptionInboxPage };
});

const ProfilePage = lazy(async () => {
  const mod = await import("./routes/profile-page");
  return { default: mod.ProfilePage };
});

const ProfileSettingsPage = lazy(async () => {
  const mod = await import("./routes/profile-settings-page");
  return { default: mod.ProfileSettingsPage };
});

const DesktopMobilePage = lazy(async () => {
  const mod = await import("./routes/desktop-mobile-page");
  return { default: mod.DesktopMobilePage };
});

const DesktopChatFilesPage = lazy(async () => {
  const mod = await import("./routes/desktop-chat-files-page");
  return { default: mod.DesktopChatFilesPage };
});

const DesktopChatHistoryPage = lazy(async () => {
  const mod = await import("./routes/desktop-chat-history-page");
  return { default: mod.DesktopChatHistoryPage };
});

const DesktopFeedbackPage = lazy(async () => {
  const mod = await import("./routes/desktop-feedback-page");
  return { default: mod.DesktopFeedbackPage };
});

const DesktopSettingsPage = lazy(async () => {
  const mod = await import("./routes/desktop-settings-page");
  return { default: mod.DesktopSettingsPage };
});

const LiveCompanionPage = lazy(async () => {
  const mod = await import("./routes/live-companion-page");
  return { default: mod.LiveCompanionPage };
});

const ChatRoomPage = lazy(async () => {
  const mod = await import("./routes/chat-room-page");
  return { default: mod.ChatRoomPage };
});

const ChatBackgroundPage = lazy(async () => {
  const mod = await import("./routes/chat-background-page");
  return { default: mod.ChatBackgroundPage };
});

const ChatDetailsPage = lazy(async () => {
  const mod = await import("./routes/chat-details-page");
  return { default: mod.ChatDetailsPage };
});

const ChatMessageSearchPage = lazy(async () => {
  const mod = await import("./routes/chat-message-search-page");
  return { default: mod.ChatMessageSearchPage };
});

const CharacterDetailPage = lazy(async () => {
  const mod = await import("./routes/character-detail-page");
  return { default: mod.CharacterDetailPage };
});

const FriendRequestsPage = lazy(async () => {
  const mod = await import("./routes/friend-requests-page");
  return { default: mod.FriendRequestsPage };
});

const GroupChatPage = lazy(async () => {
  const mod = await import("./routes/group-chat-page");
  return { default: mod.GroupChatPage };
});

const GroupChatDetailsPage = lazy(async () => {
  const mod = await import("./routes/group-chat-details-page");
  return { default: mod.GroupChatDetailsPage };
});

const GroupMessageSearchPage = lazy(async () => {
  const mod = await import("./routes/group-message-search-page");
  return { default: mod.GroupMessageSearchPage };
});

const CreateGroupPage = lazy(async () => {
  const mod = await import("./routes/create-group-page");
  return { default: mod.CreateGroupPage };
});

const NotesPage = lazy(async () => {
  const mod = await import("./routes/notes-page");
  return { default: mod.NotesPage };
});

const LegalPrivacyPage = lazy(async () => {
  const mod = await import("./routes/legal-privacy-page");
  return { default: mod.LegalPrivacyPage };
});

const LegalTermsPage = lazy(async () => {
  const mod = await import("./routes/legal-terms-page");
  return { default: mod.LegalTermsPage };
});

const LegalCommunityPage = lazy(async () => {
  const mod = await import("./routes/legal-community-page");
  return { default: mod.LegalCommunityPage };
});

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

const starredFriendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contacts/starred",
  beforeLoad: requireWorldReady,
  component: StarredFriendsPage,
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

const groupChatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId",
  beforeLoad: requireWorldReady,
  component: GroupChatPage,
});

const groupChatDetailsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/details",
  beforeLoad: requireWorldReady,
  component: GroupChatDetailsPage,
});

const groupMessageSearchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId/search",
  beforeLoad: requireWorldReady,
  component: GroupMessageSearchPage,
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

const discoverMomentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/moments",
  beforeLoad: requireWorldReady,
  component: MomentsPage,
});

const discoverEncounterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/discover/encounter",
  beforeLoad: requireWorldReady,
  component: DiscoverEncounterPage,
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

const profileSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/settings",
  beforeLoad: requireWorldReady,
  component: ProfileSettingsPage,
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

const desktopFeedbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/desktop/feedback",
  beforeLoad: requireWorldReady,
  component: DesktopFeedbackPage,
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
    feedRoute,
    channelsRoute,
    searchRoute,
    gamesRoute,
    miniProgramsRoute,
    discoverRoute,
    contactsRoute,
    profileRoute,
  ]),
  subscriptionInboxRoute,
  chatRoomRoute,
  chatDetailsRoute,
  chatBackgroundRoute,
  chatMessageSearchRoute,
  characterDetailRoute,
  friendRequestsRoute,
  starredFriendsRoute,
  officialAccountsRoute,
  officialAccountDetailRoute,
  officialAccountArticleRoute,
  groupChatRoute,
  groupChatDetailsRoute,
  groupMessageSearchRoute,
  createGroupRoute,
  notesRoute,
  discoverMomentsRoute,
  discoverEncounterRoute,
  discoverSceneRoute,
  discoverFeedRoute,
  profileSettingsRoute,
  desktopMobileRoute,
  desktopChatFilesRoute,
  desktopChatHistoryRoute,
  desktopFeedbackRoute,
  desktopSettingsRoute,
  liveCompanionRoute,
  legalPrivacyRoute,
  legalTermsRoute,
  legalCommunityRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
