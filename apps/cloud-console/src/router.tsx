import { lazy } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./components/root-layout";
import { validateAdminSessionsRouteSearch } from "./lib/admin-sessions-route-search";
import { validateJobsRouteSearch } from "./lib/job-route-search";
import { validateRequestsRouteSearch } from "./lib/request-route-search";
import { validateWorldsRouteSearch } from "./lib/world-route-search";

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

const JobsPage = lazy(async () => {
  const mod = await import("./routes/jobs-page");
  return { default: mod.JobsPage };
});

const AdminSessionsPage = lazy(async () => {
  const mod = await import("./routes/admin-sessions-page");
  return { default: mod.AdminSessionsPage };
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
  validateSearch: validateRequestsRouteSearch,
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
  validateSearch: validateWorldsRouteSearch,
  component: WorldsPage,
});

const worldDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/worlds/$worldId",
  component: WorldDetailPage,
});

const jobsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/jobs",
  validateSearch: validateJobsRouteSearch,
  component: JobsPage,
});

const adminSessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sessions",
  validateSearch: validateAdminSessionsRouteSearch,
  component: AdminSessionsPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  requestsRoute,
  requestDetailRoute,
  worldsRoute,
  worldDetailRoute,
  jobsRoute,
  adminSessionsRoute,
]);

type AppRouterOptions = {
  history?: Parameters<typeof createRouter>[0]["history"];
};

export function createAppRouter(options?: AppRouterOptions) {
  return createRouter({
    routeTree,
    ...(options?.history ? { history: options.history } : {}),
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
