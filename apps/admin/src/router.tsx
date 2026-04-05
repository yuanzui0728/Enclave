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

const EvalsPage = lazy(async () => {
  const mod = await import("./routes/evals-page");
  return { default: mod.EvalsPage };
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

const evalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/evals",
  component: EvalsPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupPage,
});

const routeTree = rootRoute.addChildren([indexRoute, charactersRoute, characterEditorRoute, evalsRoute, setupRoute]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
