import { lazy } from "react";
import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
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

const MomentsPage = lazy(async () => {
  const mod = await import("./routes/moments-page");
  return { default: mod.MomentsPage };
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

const ProfilePage = lazy(async () => {
  const mod = await import("./routes/profile-page");
  return { default: mod.ProfilePage };
});

const ProfileSettingsPage = lazy(async () => {
  const mod = await import("./routes/profile-settings-page");
  return { default: mod.ProfileSettingsPage };
});

const ChatRoomPage = lazy(async () => {
  const mod = await import("./routes/chat-room-page");
  return { default: mod.ChatRoomPage };
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

const CreateGroupPage = lazy(async () => {
  const mod = await import("./routes/create-group-page");
  return { default: mod.CreateGroupPage };
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

const momentsRoute = createRoute({
  getParentRoute: () => tabsRoute,
  path: "/moments",
  component: MomentsPage,
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

const groupChatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId",
  beforeLoad: requireWorldReady,
  component: GroupChatPage,
});

const createGroupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/new",
  beforeLoad: requireWorldReady,
  component: CreateGroupPage,
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
  tabsRoute.addChildren([chatListRoute, momentsRoute, discoverRoute, contactsRoute, profileRoute]),
  chatRoomRoute,
  characterDetailRoute,
  friendRequestsRoute,
  groupChatRoute,
  createGroupRoute,
  discoverMomentsRoute,
  discoverEncounterRoute,
  discoverSceneRoute,
  discoverFeedRoute,
  profileSettingsRoute,
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
