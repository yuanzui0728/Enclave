import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
} from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, Card } from "@yinjie/ui";
import { RootLayout } from "./components/root-layout";
import { lazyWithReload } from "./lib/lazy-with-reload";
// 首屏路由：home-page 走静态 import 跟主 chunk 一起到，省一个 RTT。
// 其它路由保留 lazy，按需加载。
import { HomePage } from "./routes/home-page";

// 默认 404 组件：tanstack-router 内置 fallback 是裸的英文 "Not Found"，
// 公网访问者打错路径或点了过期链接看到一坨英文体验差。包成一张本地化卡片
// + 回首页按钮。所有未注册路由（含 /admin/<错路径>）走这里。
function WikiNotFound() {
  const t = translateRuntimeMessage;
  return (
    <Card className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">
        <Trans>页面不存在</Trans>
      </h1>
      <p className="text-sm text-[color:var(--text-muted)]">
        <Trans>请检查链接是否正确，或回到首页继续浏览。</Trans>
      </p>
      <div>
        <Link to="/">
          <Button variant="primary" size="sm">
            {t(msg`返回首页`)}
          </Button>
        </Link>
      </div>
    </Card>
  );
}

const LoginPage = lazyWithReload(async () => {
  const mod = await import("./routes/login-page");
  return { default: mod.LoginPage };
});

const RegisterPage = lazyWithReload(async () => {
  const mod = await import("./routes/register-page");
  return { default: mod.RegisterPage };
});

const CharacterPage = lazyWithReload(async () => {
  const mod = await import("./routes/character-page");
  return { default: mod.CharacterPage };
});

const CharacterDiffPage = lazyWithReload(async () => {
  const mod = await import("./routes/character-diff-page");
  return { default: mod.CharacterDiffPage };
});

const WorldCharacterEditPage = lazyWithReload(async () => {
  const mod = await import("./routes/world-character-edit-page");
  return { default: mod.WorldCharacterEditPage };
});

const CreateCharacterPage = lazyWithReload(async () => {
  const mod = await import("./routes/create-character-page");
  return { default: mod.CreateCharacterPage };
});

const MyCharactersPage = lazyWithReload(async () => {
  const mod = await import("./routes/my-characters-page");
  return { default: mod.MyCharactersPage };
});

const CommunityCharactersPage = lazyWithReload(async () => {
  const mod = await import("./routes/community-characters-page");
  return { default: mod.CommunityCharactersPage };
});

const CommunityCharacterPage = lazyWithReload(async () => {
  const mod = await import("./routes/community-character-page");
  return { default: mod.CommunityCharacterPage };
});

const MyCharacterCreatePage = lazyWithReload(async () => {
  const mod = await import("./routes/my-character-edit-page");
  const Component = mod.MyCharacterEditPage;
  return { default: () => <Component mode="create" /> };
});

const MyCharacterEditPage = lazyWithReload(async () => {
  const mod = await import("./routes/my-character-edit-page");
  const Component = mod.MyCharacterEditPage;
  return { default: () => <Component mode="edit" /> };
});

const PendingReviewsPage = lazyWithReload(async () => {
  const mod = await import("./routes/pending-reviews-page");
  return { default: mod.PendingReviewsPage };
});

const RecentChangesPage = lazyWithReload(async () => {
  const mod = await import("./routes/recent-changes-page");
  return { default: mod.RecentChangesPage };
});

const AdminLayout = lazyWithReload(async () => {
  const mod = await import("./routes/admin-layout");
  return { default: mod.AdminLayout };
});

const AdminUsersPage = lazyWithReload(async () => {
  const mod = await import("./routes/admin-users-page");
  return { default: mod.AdminUsersPage };
});

const AdminBlocksPage = lazyWithReload(async () => {
  const mod = await import("./routes/admin-blocks-page");
  return { default: mod.AdminBlocksPage };
});

const AdminProtectionPage = lazyWithReload(async () => {
  const mod = await import("./routes/admin-protection-page");
  return { default: mod.AdminProtectionPage };
});

const WatchlistPage = lazyWithReload(async () => {
  const mod = await import("./routes/watchlist-page");
  return { default: mod.WatchlistPage };
});

const SearchPage = lazyWithReload(async () => {
  const mod = await import("./routes/search-page");
  return { default: mod.SearchPage };
});

const AdminReportsPage = lazyWithReload(async () => {
  const mod = await import("./routes/admin-reports-page");
  return { default: mod.AdminReportsPage };
});

const AdminAbuseFiltersPage = lazyWithReload(async () => {
  const mod = await import("./routes/admin-abuse-filters-page");
  return { default: mod.AdminAbuseFiltersPage };
});

const AdminStatsPage = lazyWithReload(async () => {
  const mod = await import("./routes/admin-stats-page");
  return { default: mod.AdminStatsPage };
});

const AdminCreatorRewardsPage = lazyWithReload(async () => {
  const mod = await import("./routes/admin-creator-rewards-page");
  return { default: mod.AdminCreatorRewardsPage };
});

const AccountPage = lazyWithReload(async () => {
  const mod = await import("./routes/account-page");
  return { default: mod.AccountPage };
});

const MyDraftsPage = lazyWithReload(async () => {
  const mod = await import("./routes/my-drafts-page");
  return { default: mod.MyDraftsPage };
});

const GamesPage = lazyWithReload(async () => {
  const mod = await import("./routes/games-page");
  return { default: mod.GamesPage };
});

const GameViewPage = lazyWithReload(async () => {
  const mod = await import("./routes/game-view-page");
  return { default: mod.GameViewPage };
});

const MyGamesPage = lazyWithReload(async () => {
  const mod = await import("./routes/my-games-page");
  return { default: mod.MyGamesPage };
});

const MyGameCreatePage = lazyWithReload(async () => {
  const mod = await import("./routes/my-game-create-page");
  return { default: mod.MyGameCreatePage };
});

const MyGameEditPage = lazyWithReload(async () => {
  const mod = await import("./routes/my-game-edit-page");
  return { default: mod.MyGameEditPage };
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

const worldCharacterEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/character/$characterId/edit",
  component: WorldCharacterEditPage,
});

const createCharacterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/create",
  validateSearch: (search: Record<string, unknown>): { draftId?: string } =>
    typeof search.draftId === "string" && search.draftId.length > 0
      ? { draftId: search.draftId }
      : {},
  component: CreateCharacterPage,
});

const myCharactersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-characters",
  component: MyCharactersPage,
});

const communityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/community",
  component: CommunityCharactersPage,
});

const communityCharacterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/community/$id",
  component: CommunityCharacterPage,
});

const myCharacterCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-characters/new",
  validateSearch: (search: Record<string, unknown>): { draftId?: string } =>
    typeof search.draftId === "string" && search.draftId.length > 0
      ? { draftId: search.draftId }
      : {},
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

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  component: AccountPage,
});

const myDraftsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-drafts",
  component: MyDraftsPage,
});

const gamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games",
  component: GamesPage,
});

const gameViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/games/$gameId",
  component: GameViewPage,
});

const myGamesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-games",
  component: MyGamesPage,
});

const myGameCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-games/new",
  validateSearch: (search: Record<string, unknown>): { jobId?: string } =>
    typeof search.jobId === "string" && search.jobId.length > 0
      ? { jobId: search.jobId }
      : {},
  component: MyGameCreatePage,
});

const myGameEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-games/$id",
  component: MyGameEditPage,
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

const adminCreatorRewardsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/admin/creator-rewards",
  component: AdminCreatorRewardsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  characterRoute,
  characterDiffRoute,
  worldCharacterEditRoute,
  createCharacterRoute,
  myCharactersRoute,
  communityRoute,
  communityCharacterRoute,
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
    adminCreatorRewardsRoute,
  ]),
  watchlistRoute,
  searchRoute,
  accountRoute,
  myDraftsRoute,
  gamesRoute,
  gameViewRoute,
  myGamesRoute,
  myGameCreateRoute,
  myGameEditRoute,
]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: WikiNotFound,
  // TanStack Router 默认不做 scroll restoration：滚到角色目录第 50 张卡
  // → 点进去 → 按 back → 回到 y=0 顶部，要重新找位置。开启后路由保存 /
  // 恢复每条历史的 scrollY，back/forward 都回到原位（前向新导航仍归零）。
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
