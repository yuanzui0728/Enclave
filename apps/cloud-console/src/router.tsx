import { lazy } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./components/root-layout";
import { validateAdminSessionsRouteSearch } from "./lib/admin-sessions-route-search";
import { validateJobsRouteSearch } from "./lib/job-route-search";
import { validateWaitingSessionSyncRouteSearch } from "./lib/waiting-session-sync-helpers";
import { validateWorldsRouteSearch } from "./lib/world-route-search";

const DashboardPage = lazy(async () => {
  const mod = await import("./routes/dashboard-page");
  return { default: mod.DashboardPage };
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

const WaitingSessionSyncPage = lazy(async () => {
  const mod = await import("./routes/waiting-session-sync-page");
  return { default: mod.WaitingSessionSyncPage };
});

const RevenueSharingPage = lazy(async () => {
  const mod = await import("./routes/revenue-sharing-page");
  return { default: mod.RevenueSharingPage };
});

const UsersPage = lazy(async () => {
  const mod = await import("./routes/users-page");
  return { default: mod.UsersPage };
});

const UserDetailPage = lazy(async () => {
  const mod = await import("./routes/user-detail-page");
  return { default: mod.UserDetailPage };
});

const SubscriptionPlansPage = lazy(async () => {
  const mod = await import("./routes/subscription-plans-page");
  return { default: mod.SubscriptionPlansPage };
});

const CloudConfigsPage = lazy(async () => {
  const mod = await import("./routes/cloud-configs-page");
  return { default: mod.CloudConfigsPage };
});

const InviteAuditPage = lazy(async () => {
  const mod = await import("./routes/invite-audit-page");
  return { default: mod.InviteAuditPage };
});

const FeedbacksPage = lazy(async () => {
  const mod = await import("./routes/feedbacks-page");
  return { default: mod.FeedbacksPage };
});

const TelemetryPage = lazy(async () => {
  const mod = await import("./routes/telemetry-page");
  return { default: mod.TelemetryPage };
});

const TokenUsagePage = lazy(async () => {
  const mod = await import("./routes/token-usage-page");
  return { default: mod.TokenUsagePage };
});

const TokenUsageWorldDetailPage = lazy(async () => {
  const mod = await import("./routes/token-usage-world-detail-page");
  return { default: mod.TokenUsageWorldDetailPage };
});

const WikiUsersPage = lazy(async () => {
  const mod = await import("./routes/wiki-users-page");
  return { default: mod.WikiUsersPage };
});

const WikiUserDetailPage = lazy(async () => {
  const mod = await import("./routes/wiki-user-detail-page");
  return { default: mod.WikiUserDetailPage };
});

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
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

const waitingSessionSyncRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/waiting-sync",
  validateSearch: validateWaitingSessionSyncRouteSearch,
  component: WaitingSessionSyncPage,
});

const revenueSharingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/revenue-sharing",
  component: RevenueSharingPage,
});

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users",
  component: UsersPage,
});

const userDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/users/$userId",
  component: UserDetailPage,
});

const subscriptionPlansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/subscription-plans",
  component: SubscriptionPlansPage,
});

const cloudConfigsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/configs",
  component: CloudConfigsPage,
});

const inviteAuditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite-audit",
  component: InviteAuditPage,
});

const feedbacksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/feedbacks",
  component: FeedbacksPage,
});

const telemetryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/telemetry",
  component: TelemetryPage,
});

const tokenUsageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/token-usage",
  component: TokenUsagePage,
});

const tokenUsageWorldDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/token-usage/$worldId",
  component: TokenUsageWorldDetailPage,
});

const wikiUsersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wiki-users",
  component: WikiUsersPage,
});

const wikiUserDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/wiki-users/$userId",
  component: WikiUserDetailPage,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  worldsRoute,
  worldDetailRoute,
  jobsRoute,
  adminSessionsRoute,
  waitingSessionSyncRoute,
  usersRoute,
  userDetailRoute,
  subscriptionPlansRoute,
  cloudConfigsRoute,
  inviteAuditRoute,
  feedbacksRoute,
  telemetryRoute,
  tokenUsageRoute,
  tokenUsageWorldDetailRoute,
  revenueSharingRoute,
  wikiUsersRoute,
  wikiUserDetailRoute,
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
