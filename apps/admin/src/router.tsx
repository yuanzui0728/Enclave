import { lazy } from "react";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./components/root-layout";

const DashboardPage = lazy(async () => {
  const mod = await import("./routes/dashboard-page");
  return { default: mod.DashboardPage };
});

const CharactersPage = lazy(async () => {
  const mod = await import("./routes/characters-page");
  return { default: mod.CharactersPage };
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  setupRoute,
  charactersRoute,
  characterEditorRoute,
  characterFactoryRoute,
  characterRuntimeRoute,
  evalsRoute,
  replyLogicRoute,
  chatRecordsRoute,
  tokenUsageRoute,
]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
