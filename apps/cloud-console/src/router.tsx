import { lazy } from "react";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { RootLayout } from "./components/root-layout";

const DashboardPage = lazy(async () => {
  const mod = await import("./routes/dashboard-page");
  return { default: mod.DashboardPage };
});

const RequestsPage = lazy(async () => {
  const mod = await import("./routes/requests-page");
  return { default: mod.RequestsPage };
});

const RequestDetailPage = lazy(async () => {
  const mod = await import("./routes/request-detail-page");
  return { default: mod.RequestDetailPage };
});

const WorldsPage = lazy(async () => {
  const mod = await import("./routes/worlds-page");
  return { default: mod.WorldsPage };
});

const WorldDetailPage = lazy(async () => {
  const mod = await import("./routes/world-detail-page");
  return { default: mod.WorldDetailPage };
});

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const requestsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/requests",
  component: RequestsPage,
});

const requestDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/requests/$requestId",
  component: RequestDetailPage,
});

const worldsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/worlds",
  component: WorldsPage,
});

const worldDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/worlds/$worldId",
  component: WorldDetailPage,
});

const routeTree = rootRoute.addChildren([indexRoute, requestsRoute, requestDetailRoute, worldsRoute, worldDetailRoute]);

export const router = createRouter({
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
