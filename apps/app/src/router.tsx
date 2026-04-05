import { lazy } from "react";
import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { RootLayout } from "./features/shell/root-layout";
import { useSessionStore } from "./store/session-store";

const SplashPage = lazy(async () => {
  const mod = await import("./routes/splash-page");
  return { default: mod.SplashPage };
});

const OnboardingPage = lazy(async () => {
  const mod = await import("./routes/onboarding-page");
  return { default: mod.OnboardingPage };
});

const LoginPage = lazy(async () => {
  const mod = await import("./routes/login-page");
  return { default: mod.LoginPage };
});

const SetupPage = lazy(async () => {
  const mod = await import("./routes/setup-page");
  return { default: mod.SetupPage };
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

const ContactsPage = lazy(async () => {
  const mod = await import("./routes/contacts-page");
  return { default: mod.ContactsPage };
});

const ProfilePage = lazy(async () => {
  const mod = await import("./routes/profile-page");
  return { default: mod.ProfilePage };
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

const rootRoute = createRootRoute({
  component: RootLayout,
});

function requireAuth() {
  const state = useSessionStore.getState();
  if (!state.token) {
    throw redirect({ to: "/onboarding" });
  }
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: SplashPage,
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupPage,
});

const tabsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tabs",
  beforeLoad: requireAuth,
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
  beforeLoad: requireAuth,
  component: ChatRoomPage,
});

const characterDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/character/$characterId",
  beforeLoad: requireAuth,
  component: CharacterDetailPage,
});

const friendRequestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/friend-requests",
  beforeLoad: requireAuth,
  component: FriendRequestsPage,
});

const groupChatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/$groupId",
  beforeLoad: requireAuth,
  component: GroupChatPage,
});

const createGroupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/group/new",
  beforeLoad: requireAuth,
  component: CreateGroupPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  onboardingRoute,
  loginRoute,
  setupRoute,
  tabsRoute.addChildren([chatListRoute, momentsRoute, discoverRoute, contactsRoute, profileRoute]),
  chatRoomRoute,
  characterDetailRoute,
  friendRequestsRoute,
  groupChatRoute,
  createGroupRoute,
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
