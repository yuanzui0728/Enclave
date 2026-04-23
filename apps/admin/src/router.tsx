import { lazy } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./components/root-layout";

const DashboardPage = lazy(async () => {
  const mod = await import("./routes/dashboard-page");
  return { default: mod.DashboardPage };
});

const CharactersPage = lazy(async () => {
  const mod = await import("./routes/characters-page");
  return { default: mod.CharactersPage };
});

const GamesPage = lazy(async () => {
  const mod = await import("./routes/games-page");
  return { default: mod.GamesPage };
});

const WechatSyncPage = lazy(async () => {
  const mod = await import("./routes/wechat-sync-page");
  return { default: mod.WechatSyncPage };
});

const CharacterEditorPage = lazy(async () => {
  const mod = await import("./routes/character-editor-page");
  return { default: mod.CharacterEditorPage };
});

const CharacterFactoryPage = lazy(async () => {
  const mod = await import("./routes/character-factory-page");
  return { default: mod.CharacterFactoryPage };
});

const CharacterRuntimePage = lazy(async () => {
  const mod = await import("./routes/character-runtime-page");
  return { default: mod.CharacterRuntimePage };
});

const EvalsPage = lazy(async () => {
  const mod = await import("./routes/evals-page");
  return { default: mod.EvalsPage };
});

const ReplyLogicPage = lazy(async () => {
  const mod = await import("./routes/reply-logic-page");
  return { default: mod.ReplyLogicPage };
});

const NeedDiscoveryPage = lazy(async () => {
  const mod = await import("./routes/need-discovery-page");
  return { default: mod.NeedDiscoveryPage };
});

const FollowupRuntimePage = lazy(async () => {
  const mod = await import("./routes/followup-runtime-page");
  return { default: mod.FollowupRuntimePage };
});

const ReminderRuntimePage = lazy(async () => {
  const mod = await import("./routes/reminder-runtime-page");
  return { default: mod.ReminderRuntimePage };
});

const ActionRuntimePage = lazy(async () => {
  const mod = await import("./routes/action-runtime-page");
  return { default: mod.ActionRuntimePage };
});

const CyberAvatarPage = lazy(async () => {
  const mod = await import("./routes/cyber-avatar-page");
  return { default: mod.CyberAvatarPage };
});

const RealWorldSyncPage = lazy(async () => {
  const mod = await import("./routes/real-world-sync-page");
  return { default: mod.RealWorldSyncPage };
});

const ChatRecordsPage = lazy(async () => {
  const mod = await import("./routes/chat-records-page");
  return { default: mod.ChatRecordsPage };
});

const TokenUsagePage = lazy(async () => {
  const mod = await import("./routes/token-usage-page");
  return { default: mod.TokenUsagePage };
});

const SetupPage = lazy(async () => {
  const mod = await import("./routes/setup-page");
  return { default: mod.SetupPage };
});

const InferencePage = lazy(async () => {
  const mod = await import("./routes/inference-page");
  return { default: mod.InferencePage };
});

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupPage,
});

const charactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters",
  component: CharactersPage,
});

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games",
  component: GamesPage,
});

const wechatSyncRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/wechat-sync",
  component: WechatSyncPage,
});

const characterEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/$characterId",
  component: CharacterEditorPage,
});

const characterFactoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/$characterId/factory",
  component: CharacterFactoryPage,
});

const characterRuntimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/$characterId/runtime",
  component: CharacterRuntimePage,
});

const evalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/evals",
  component: EvalsPage,
});

const replyLogicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reply-logic",
  component: ReplyLogicPage,
});

const needDiscoveryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/need-discovery",
  component: NeedDiscoveryPage,
});

const followupRuntimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/followup-runtime",
  component: FollowupRuntimePage,
});

const reminderRuntimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reminder-runtime",
  component: ReminderRuntimePage,
});

const actionRuntimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/action-runtime",
  component: ActionRuntimePage,
});

const cyberAvatarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/cyber-avatar",
  component: CyberAvatarPage,
});

const realWorldSyncRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/real-world-sync",
  component: RealWorldSyncPage,
});

const chatRecordsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat-records",
  component: ChatRecordsPage,
});

const tokenUsageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/token-usage",
  component: TokenUsagePage,
});

const inferenceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inference",
  component: InferencePage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  charactersRoute,
  gamesRoute,
  wechatSyncRoute,
  characterEditorRoute,
  characterFactoryRoute,
  characterRuntimeRoute,
  evalsRoute,
  replyLogicRoute,
  needDiscoveryRoute,
  followupRuntimeRoute,
  reminderRuntimeRoute,
  actionRuntimeRoute,
  cyberAvatarRoute,
  realWorldSyncRoute,
  chatRecordsRoute,
  tokenUsageRoute,
  inferenceRoute,
]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
