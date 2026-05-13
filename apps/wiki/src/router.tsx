import { lazy } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { RootLayout } from "./components/root-layout";

const HomePage = lazy(async () => {
  const mod = await import("./routes/home-page");
  return { default: mod.HomePage };
});

const LoginPage = lazy(async () => {
  const mod = await import("./routes/login-page");
  return { default: mod.LoginPage };
});

const RegisterPage = lazy(async () => {
  const mod = await import("./routes/register-page");
  return { default: mod.RegisterPage };
});

const CharacterPage = lazy(async () => {
  const mod = await import("./routes/character-page");
  return { default: mod.CharacterPage };
});

const CharacterDiffPage = lazy(async () => {
  const mod = await import("./routes/character-diff-page");
  return { default: mod.CharacterDiffPage };
});

const CreateCharacterPage = lazy(async () => {
  const mod = await import("./routes/create-character-page");
  return { default: mod.CreateCharacterPage };
});

const MyCharactersPage = lazy(async () => {
  const mod = await import("./routes/my-characters-page");
  return { default: mod.MyCharactersPage };
});

const MyCharacterCreatePage = lazy(async () => {
  const mod = await import("./routes/my-character-edit-page");
  const Component = mod.MyCharacterEditPage;
  return { default: () => <Component mode="create" /> };
});

const MyCharacterEditPage = lazy(async () => {
  const mod = await import("./routes/my-character-edit-page");
  const Component = mod.MyCharacterEditPage;
  return { default: () => <Component mode="edit" /> };
});

const PendingReviewsPage = lazy(async () => {
  const mod = await import("./routes/pending-reviews-page");
  return { default: mod.PendingReviewsPage };
});

const RecentChangesPage = lazy(async () => {
  const mod = await import("./routes/recent-changes-page");
  return { default: mod.RecentChangesPage };
});

const AdminLayout = lazy(async () => {
  const mod = await import("./routes/admin-layout");
  return { default: mod.AdminLayout };
});

const AdminUsersPage = lazy(async () => {
  const mod = await import("./routes/admin-users-page");
  return { default: mod.AdminUsersPage };
});

const AdminBlocksPage = lazy(async () => {
  const mod = await import("./routes/admin-blocks-page");
  return { default: mod.AdminBlocksPage };
});

const AdminProtectionPage = lazy(async () => {
  const mod = await import("./routes/admin-protection-page");
  return { default: mod.AdminProtectionPage };
});

const WatchlistPage = lazy(async () => {
  const mod = await import("./routes/watchlist-page");
  return { default: mod.WatchlistPage };
});

const SearchPage = lazy(async () => {
  const mod = await import("./routes/search-page");
  return { default: mod.SearchPage };
});

const AdminReportsPage = lazy(async () => {
  const mod = await import("./routes/admin-reports-page");
  return { default: mod.AdminReportsPage };
});

const AdminAbuseFiltersPage = lazy(async () => {
  const mod = await import("./routes/admin-abuse-filters-page");
  return { default: mod.AdminAbuseFiltersPage };
});

const AdminStatsPage = lazy(async () => {
  const mod = await import("./routes/admin-stats-page");
  return { default: mod.AdminStatsPage };
});

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string } =>
    typeof search.redirect === "string" && search.redirect.length > 0
      ? { redirect: search.redirect }
      : {},
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: RegisterPage,
});

const characterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/character/$characterId",
  component: CharacterPage,
});

const characterDiffRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/character/$characterId/diff",
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === "string" ? search.from : "",
    to: typeof search.to === "string" ? search.to : "",
  }),
  component: CharacterDiffPage,
});

const createCharacterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/create",
  component: CreateCharacterPage,
});

const myCharactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-characters",
  component: MyCharactersPage,
});

const myCharacterCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-characters/new",
  component: MyCharacterCreatePage,
});

const myCharacterEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-characters/$id",
  component: MyCharacterEditPage,
});

const pendingReviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pending-reviews",
  component: PendingReviewsPage,
});

const recentChangesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/recent-changes",
  component: RecentChangesPage,
});

const adminLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "admin",
  component: AdminLayout,
});

const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/users",
  component: AdminUsersPage,
});

const adminBlocksRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/blocks",
  component: AdminBlocksPage,
});

const adminProtectionRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/protection",
  component: AdminProtectionPage,
});

const watchlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/watchlist",
  component: WatchlistPage,
});

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  component: SearchPage,
});

const adminReportsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/reports",
  component: AdminReportsPage,
});

const adminAbuseFiltersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/abuse-filters",
  component: AdminAbuseFiltersPage,
});

const adminStatsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/wiki-stats",
  component: AdminStatsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  characterRoute,
  characterDiffRoute,
  createCharacterRoute,
  myCharactersRoute,
  myCharacterCreateRoute,
  myCharacterEditRoute,
  pendingReviewsRoute,
  recentChangesRoute,
  adminLayoutRoute.addChildren([
    adminUsersRoute,
    adminBlocksRoute,
    adminProtectionRoute,
    adminReportsRoute,
    adminAbuseFiltersRoute,
    adminStatsRoute,
  ]),
  watchlistRoute,
  searchRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
