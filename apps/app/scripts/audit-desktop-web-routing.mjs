import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(scriptDir, "..");

async function loadTypeScriptModule(relativePath) {
  const source = readFileSync(join(appDir, relativePath), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(
    transpiled.outputText,
    "utf8",
  ).toString("base64")}`;

  return import(moduleUrl);
}

const expectations = [
  {
    file: "src/features/shell/desktop-shell.tsx",
    description:
      "desktop shell records SPA navigation state, normalizes trailing-slash entry and standalone window routes, treats legacy /profile and /desktop/settings as part of the desktop profile surface, and opens the self-chat shortcut through the desktop chat workspace",
    includes: [
      'select: (state) => state.location.searchStr,',
      'import { recordAppNavigation } from "../../lib/history-back";',
      'import { normalizePathname } from "../../lib/normalize-pathname";',
      'import { buildDesktopChatThreadPath } from "../desktop/chat/desktop-chat-route-state";',
      'recordAppNavigation(`${pathname}${search}${hash}`);',
      "const normalizedPathname = normalizePathname(pathname);",
      'normalizedPathname === "/desktop/chat-window" ||',
      'normalizedPathname === "/welcome" ||',
      'normalizedPathname.startsWith("/profile") ||',
      'normalizedPathname.startsWith("/desktop/settings") ||',
      "to: buildDesktopChatThreadPath({",
      "conversationId: conversation.id,",
    ],
  },
  {
    file: "src/routes/games-page.tsx",
    description:
      "desktop games route restores query-driven selection from the raw search string, self-heals legacy and trailing-slash /games variants back to /tabs/games even when the query already matches, normalizes stale desktop return paths away from /games and /discover/games, and reuses the normalized return target inside delivered invite links",
    includes: [
      'select: (state) => state.location.searchStr,',
      'import { normalizePathname } from "../lib/normalize-pathname";',
      "const normalizedPathname = normalizePathname(pathname);",
      ">(inviteActivityFromSearch?.id ?? null);",
      'normalizedPathname === "/games" ||',
      'normalizedPathname === "/discover/games"',
      'const normalizedDesktopReturnPath =',
      'routeState.returnPath === "/games" ||',
      'routeState.returnPath === "/discover/games"',
      '"/tabs/games"',
      "activity && activity.gameId === selectedGameId",
      "setActiveInviteActivityId(null);",
      "activeInviteActivity?.gameId === selectedGameId",
      "returnPath: safeReturnPath,",
      "returnHash: safeReturnHash,",
      "const conversationPath = buildGameInvitePath(",
      'pathname === "/tabs/games"',
      'to: "/tabs/games",',
    ],
  },
  {
    file: "src/routes/mini-programs-page.tsx",
    description:
      "desktop mini programs route restores query-driven selection from the raw search string, scopes group relay context to the group relay workspace, self-heals legacy and trailing-slash /mini-programs variants back to /tabs/mini-programs, normalizes stale desktop return paths away from /discover/mini-programs, and routes desktop group-relay returns back through /tabs/chat",
    includes: [
      'select: (state) => state.location.searchStr,',
      'import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";',
      'import { normalizePathname } from "../lib/normalize-pathname";',
      "const normalizedPathname = normalizePathname(pathname);",
      'normalizedPathname === "/mini-programs" ||',
      'normalizedPathname === "/discover/mini-programs"',
      'const normalizedDesktopReturnPath =',
      'routeState.returnPath === "/discover/mini-programs"',
      '"/tabs/mini-programs"',
      'selectedMiniProgramId === "group-relay" ? groupRelayLaunchContext : null;',
      "sourceGroupId: activeLaunchContext?.sourceGroupId,",
      'miniProgramId === "group-relay" ? groupRelayLaunchContext : null;',
      "returnPath: safeReturnPath,",
      "returnHash: safeReturnHash,",
      'pathname === "/tabs/mini-programs"',
      'to: "/tabs/mini-programs",',
      "to: buildDesktopChatThreadPath({",
      "conversationId: activeLaunchContext.sourceGroupId,",
    ],
  },
  {
    file: "src/routes/discover-feed-page.tsx",
    description:
      "desktop feed route self-heals legacy /discover/feed paths back to /tabs/feed even when the selected post hash already matches the workspace state, and normalizes stale desktop return paths away from /discover/feed",
    includes: [
      'const normalizedDesktopReturnPath =',
      'routeState.returnPath === "/discover/feed"',
      '"/tabs/feed"',
      'const desktopPathMismatch = pathname !== "/tabs/feed";',
      "(!desktopPathMismatch && routeSelectedPostId === desktopSelectedPostId)",
      "returnPath: safeReturnPath,",
      "returnHash: safeReturnHash,",
      'to: "/tabs/feed",',
      "hash: buildFeedRouteHash({",
    ],
  },
  {
    file: "src/routes/discover-page.tsx",
    description:
      "desktop discover route self-heals legacy and trailing-slash /discover paths back to /tabs/discover and executes shake encounters directly inside the desktop workspace instead of routing through /discover/encounter",
    includes: [
      'import { normalizePathname } from "../lib/normalize-pathname";',
      'const desktopDiscoverPath = "/tabs/discover";',
      "const normalizedPathname = normalizePathname(pathname);",
      "const desktopPathMismatch =",
      "normalizedPathname !== desktopDiscoverPath;",
      "if (!desktopPathMismatch) {",
      "to: desktopDiscoverPath,",
      "hash: hash || undefined,",
      "replace: true,",
      "const shakeMutation = useMutation({",
      "const preview = await shake(undefined, baseUrl);",
      "await keepShakeSession(preview.id, baseUrl);",
      'setSuccessNotice("随机相遇已写入通讯录。");',
      "onClick={() => shakeMutation.mutate()}",
      "disabled={shakeMutation.isPending}",
    ],
  },
  {
    file: "src/routes/discover-encounter-page.tsx",
    description:
      "legacy desktop /discover/encounter redirects preserve the current hash when they fold back into /tabs/discover",
    includes: [
      "useRouterState",
      'to: "/tabs/discover",',
      "hash: hash || undefined,",
      "replace: true,",
    ],
  },
  {
    file: "src/routes/discover-scene-page.tsx",
    description:
      "legacy desktop /discover/scene redirects preserve the current hash when they fold back into /tabs/discover",
    includes: [
      "useRouterState",
      'to: "/tabs/discover",',
      "hash: hash || undefined,",
      "replace: true,",
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-chat-details-panel.tsx",
    description:
      "desktop chat details carries group-qr source context, sends pending-friend shortcuts to the desktop new-friends pane, preserves desktop return hashes for chat/group background and group qr pages, and opens common groups through the desktop chat workspace",
    includes: [
      'import { buildGroupInviteReturnSearch } from "../../../lib/group-invite-delivery";',
      'import { buildMobileChatRouteHash } from "../../chat/mobile-chat-route-state";',
      'import { buildMobileGroupRouteHash } from "../../chat/mobile-group-route-state";',
      'import { buildDesktopContactsRouteHash } from "../../contacts/contacts-route-state";',
      'to: "/tabs/contacts",',
      'pane: "new-friends",',
      'to: "/chat/$conversationId/background",',
      'to: "/group/$groupId/background",',
      "search: buildGroupInviteReturnSearch({",
      "hash: buildMobileGroupRouteHash({",
      "hash: buildMobileChatRouteHash({",
      'returnPath: "/tabs/chat",',
      'panel: "details",',
      "conversationPath: `/group/${conversation.id}`,",
      "to: buildDesktopChatThreadPath({",
    ],
  },
  {
    file: "src/routes/group-qr-page.tsx",
    description:
      "group qr page reads source conversation query params from the raw search string and routes desktop conversation and details returns back through /tabs/chat",
    includes: [
      'select: (state) => state.location.searchStr',
      "const params = new URLSearchParams(search);",
      'import {',
      "buildDesktopChatRouteHash,",
      'const conversationPath = params.get("from")?.trim();',
      'const fromPath = params.get("from")?.trim();',
      "const desktopDetailsFallbackHash = useMemo(",
      "const conversationDesktopPathMap = useMemo(",
      "buildDesktopChatThreadPathFromConversationPath(conversationPath)",
      'to: safeReturnPath ?? "/tabs/chat",',
      "to: buildConversationOpenPath(",
      "to: resolveConversationOpenPath(",
    ],
  },
  {
    file: "src/features/desktop/contacts/desktop-add-friend-workspace.tsx",
    description:
      "desktop add-friend workspace syncs the selected search result back to the route hash, routes new-friends shortcuts straight to the desktop contacts pane, repairs stale openCompose entries, and opens created chats through /tabs/chat",
    includes: [
      'import { buildDesktopContactsRouteHash } from "../../contacts/contacts-route-state";',
      'if (!routeState.openCompose || loading) {',
      'if (routeState.openCompose) {',
      'pane: "new-friends",',
      'to: "/tabs/contacts",',
      'to: "/desktop/add-friend",',
      "characterId: selectedCharacterId ?? undefined,",
      "selectedResult?.character.id ??",
      "recommendationId: routeState.recommendationId,",
      "to: buildDesktopChatThreadPath({",
    ],
  },
  {
    file: "src/features/desktop/contacts/desktop-contacts-tags-pane.tsx",
    description:
      "desktop contact tags open direct chats and common groups through the desktop chat workspace",
    includes: [
      "to: buildDesktopChatThreadPath({",
      "conversationId: conversation.id,",
      "conversationId: groupId,",
    ],
  },
  {
    file: "src/routes/contacts-page.tsx",
    description:
      "desktop contacts direct-message, groups pane, and contact common-groups entry keep chat opens on the desktop chat workspace instead of legacy /chat and /group routes",
    includes: [
      "buildDesktopChatRouteHash,",
      'buildDesktopChatThreadPath,',
      "to: isDesktopLayout",
      "params: isDesktopLayout",
      'to: buildDesktopChatThreadPath({',
      "conversationId: conversation.id,",
      "conversationId: groupId,",
      'to: "/tabs/chat",',
      'panel: "details",',
      "commonGroups={commonGroups}",
    ],
  },
  {
    file: "src/routes/character-detail-page.tsx",
    description:
      "desktop character detail keeps pending-friend shortcuts in the desktop new-friends pane and keeps start-chat, direct-call, and common-group opens on the desktop chat workspace instead of legacy /chat and /group routes",
    includes: [
      'import { buildDesktopContactsRouteHash } from "../features/contacts/contacts-route-state";',
      "buildDesktopChatRouteHash,",
      "buildDesktopChatThreadPath,",
      "to: isDesktopLayout",
      'to: "/tabs/contacts",',
      'pane: "new-friends",',
      "params: isDesktopLayout",
      "hash: isDesktopLayout",
      "callAction: result.kind,",
      "conversationId: conversation.id,",
      "conversationId: groupId,",
      "conversationId: firstGroup.id,",
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-chat-route-state.ts",
    description:
      "desktop chat route state carries a one-shot callAction flag so desktop workspaces can open call panels without routing through legacy call pages",
    includes: [
      'export type DesktopChatCallAction = "voice" | "video";',
      "callAction?: DesktopChatCallAction;",
      'const callAction = params.get("callAction")?.trim();',
      "callAction: normalizedOfficialView ? undefined : normalizedCallAction,",
      'params.set("callAction", state.callAction);',
    ],
  },
  {
    file: "src/features/chat/chat-tab-shell.tsx",
    description:
      "desktop chat tab shell forwards the one-shot callAction flag from /tabs/chat into the desktop chat workspace",
    includes: [
      "selectedCallAction={",
      "routeState.officialView ? undefined : routeState.callAction",
    ],
  },
  {
    file: "src/features/chat/chat-route-redirect-shell.tsx",
    description:
      "desktop chat route redirect shell forwards both one-shot callAction requests and legacy highlighted message ids so old chat/group compat routes reopen the intended desktop thread state instead of dropping message focus on the redirect",
    includes: [
      'type DesktopChatCallAction,',
      'const LEGACY_HIGHLIGHT_HASH_PREFIX = "chat-message-";',
      "function parseLegacyHighlightedMessageId(hash: string) {",
      "const highlightedMessageId = parseLegacyHighlightedMessageId(hash);",
      "callAction?: DesktopChatCallAction;",
      "messageId: highlightedMessageId,",
      "callAction,",
      "callAction,",
      "buildDesktopChatRouteHash({",
    ],
  },
  {
    file: "src/routes/chat-voice-call-page.tsx",
    description:
      "legacy direct voice-call route forwards callAction=voice into the desktop chat workspace instead of dropping the user on a plain thread view",
    includes: [
      "<DesktopChatRouteRedirectShell",
      'callAction="voice"',
    ],
  },
  {
    file: "src/routes/chat-video-call-page.tsx",
    description:
      "legacy direct video-call route forwards callAction=video into the desktop chat workspace instead of dropping the user on a plain thread view",
    includes: [
      "<DesktopChatRouteRedirectShell",
      'callAction="video"',
    ],
  },
  {
    file: "src/routes/group-voice-call-page.tsx",
    description:
      "legacy group voice-call route forwards callAction=voice into the desktop chat workspace instead of dropping the user on a plain thread view",
    includes: [
      "<DesktopChatRouteRedirectShell",
      'callAction="voice"',
    ],
  },
  {
    file: "src/routes/group-video-call-page.tsx",
    description:
      "legacy group video-call route forwards callAction=video into the desktop chat workspace instead of dropping the user on a plain thread view",
    includes: [
      "<DesktopChatRouteRedirectShell",
      'callAction="video"',
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-chat-workspace.tsx",
    description:
      "desktop chat workspace consumes route-level callAction requests, clears the one-shot flag, and hands desktop call requests to the active thread panel",
    includes: [
      "selectedCallAction?: DesktopChatCallAction;",
      "const [desktopCallRequest, setDesktopCallRequest] = useState<{",
      'const requestKey = `${selectedConversationId}:${selectedCallAction}`;',
      "kind: selectedCallAction,",
      "desktopCallRequest={",
      "onDesktopCallRequestHandled={(token) => {",
    ],
  },
  {
    file: "src/features/chat/conversation-thread-panel.tsx",
    description:
      "desktop direct chat thread consumes one-shot desktop call requests from the workspace and opens the in-thread desktop call panel",
    includes: [
      "desktopCallRequest?: {",
      "onDesktopCallRequestHandled?: (token: number) => void;",
      "handledDesktopCallRequestTokenRef.current === desktopCallRequest.token",
      "handleDesktopCallAction(desktopCallRequest.kind);",
    ],
  },
  {
    file: "src/features/chat/group-chat-thread-panel.tsx",
    description:
      "desktop group chat thread consumes one-shot desktop call requests from the workspace and opens the in-thread desktop group call panel",
    includes: [
      "desktopCallRequest?: {",
      "onDesktopCallRequestHandled?: (token: number) => void;",
      "handledDesktopCallRequestTokenRef.current === desktopCallRequest.token",
      "handleDesktopCallAction(desktopCallRequest.kind);",
    ],
  },
  {
    file: "src/routes/create-group-page.tsx",
    description:
      "desktop create-group route keeps desktop dialog close and post-create flows on desktop chat or contacts workspaces instead of legacy /chat, /group, and /contacts/groups routes",
    includes: [
      "buildDesktopChatRouteHash,",
      "buildDesktopChatThreadPath,",
      "buildDesktopContactsRouteHash",
      'to: "/tabs/chat",',
      'panel: "details",',
      'to: "/tabs/contacts",',
      'pane: "groups",',
      'to: buildDesktopChatThreadPath({',
      "conversationId: routeState.conversationId,",
      "conversationId: groupId,",
      "replace: true,",
    ],
  },
  {
    file: "src/routes/chat-background-page.tsx",
    description:
      "desktop chat background returns to the desktop chat details sidebar through /tabs/chat instead of legacy /chat details routes",
    includes: [
      'import { buildDesktopChatRouteHash } from "../features/desktop/chat/desktop-chat-route-state";',
      "const desktopDetailsFallbackHash = useMemo(",
      'to: safeReturnPath ?? "/tabs/chat",',
      'panel: "details",',
      "conversationId,",
    ],
  },
  {
    file: "src/routes/group-chat-background-page.tsx",
    description:
      "desktop group background returns to the desktop chat details sidebar through /tabs/chat instead of legacy /group details routes",
    includes: [
      'import { buildDesktopChatRouteHash } from "../features/desktop/chat/desktop-chat-route-state";',
      "const desktopDetailsFallbackHash = useMemo(",
      'to: safeReturnPath ?? "/tabs/chat",',
      'panel: "details",',
      "conversationId: groupId,",
    ],
  },
  {
    file: "src/features/chat/mobile-ai-call-screen.tsx",
    description:
      "desktop ai call screen routes its desktop fallback actions back through the desktop chat workspace instead of legacy /chat routes",
    includes: [
      'import {',
      "buildDesktopChatRouteHash,",
      "buildDesktopChatThreadPath,",
      "const desktopThreadPath = useMemo(",
      "const desktopDetailsHash = useMemo(",
      "if (isDesktopLayout) {",
      "to: desktopThreadPath,",
      'to: "/tabs/chat",',
      'panel: "details",',
      "conversationId: resolvedConversationId,",
    ],
  },
  {
    file: "src/features/chat/mobile-group-call-screen.tsx",
    description:
      "desktop group call screen routes its desktop fallback actions back through the desktop chat workspace instead of legacy /group routes",
    includes: [
      'import {',
      "buildDesktopChatRouteHash,",
      "buildDesktopChatThreadPath,",
      "const desktopThreadPath = useMemo(",
      "const desktopDetailsHash = useMemo(",
      "if (isDesktopLayout) {",
      "to: desktopThreadPath,",
      'to: "/tabs/chat",',
      'panel: "details",',
      "conversationId: resolvedGroupId,",
    ],
  },
  {
    file: "src/features/chat/group-chat-thread-panel.tsx",
    description:
      "desktop group chat thread opens the announcement shortcut through the desktop details sidebar instead of the legacy /group announcement route",
    includes: [
      "buildDesktopChatRouteHash,",
      "if (onOpenDesktopAnnouncementDetails) {",
      'to: "/tabs/chat",',
      'panel: "details",',
      'detailsAction: "announcement",',
      "conversationId: groupId,",
    ],
  },
  {
    file: "src/components/chat-message-list.tsx",
    description:
      "desktop chat message contact cards open existing friend conversations through the desktop chat workspace instead of legacy /chat routes",
    includes: [
      'import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";',
      'if (variant === "desktop") {',
      'if (attachment.recommendationMetadata?.relationshipState === "friend") {',
      "markFollowupRecommendationChatStarted(",
      "to: buildDesktopChatThreadPath({",
      "conversationId: conversation.id,",
      'to: "/desktop/add-friend",',
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-message-avatar-popover.tsx",
    description:
      "desktop message avatar popover opens chats through the desktop chat workspace instead of legacy /chat routes",
    includes: [
      "buildDesktopChatThreadPath({",
      "conversationId: conversation.id,",
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-create-group-dialog.tsx",
    description:
      "desktop create-group dialog falls back to the desktop chat workspace after creating a group",
    includes: [
      "buildDesktopChatThreadPath({",
      "conversationId: group.id,",
    ],
  },
  {
    file: "src/routes/desktop-chat-history-page.tsx",
    description:
      "desktop chat history syncs the route-selected conversation without fighting fallback selection and locates messages back through the desktop chat workspace",
    includes: [
      "const nextRouteConversationId = routeState.conversationId ?? null;",
      "current === nextRouteConversationId ? current : nextRouteConversationId,",
      "setSelectedConversationId(conversations[0].id);",
      "to: buildDesktopChatThreadPath({",
      'to: "/desktop/chat-history",',
    ],
  },
  {
    file: "src/routes/chat-room-page.tsx",
    description:
      "desktop legacy direct-chat routes self-heal to /tabs/chat hashes instead of lingering on /chat/$conversationId, desktop game-invite notices normalize old /games and /discover/games returns back to /tabs/games, and mobile-only shortcut search cleanup stays off in desktop layout",
    includes: [
      'import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";',
      'import {',
      "normalizeDesktopGameInviteReturnPath,",
      "const safeRouteContext = routeContext",
      "}, [conversationId, search]);",
      "if (isDesktopLayout) {",
      "to: buildDesktopChatThreadPath({",
      "conversationId,",
      "messageId: highlightedMessageId ?? undefined,",
      "!activeConversation ||",
      'to: "/group/$groupId",',
      "if (isDesktopLayout) {",
      'to: "/chat/$conversationId",',
    ],
  },
  {
    file: "src/routes/chat-list-page.tsx",
    description:
      "desktop legacy and trailing-slash /chat list routes self-heal back to /tabs/chat instead of leaving the desktop workspace mounted on the old mobile path",
    includes: [
      "const pathname = useRouterState({",
      'import { normalizePathname } from "../lib/normalize-pathname";',
      "const normalizedPathname = normalizePathname(pathname);",
      'const desktopPathMismatch = normalizedPathname !== "/tabs/chat";',
      "if (!isDesktopLayout || !desktopPathMismatch) {",
      'to: "/tabs/chat",',
      "hash: hash || undefined,",
      "replace: true,",
      "<DesktopChatWorkspace hash={hash} />",
      'const isActiveTab = normalizedPathname === "/tabs/chat";',
    ],
  },
  {
    file: "src/routes/contacts-page.tsx",
    description:
      "desktop legacy and trailing-slash /contacts routes self-heal back to /tabs/contacts instead of leaving the desktop contacts workspace mounted on the old mobile path",
    includes: [
      'import { normalizePathname } from "../lib/normalize-pathname";',
      'const desktopContactsPath = "/tabs/contacts";',
      "const normalizedPathname = normalizePathname(pathname);",
      "const desktopPathMismatch =",
      "normalizedPathname !== desktopContactsPath;",
      "if (!desktopPathMismatch) {",
      "to: desktopContactsPath,",
      "hash: hash || undefined,",
      "replace: true,",
      "to: \"/tabs/contacts\",",
    ],
  },
  {
    file: "src/routes/profile-page.tsx",
    description:
      "desktop profile page self-heals legacy and trailing-slash /profile paths back to /tabs/profile and its settings entries stop reviving the old /profile/settings path",
    includes: [
      'import { useEffect } from "react";',
      "useRouterState",
      'import { useDesktopLayout } from "../features/shell/use-desktop-layout";',
      'import { normalizePathname } from "../lib/normalize-pathname";',
      'const desktopProfilePath = "/tabs/profile";',
      "const normalizedPathname = normalizePathname(pathname);",
      "const desktopPathMismatch =",
      "normalizedPathname !== desktopProfilePath;",
      "if (!desktopPathMismatch) {",
      "to: desktopProfilePath,",
      "search: search || undefined,",
      "hash: hash || undefined,",
      "replace: true,",
      "const settingsPath = isDesktopLayout ? \"/desktop/settings\" : \"/profile/settings\";",
      "void navigate({ to: settingsPath });",
      "to={settingsPath as never}",
      "to={settingsPath}",
    ],
  },
  {
    file: "src/routes/profile-settings-page.tsx",
    description:
      "desktop profile settings self-heal legacy /profile/settings paths back to /desktop/settings so the desktop toolbar keeps the correct return protocol",
    includes: [
      'const desktopSettingsPath = "/desktop/settings";',
      "const desktopPathMismatch = desktopMode && pathname !== desktopSettingsPath;",
      "if (!desktopPathMismatch) {",
      "to: desktopSettingsPath,",
      "replace: true,",
      'title={desktopSettingsRoute ? "设置" : "资料与设置"}',
      "{desktopBackLabel}",
    ],
  },
  {
    file: "src/components/mobile-document-shell.tsx",
    description:
      "shared legal document pages send desktop fallback returns back to /desktop/settings instead of reviving the legacy mobile settings path",
    includes: [
      'import { useDesktopLayout } from "../features/shell/use-desktop-layout";',
      "const isDesktopLayout = useDesktopLayout();",
      'to: isDesktopLayout ? "/desktop/settings" : "/profile/settings",',
    ],
  },
  {
    file: "src/routes/group-chat-page.tsx",
    description:
      "desktop legacy group-chat routes self-heal to /tabs/chat hashes instead of lingering on /group/$groupId, and desktop group-chat game-invite notices normalize old /games and /discover/games returns back to /tabs/games while mobile-only shortcut search cleanup stays off in desktop layout",
    includes: [
      'import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";',
      'import {',
      "normalizeDesktopGameInviteReturnPath,",
      "resolveGameInviteRouteContext,",
      "const safeRouteContext = routeContext",
      "returnPath: normalizeDesktopGameInviteReturnPath(",
      "if (isDesktopLayout) {",
      "to: buildDesktopChatThreadPath({",
      "conversationId: groupId,",
      "messageId: highlightedMessageId ?? undefined,",
      "resolveGameInviteRouteContext(window.location.search) ??",
      "}, [groupId, search]);",
      'to: "/group/$groupId",',
      "if (isDesktopLayout) {",
    ],
  },
  {
    file: "src/features/official-accounts/official-message-workspace-shell.tsx",
    description:
      "desktop legacy official-message routes self-heal to /tabs/chat officialView hashes and only preserve articleId when the incoming hash already belongs to the same official view",
    includes: [
      'import { RouteRedirectState } from "../../components/route-redirect-state";',
      "buildDesktopOfficialServiceThreadPath,",
      "buildDesktopSubscriptionInboxPath,",
      "resolveDesktopServiceMessageArticleId,",
      "resolveDesktopSubscriptionMessageArticleId,",
      "const safeServiceArticleId = useMemo(",
      "resolveDesktopServiceMessageArticleId(",
      "const safeSubscriptionArticleId = useMemo(",
      "resolveDesktopSubscriptionMessageArticleId(routeState)",
      "const targetPath = useMemo(() => {",
      "accountId: selectedServiceAccountId,",
      'selectedSpecialView === "subscription-inbox"',
      "articleId: safeServiceArticleId,",
      "articleId: safeSubscriptionArticleId,",
      "to: targetPath,",
      "replace: true,",
    ],
  },
  {
    file: "src/features/search/desktop-search-launcher.tsx",
    description:
      "desktop search launcher opens conversation and official-account suggestions through desktop workspace routes, normalizes legacy favorite quick links, and sends desktop character-detail, moments, friend-moments, feed, channels, games, and mini-program opens back through /tabs/search",
    includes: [
      "applyDesktopSearchReturnContext,",
      'import { buildDesktopContactsRouteHash } from "../contacts/contacts-route-state";',
      'import { buildDesktopChatThreadPath } from "../desktop/chat/desktop-chat-route-state";',
      "const applyDesktopSearchReturn = useCallback(",
      "return applyDesktopSearchReturnContext(",
      "resolveSearchNavigationTarget(item, {",
      "desktopLayout: true,",
      "const handleOpenCharacterDetail = useCallback(",
      "to: `/character/${characterId}`,",
      "to: buildDesktopChatThreadPath({",
      "messageId: message.messageId,",
      'pane: "official-accounts",',
      "to: buildDesktopOfficialAccountSearchPath(",
    ],
  },
  {
    file: "src/features/search/search-navigation.ts",
    description:
      "desktop search navigation rewrites legacy /chat, /group, /chat/$conversationId/details|search|voice-call|video-call, /group/$groupId/details|search|voice-call|video-call|announcement|edit/*|members/*, /contacts, /profile, /search, /favorites, /notes, /profile/settings, /discover, /discover/encounter, /discover/scene, /moments, /moments/friend/$characterId, /discover/moments, /discover/moments/publish, /feed, /games, /discover/games, /discover/feed, /mini-programs, /discover/mini-programs, /channels, /discover/channels, /channels/authors/$authorId, contact-directory, and official-account quick-link targets including the old /official-accounts root to desktop workspace routes while preserving legacy desktop hash/search context and legacy mobile behavior elsewhere",
    includes: [
      'import { buildDesktopFavoritesWorkspaceRouteHash } from "../favorites/favorites-route-state";',
      "buildDesktopMomentsRouteHash,",
      "parseDesktopMomentsRouteState,",
      "buildDesktopChannelsRouteHash,",
      "parseDesktopChannelsRouteHash,",
      "buildFeedRouteHash,",
      "parseFeedRouteHash,",
      "buildMobileGamesRouteSearch,",
      "parseMobileGamesRouteSearch,",
      "buildMobileMiniProgramsRouteSearch,",
      "parseMobileMiniProgramsRouteSearch,",
      "buildDesktopContactsRouteHash,",
      "parseDesktopContactsRouteState,",
      "buildDesktopFriendMomentsPath,",
      "parseDesktopFriendMomentsRouteState,",
      'import {',
      "buildDesktopChatRouteHash,",
      "buildDesktopOfficialServiceThreadPath,",
      "buildDesktopSubscriptionInboxPath,",
      "options?: SearchNavigationOptions,",
      "resolveDesktopWorkspaceNavigationTarget(normalizedTarget)",
      "resolveDesktopConversationNavigationTarget(normalizedTarget)",
      "resolveDesktopContactsNavigationTarget(normalizedTarget)",
      "resolveDesktopDiscoverNavigationTarget(normalizedTarget)",
      "resolveDesktopFeedNavigationTarget(normalizedTarget)",
      "resolveDesktopGamesNavigationTarget(normalizedTarget)",
      "resolveDesktopMiniProgramsNavigationTarget(normalizedTarget)",
      "resolveDesktopChannelsNavigationTarget(normalizedTarget)",
      "resolveDesktopMomentsNavigationTarget(normalizedTarget)",
      "resolveDesktopOfficialNavigationTarget(normalizedTarget)",
      'target.to === "/chat"',
      'target.to === "/contacts"',
      'target.to === "/profile"',
      'to: "/tabs/profile",',
      'target.to === "/search"',
      'to: "/tabs/search",',
      'target.to === "/favorites" || target.to === "/tabs/favorites"',
      'target.to === "/notes"',
      'category: "notes",',
      'target.to === "/profile/settings"',
      'to: "/desktop/settings",',
      'to: "/tabs/chat",',
      'const detailsMatch = target.to.match(/^\\/(?:chat|group)\\/([^/?#]+)\\/details$/);',
      'const searchMatch = target.to.match(/^\\/(?:chat|group)\\/([^/?#]+)\\/search$/);',
      'const callMatch = target.to.match(',
      'const groupAnnouncementMatch = target.to.match(',
      'const groupEditMatch = target.to.match(',
      'const groupMembersMatch = target.to.match(',
      "detailsAction: \"announcement\",",
      "detailsAction:",
      'panel: "details",',
      'panel: "history",',
      'target.to !== "/discover" &&',
      'target.to !== "/tabs/discover" &&',
      'target.to !== "/discover/encounter" &&',
      'target.to !== "/discover/scene"',
      'to: "/tabs/discover",',
      "hash: target.hash,",
      'target.to === "/moments" ||',
      'target.to === "/moments" ||',
      'target.to === "/discover/moments" ||',
      'target.to === "/tabs/moments"',
      'target.to === "/discover/moments/publish"',
      "parseMobileMomentsPublishRouteState",
      'to: "/tabs/moments",',
      'const friendMomentsMatch = target.to.match(',
      'friend-moments|moments\\/friend',
      'target.to !== "/feed" &&',
      'target.to !== "/feed" &&',
      'target.to !== "/discover/feed" &&',
      'target.to !== "/tabs/feed"',
      'to: "/tabs/feed",',
      'target.to !== "/games" &&',
      'target.to !== "/discover/games" &&',
      'target.to !== "/tabs/games"',
      'to: "/tabs/games",',
      'target.to !== "/mini-programs" &&',
      'target.to !== "/mini-programs" &&',
      'target.to !== "/discover/mini-programs" &&',
      'target.to !== "/tabs/mini-programs"',
      'to: "/tabs/mini-programs",',
      'const authorMatch = target.to.match(/^\\/channels\\/authors\\/',
      'target.to !== "/channels" &&',
      'target.to !== "/channels" &&',
      'target.to !== "/discover/channels" &&',
      'target.to !== "/tabs/channels"',
      'to: "/tabs/channels",',
      'target.to === "/friend-requests"',
      'target.to === "/contacts/starred"',
      'target.to === "/contacts/tags"',
      'target.to === "/contacts/groups"',
      'target.to === "/contacts/world-characters"',
      'pane: "new-friends",',
      'pane: "starred-friends",',
      'pane: "tags",',
      'pane: "groups",',
      'pane: "world-character",',
      "showWorldCharacters: true,",
      'target.to === "/chat/subscription-inbox"',
      'target.to === "/contacts/official-accounts"',
      'target.to === "/official-accounts"',
      'pane: "official-accounts",',
      '(routeState.officialMode ??',
      '(hasAccountSelection ? "accounts" : "feed"))',
      "const highlightedMessageId = parseLegacyHighlightedMessageId(target.hash);",
      "messageId: highlightedMessageId,",
    ],
  },
  {
    file: "src/features/search/search-navigation.ts",
    description:
      "desktop search navigation can also attach /tabs/search return context to desktop character-detail, moments, friend-moments, feed, channels, games, mini-program, chat/group background, group-qr, and create-group targets so desktop search surfaces return to the active search workspace",
    includes: [
      'import {',
      "buildMobileChatRouteHash,",
      "parseMobileChatRouteState,",
      "buildMobileGroupRouteHash,",
      "parseMobileGroupRouteState,",
      "buildCreateGroupRouteHash,",
      "parseCreateGroupRouteHash,",
      "buildCharacterDetailRouteHash,",
      "parseCharacterDetailRouteState,",
      'const DESKTOP_SEARCH_PATH = "/tabs/search";',
      "export function applyDesktopSearchReturnContext(",
      'target.to.startsWith("/character/")',
      'target.to === "/tabs/moments"',
      'const friendMomentsMatch = target.to.match(/^\\/desktop\\/friend-moments\\/',
      'target.to === "/tabs/feed"',
      'target.to === "/tabs/channels"',
      'target.to === "/tabs/games"',
      'target.to === "/tabs/mini-programs"',
      'const chatBackgroundMatch = target.to.match(',
      'parseMobileChatRouteState(target.hash ?? "")',
      "buildMobileChatRouteHash({",
      'const groupToolsMatch = target.to.match(/^\\/group\\/([^/?#]+)\\/(background|qr)$/);',
      'parseMobileGroupRouteState(target.hash ?? "")',
      "buildMobileGroupRouteHash({",
      'target.to === "/group/new"',
      "parseCreateGroupRouteHash(target.hash ?? \"\")",
      "seedMemberIds: targetRouteState.seedMemberIds,",
      "returnPath: DESKTOP_SEARCH_PATH,",
    ],
  },
  {
    file: "src/features/search/search-navigation.ts",
    description:
      "desktop search navigation preserves desktop pane selection when it rewrites legacy /contacts/*, /contacts/official-accounts, /official-accounts, /official-accounts/$accountId, and /official-accounts/articles/$articleId targets from saved search/favorite links, and it infers officialMode=accounts when a legacy official-accounts hash already carries account/article selection",
    includes: [
      "const routeState = parseDesktopContactsRouteState(target.hash ?? \"\");",
      'target.to === "/contacts/starred"',
      'routeState.pane === "starred-friends"',
      'target.to === "/contacts/tags"',
      'routeState.pane === "tags" ? routeState.tag : undefined',
      'target.to === "/contacts/groups"',
      'routeState.pane === "groups" ? routeState.characterId : undefined',
      'target.to === "/contacts/world-characters"',
      'routeState.pane === "world-character"',
      'target.to === "/contacts/official-accounts"',
      'target.to === "/official-accounts"',
      'routeState.pane === "official-accounts"',
      "routeState.accountId",
      "routeState.articleId",
      "const hasAccountSelection = Boolean(",
      "(hasAccountSelection ? \"accounts\" : \"feed\")",
      "const accountMatch = target.to.match(/^\\/official-accounts\\/",
      "routeState.accountId === accountId",
      "const articleMatch = target.to.match(",
      "routeState.articleId === articleId",
    ],
  },
  {
    file: "src/features/search/search-navigation.ts",
    description:
      "desktop search navigation preserves articleId for legacy subscription/service targets only when the incoming hash already belongs to the same official view",
    includes: [
      "parseDesktopOfficialMessageRouteHash,",
      "resolveDesktopServiceMessageArticleId,",
      "resolveDesktopSubscriptionMessageArticleId,",
      'target.to === "/chat/subscription-inbox"',
      'const routeState = parseDesktopOfficialMessageRouteHash(target.hash ?? "");',
      "buildDesktopSubscriptionInboxPath({",
      "articleId: resolveDesktopSubscriptionMessageArticleId(routeState),",
      "buildDesktopOfficialServiceThreadPath({",
      "articleId: resolveDesktopServiceMessageArticleId(",
    ],
  },
  {
    file: "src/routes/search-page.tsx",
    description:
      "desktop search page passes desktopLayout-aware normalization into quick-link and result navigation so legacy favorite routes open directly in desktop workspaces, applies shared /tabs/search return context to desktop character-detail, moments, friend-moments, feed, channels, games, mini-program, chat/group background, group-qr, and create-group opens, and self-heals legacy and trailing-slash /search paths back to /tabs/search even when the hash already matches",
    includes: [
      "applyDesktopSearchReturnContext,",
      "resolveSearchNavigationTarget(item, {",
      "desktopLayout: isDesktopLayout,",
      "function applySearchNavigationContext(",
      "return applyDesktopSearchReturnContext(",
      "const navigationTarget = applySearchNavigationContext(",
      'import { normalizePathname } from "../lib/normalize-pathname";',
      "const normalizedPathname = normalizePathname(pathname);",
      'const desktopPathMismatch =',
      "isDesktopLayout && normalizedPathname !== desktopSearchPath;",
      "if (syncingRouteStateRef.current && !desktopPathMismatch) {",
      "if (!desktopPathMismatch && normalizedHash === (nextHash ?? \"\")) {",
    ],
  },
  {
    file: "src/features/search/use-search-index.ts",
    description:
      "desktop search index emits /tabs/chat and desktop official-account workspace routes while preserving mobile search targets on non-desktop layouts",
    includes: [
      'import { buildDesktopContactsRouteHash } from "../contacts/contacts-route-state";',
      'import { buildDesktopChatThreadPath } from "../desktop/chat/desktop-chat-route-state";',
      "to: isDesktopLayout",
      "hash: isDesktopLayout ? undefined : `chat-message-${message.messageId}`",
      "buildDesktopOfficialAccountSearchPath(account.id)",
      "buildDesktopOfficialAccountSearchPath(account.id, article.id)",
    ],
  },
  {
    file: "src/routes/desktop-chat-files-page.tsx",
    description:
      "desktop chat files syncs the route-selected conversation without fighting fallback selection",
    includes: [
      "const nextRouteConversationId = routeState.conversationId ?? null;",
      "current === nextRouteConversationId ? current : nextRouteConversationId,",
      "if (selectedConversationId !== null) {",
      'to: "/desktop/chat-files",',
    ],
  },
  {
    file: "src/routes/desktop-chat-image-viewer-page.tsx",
    description:
      "desktop chat image viewer syncs the active session item back to the route hash when the requested image is stale",
    includes: [
      "if (!routeState || !activeItem || !sessionItems.length) {",
      "imageUrl: activeItem.imageUrl,",
      "activeId: activeItem.id,",
      'to: "/desktop/chat-image-viewer",',
    ],
  },
  {
    file: "src/features/chat/chat-image-viewer-route-state.ts",
    description:
      "desktop chat image viewer reuses one standalone window per image session and uses the same stable label for browser popup reuse",
    includes: [
      "input.sessionId?.trim() ||",
      "const existingSession = sessions.find((session) =>",
      "hasSameDesktopChatImageViewerSessionShape(session.items, normalizedItems)",
      "const windowLabel = buildDesktopChatImageViewerWindowLabel({",
      "return openBrowserStandaloneWindow({",
      "...sessions.filter((session) => session.id !== nextSession.id),",
    ],
  },
  {
    file: "src/lib/desktop-window-return-target.ts",
    description:
      "desktop standalone return targets rewrite missing standalone chat-window fallbacks back to the main chat workspace",
    includes: [
      'if (basePath !== "/desktop/chat-window") {',
      "parseDesktopChatWindowRouteHash(",
      "buildDesktopChatWindowLabel(",
      "buildDesktopChatThreadPath({",
    ],
  },
  {
    file: "src/runtime/desktop-windowing.ts",
    description:
      "desktop standalone windows use stable named browser popups on desktop web instead of always opening _blank tabs",
    includes: [
      "export function openBrowserStandaloneWindow(options: {",
      "options.label.trim() || \"_blank\"",
      "openedWindow.focus();",
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-chat-window-route-state.ts",
    description:
      "desktop chat windows use the stable conversation label for browser popup reuse on desktop web",
    includes: [
      "const windowLabel = buildDesktopChatWindowLabel(input.conversationId);",
      "return openBrowserStandaloneWindow({",
      "label: windowLabel,",
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-note-window-route-state.ts",
    description:
      "desktop note windows use the stable note-window label for browser popup reuse on desktop web",
    includes: [
      "const windowLabel = buildDesktopNoteWindowLabel(routeState);",
      "return openBrowserStandaloneWindow({",
      "label: windowLabel,",
    ],
  },
  {
    file: "src/routes/desktop-chat-window-page.tsx",
    description:
      "desktop chat window rewrites stale title/type metadata to the current conversation, uses the repaired metadata for message return paths, and closes back through the shared main-window focus path",
    includes: [
      "const nextHash = buildDesktopChatWindowRouteHash({",
      "conversationType: activeConversation.type,",
      "title: activeConversation.title,",
      'to: "/desktop/chat-window",',
      "activeConversation?.title ?? routeState.title,",
      "focusMainChatWindow(fallbackPath);",
    ],
  },
  {
    file: "src/routes/desktop-mobile-page.tsx",
    description:
      "desktop mobile rewrites stale call handoff titles from the live conversation, keeps mobile handoff copies on mobile chat paths, trims query/hash and trailing slashes before classifying legacy chat/contacts/discover/discover-tool/search/favorites/moments/friend-moments/feed roots plus desktop and legacy games/channel/channel-author/mini-program histories, folds legacy contacts panes and add-friend paths into shortcuts, classifies both legacy and current desktop official/profile/settings histories into the right buckets, routes group-invite returns and desktop-open actions through /tabs/chat, opens the settings quick shortcut directly on /desktop/settings, and repairs stale official handoffs from live account/article data",
    includes: [
      'const rawPath = item.path.split(/[?#]/, 1)[0] ?? item.path;',
      "rawPath.length > 1 ? rawPath.replace(/\\/+$/, \"\") : rawPath;",
      'parseDesktopChatRouteHash(rawHash)',
      'parseDesktopContactsRouteState(rawHash)',
      'normalizedPath === "/tabs/chat"',
      'desktopChatRouteState?.officialView !== undefined',
      'normalizedPath === "/tabs/contacts"',
      'desktopContactsRouteState?.pane === "official-accounts"',
      "desktopTo?: string;",
      'desktopTo: "/desktop/settings",',
      "to={(item.desktopTo ?? item.to) as never}",
      'normalizedPath === "/chat/subscription-inbox"',
      'normalizedPath === "/contacts/official-accounts"',
      'return "official";',
      'normalizedPath === "/chat"',
      'normalizedPath === "/contacts"',
      'normalizedPath === "/friend-requests"',
      'normalizedPath === "/desktop/add-friend"',
      'normalizedPath === "/contacts/starred"',
      'normalizedPath === "/contacts/tags"',
      'normalizedPath === "/contacts/groups"',
      'normalizedPath === "/contacts/world-characters"',
      'normalizedPath === "/discover"',
      'normalizedPath === "/discover/encounter"',
      'normalizedPath === "/discover/scene"',
      'normalizedPath === "/tabs/moments"',
      'normalizedPath === "/moments"',
      'normalizedPath === "/tabs/feed"',
      'normalizedPath === "/feed"',
      'normalizedPath === "/tabs/search"',
      'normalizedPath === "/search"',
      'normalizedPath === "/tabs/favorites"',
      'normalizedPath === "/favorites"',
      'normalizedPath === "/notes"',
      'normalizedPath === "/tabs/games"',
      'normalizedPath === "/games"',
      'normalizedPath === "/tabs/channels"',
      'normalizedPath === "/channels"',
      'normalizedPath.startsWith("/channels/authors/")',
      'normalizedPath === "/tabs/mini-programs"',
      'normalizedPath === "/mini-programs"',
      'normalizedPath.startsWith("/friend-moments/")',
      'normalizedPath.startsWith("/moments/friend/")',
      'normalizedPath.startsWith("/desktop/friend-moments/")',
      'normalizedPath === "/tabs/profile"',
      'normalizedPath === "/profile"',
      'normalizedPath === "/desktop/settings"',
      'normalizedPath.startsWith("/legal/")',
      'return "shortcut";',
      "const nextHash = buildDesktopMobileCallHandoffHash({",
      "title: callHandoffConversation.title,",
      "callHandoffConversation?.title?.trim() ||",
      "const callHandoffMobilePath = callHandoffConversation",
      "const callHandoffDesktopPath = callHandoffConversation",
      "buildDesktopChatThreadPath({",
      "const conversationDesktopPathMap = useMemo(",
      "const activeGroupInviteDeliveryDesktopPath = activeGroupInviteDelivery",
      "buildDesktopChatThreadPathFromConversationPath(conversationPath)",
      "const currentGroupInviteDesktopPath = currentGroupInviteHandoff",
      "resolveGroupInviteDesktopOpenPath(currentGroupInviteHandoff.path)",
      "to={activeGroupInviteDeliveryDesktopPath as never}",
      "to={currentGroupInviteDesktopPath as never}",
      "to={resolveGroupInviteDesktopOpenPath(item.path) as never}",
      "path: callHandoffMobilePath,",
      "to={callHandoffDesktopPath as never}",
      "getOfficialAccountArticle(officialHandoffState!.articleId!, baseUrl)",
      "const resolvedOfficialHandoffState = useMemo(() => {",
      "officialHandoffArticleQuery.data.account.name,",
      'surface: "subscription",',
      "buildDesktopMobileOfficialHandoffHash(resolvedOfficialHandoffState)",
      "buildDesktopOfficialServiceThreadPath({",
      "buildDesktopSubscriptionInboxPath({",
      'to: "/desktop/mobile",',
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-chat-route-state.ts",
    description:
      "desktop chat route state exposes shared builders for service-account and subscription-inbox official-message views",
    includes: [
      "export function buildDesktopOfficialServiceThreadPath(input: {",
      'officialView: "service-account",',
      "export function buildDesktopSubscriptionInboxPath(input?: {",
      'officialView: "subscription-inbox",',
      'return hash ? `/tabs/chat#${hash}` : "/tabs/chat";',
    ],
  },
  {
    file: "src/routes/desktop-note-window-page.tsx",
    description:
      "desktop note window accepts legacy bare hashes and rewrites them to the shared note-window route format",
    includes: [
      "parseDesktopNoteEditorRouteHash(hash)",
      "const nextHash = buildDesktopNoteWindowRouteHash(routeState);",
      'to: "/desktop/note-window",',
      "hash: buildDesktopNoteWindowRouteHash({",
    ],
  },
  {
    file: "src/routes/desktop-note-window-page.tsx",
    description:
      "desktop note window missing-context fallback returns to main favorites instead of turning the standalone window into a tabs page",
    includes: [
      'onClick={() => closeStandaloneWindow("/tabs/favorites")}',
      "void focusMainDesktopWindow(targetPath).then((focused) => {",
      "window.opener.location.assign(targetPath);",
    ],
  },
  {
    file: "src/components/chat-message-list.tsx",
    description:
      "desktop note-card entry preserves the full current path, including querystring, in note-window returnTo links",
    includes: [
      'import { getCurrentWindowTargetPath } from "../runtime/desktop-windowing";',
      "returnTo:",
      "getCurrentWindowTargetPath()",
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-chat-workspace.tsx",
    description:
      "desktop chat workspace uses desktop /tabs/chat routes for conversation-list entry, reminder cards, standalone-window returns, and history message jumps, while preserving the full current path for note-window returns",
    includes: [
      "to={",
      "buildDesktopChatThreadPath({",
      "buildChatReminderNavigation(entry, {",
      "desktopLayout: true,",
      "returnTo: buildDesktopChatThreadPath({",
      "to: buildDesktopChatThreadPath({",
      'import { getCurrentWindowTargetPath } from "../../../runtime/desktop-windowing";',
      "returnTo:",
      "getCurrentWindowTargetPath()",
    ],
  },
  {
    file: "src/features/chat/chat-reminder-entries.ts",
    description:
      "chat reminder navigation supports desktop /tabs/chat message jumps while keeping the existing mobile /chat and /group routes for mobile reminder entry points",
    includes: [
      'import { buildDesktopChatRouteHash } from "./chat-route-state";',
      "options?: {",
      "desktopLayout?: boolean;",
      'to: "/tabs/chat" as const,',
      "conversationId: entry.threadId,",
      "messageId: entry.messageId,",
      'to: "/group/$groupId" as const,',
      'to: "/chat/$conversationId" as const,',
    ],
  },
  {
    file: "src/features/chat/mobile-reminder-toast-host.tsx",
    description:
      "chat reminder toasts treat trailing-slash /tabs/chat paths as the active desktop chat workspace so desktop reminders do not keep resurfacing during route self-heal",
    includes: [
      'import { normalizePathname } from "../../lib/normalize-pathname";',
      "const normalizedPathname = normalizePathname(pathname);",
      'normalizedPathname === "/tabs/chat"',
      "normalizePathname(activePath) === normalizedPathname",
    ],
  },
  {
    file: "src/features/shell/conversation-strong-reminder-host.tsx",
    description:
      "desktop strong-reminder notifications treat /tabs/chat and its trailing-slash form as the active conversation route and launch desktop /tabs/chat message targets instead of reviving legacy /chat paths",
    includes: [
      'import { normalizePathname } from "../../lib/normalize-pathname";',
      'import {',
      "buildDesktopChatThreadPath,",
      "parseDesktopChatRouteHash,",
      "const isDesktopLayout = useDesktopLayout();",
      "const normalizedPathname = normalizePathname(pathname);",
      'normalizedPathname === "/tabs/chat" &&',
      "desktopRouteState.conversationId === conversation.id",
      "route: isDesktopLayout",
      "buildDesktopChatThreadPath({",
      "messageId: message.id,",
    ],
  },
  {
    file: "src/features/shell/desktop-nav-matching.ts",
    description:
      "desktop shell nav keeps its route ownership and path-segment matching in a shared matcher that both runtime code and audits can execute, including legacy root paths before desktop pages self-heal them back into /tabs workspaces",
    includes: [
      'export type DesktopNavAction =',
      "export const desktopPrimaryNavBindings: DesktopNavRouteBinding[] = [",
      "export const desktopBottomNavBindings: DesktopNavActionBinding[] = [",
      "function normalizeDesktopNavMatchPath(value: string) {",
      "function matchesDesktopNavPath(pathname: string, match: string) {",
      "normalizedPathname === normalizedMatch ||",
      "normalizedPathname.startsWith(`${normalizedMatch}/`)",
      "item.matches?.some((prefix) => matchesDesktopNavPath(pathname, prefix))",
      "item.excludedMatches?.some((prefix) =>",
      "matchesDesktopNavPath(pathname, prefix)",
      'label: "消息",',
      '"/chat",',
      '"/chat/subscription-inbox",',
      'label: "通讯录",',
      '"/contacts",',
      '"/official-accounts",',
      'label: "收藏",',
      '"/favorites",',
      'label: "朋友圈",',
      '"/moments",',
      '"/moments/friend/",',
      '"/discover/moments/publish",',
      '"/friend-moments/",',
      'label: "广场动态",',
      '"/feed",',
      'label: "视频号",',
      '"/channels",',
      'matches: ["/tabs/channels", "/channels", "/discover/channels"],',
      'label: "搜一搜",',
      '"/search"',
      'label: "游戏中心",',
      '"/games",',
      '"/discover/games"',
      'label: "小程序面板",',
      '"/mini-programs",',
      '"/discover/mini-programs"',
      'label: "更多",',
      '"/profile/settings",',
      '"/legal/",',
      '"/desktop/channels/",',
    ],
  },
  {
    file: "src/features/shell/desktop-nav-config.ts",
    description:
      "desktop shell nav UI consumes the shared matcher bindings instead of duplicating the path ownership table in the icon config",
    includes: [
      'import {',
      'desktopBottomNavBindings,',
      'desktopPrimaryNavBindings,',
      'type DesktopNavActionBinding,',
      'type DesktopNavRouteBinding,',
      'const desktopPrimaryNavIcons: Record<',
      "desktopPrimaryNavBindings.map((item) => ({",
      'const desktopBottomNavIcons: Record<',
      "desktopBottomNavBindings.map((item) => ({",
      "export { isDesktopNavItemActive };",
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-notes-workspace.tsx",
    description:
      "desktop notes workspace keeps note-window close, missing-note, and delete fallbacks on the shared close/returnTo path, including rewriting missing standalone chat-window returns back to the main chat workspace",
    includes: [
      "if (standaloneWindow) {",
      'const fallbackPath = returnTo || "/tabs/favorites";',
      "void focusReturnTargetWindow(fallbackPath);",
      "focusStandaloneDesktopWindow,",
      "resolveDesktopWindowReturnTarget(targetPath);",
      "const nextMainWindowPath = resolvedTarget.mainWindowPath || targetPath;",
      "void handleClose();",
      "onClick={() => void handleClose()}",
      "回到来源",
    ],
  },
  {
    file: "src/routes/favorites-page.tsx",
    description:
      "desktop favorites self-heals legacy and trailing-slash /favorites paths back to /tabs/favorites, normalizes inline note-editor returnTo links onto the shared favorites workspace route, and rewrites legacy favorite open targets back into desktop workspaces",
    includes: [
      'import { normalizePathname } from "../lib/normalize-pathname";',
      'const desktopFavoritesPath = "/tabs/favorites";',
      "const normalizedPathname = normalizePathname(pathname);",
      "const desktopPathMismatch =",
      "normalizedPathname !== desktopFavoritesPath;",
      "if (!desktopPathMismatch) {",
      "to: desktopFavoritesPath,",
      "hash: hash || undefined,",
      "replace: true,",
      'import { resolveSearchNavigationTarget } from "../features/search/search-navigation";',
      "selectedFavoriteNavigationTarget",
      "resolveSearchNavigationTarget(",
      "{ desktopLayout: true },",
      "search={selectedFavoriteNavigationTarget?.search as never}",
      "hash={selectedFavoriteNavigationTarget?.hash}",
      'import { getCurrentWindowTargetPath } from "../runtime/desktop-windowing";',
      "const fallbackReturnTo =",
      "!desktopPathMismatch",
      "returnTo:",
      "getCurrentWindowTargetPath()",
      "normalizedPathname !== desktopFavoritesPath || noteEditorRouteState",
    ],
  },
  {
    file: "src/routes/notes-page.tsx",
    description:
      "desktop notes compatibility entry defaults bare /notes redirects to the favorites notes category instead of dropping into all favorites",
    includes: [
      'import { buildDesktopFavoritesWorkspaceRouteHash } from "../features/favorites/favorites-route-state";',
      'to: "/tabs/favorites",',
      "buildDesktopFavoritesWorkspaceRouteHash({",
      'category: "notes",',
    ],
  },
  {
    file: "src/routes/desktop-official-article-window-page.tsx",
    description:
      "desktop official article window rewrites stale account/title context to the current article, preserves a stable window session id, opens account-home actions through the desktop contacts workspace, and keeps related-article jumps on the shared route protocol",
    includes: [
      'import { buildDesktopContactsRouteHash } from "../features/desktop/contacts/desktop-contacts-route-state";',
      'const targetPath = `/tabs/contacts#${',
      'pane: "official-accounts",',
      "const effectiveWindowId = routeState?.windowId ?? fallbackWindowIdRef.current;",
      "const nextHash = buildDesktopOfficialArticleWindowRouteHash({",
      "accountId: article.account.id,",
      "title: article.title,",
      "windowId: effectiveWindowId,",
      "bindDesktopOfficialArticleWindow({",
      'to: "/desktop/official-article-window",',
      "title: options?.title,",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-official-article-window-route-state.ts",
    description:
      "desktop official article windows reuse the live standalone session for the currently displayed article and keep the same stable label for browser popup reuse",
    includes: [
      "readDesktopOfficialArticleWindowId(input.articleId) ||",
      "createDesktopOfficialArticleWindowId();",
      "const windowLabel = buildDesktopOfficialArticleWindowLabel(resolvedWindowId);",
      "bindDesktopOfficialArticleWindow({",
      "return openBrowserStandaloneWindow({",
      "label: windowLabel,",
    ],
  },
  {
    file: "src/routes/desktop-official-article-window-page.tsx",
    description:
      "desktop official article window returns to source standalone chat windows before falling back to the matching main chat workspace route",
    includes: [
      'import { resolveDesktopWindowReturnTarget } from "../lib/desktop-window-return-target";',
      "focusStandaloneDesktopWindow,",
      "const resolvedTarget = resolveDesktopWindowReturnTarget(targetPath);",
      "const nextMainWindowPath = resolvedTarget.mainWindowPath || targetPath;",
      "window.opener.location.assign(nextMainWindowPath);",
    ],
  },
  {
    file: "src/routes/desktop-chat-image-viewer-page.tsx",
    description:
      "desktop chat image viewer returns to source standalone chat windows before falling back to the matching main chat workspace route",
    includes: [
      'import { resolveDesktopWindowReturnTarget } from "../lib/desktop-window-return-target";',
      "focusStandaloneDesktopWindow,",
      "const resolvedTarget = resolveDesktopWindowReturnTarget(targetPath);",
      "const nextMainWindowPath = resolvedTarget.mainWindowPath || targetPath;",
      "window.opener.location.assign(nextMainWindowPath);",
    ],
  },
  {
    file: "src/lib/history-back.ts",
    description: "desktop-only route helper is available",
    includes: ['export function isDesktopOnlyPath(path?: string | null) {'],
  },
  {
    file: "src/lib/normalize-pathname.ts",
    description:
      "shared pathname normalization trims trailing slashes before desktop workspace pages and reminder surfaces compare canonical /tabs routes",
    includes: [
      "export function normalizePathname(pathname: string) {",
      "const trimmed = pathname.trim();",
      'if (!trimmed.startsWith("/")) {',
      'if (trimmed === "/") {',
      "return trimmed.replace(",
    ],
  },
  {
    file: "src/routes/mobile-moments-publish-page.tsx",
    description:
      "mobile moments publish clears returnHash when returnPath is unsafe and carries safe desktop return context into /tabs/moments when the legacy publish page is opened on desktop",
    includes: [
      'import {',
      "buildDesktopMomentsRouteHash,",
      "const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;",
      'to: "/tabs/moments",',
      "hash:",
      "buildDesktopMomentsRouteHash({",
      "returnPath: safeReturnPath,",
      "returnHash: safeReturnHash,",
    ],
  },
  {
    file: "src/features/channels/channels-route-state.ts",
    description:
      "desktop channels route state normalizes legacy /channels and /discover/channels return paths to /tabs/channels before pages or back links consume them",
    includes: [
      "function normalizeReturnPath(value?: string | null) {",
      'if (nextValue === "/channels" || nextValue === "/discover/channels") {',
      'return "/tabs/channels";',
      "const returnPath = normalizeReturnPath(params.get(\"returnPath\"));",
      "const returnPath = normalizeReturnPath(input?.returnPath);",
    ],
  },
  {
    file: "src/features/feed/feed-route-state.ts",
    description:
      "feed route state normalizes legacy /feed and /discover/feed return paths to /tabs/feed before feed pages, desktop search, or saved links reuse them",
    includes: [
      "function normalizeReturnPath(value?: string | null) {",
      'if (nextValue === "/feed" || nextValue === "/discover/feed") {',
      'return "/tabs/feed";',
      'const returnPath = normalizeReturnPath(params.get("returnPath"));',
      "const returnPath = normalizeReturnPath(input?.returnPath);",
    ],
  },
  {
    file: "src/features/games/mobile-games-route-state.ts",
    description:
      "games route state normalizes legacy /games and /discover/games return paths to /tabs/games before desktop game pages, search, or saved links reuse them",
    includes: [
      "function normalizeReturnPath(value?: string | null) {",
      'if (nextValue === "/games" || nextValue === "/discover/games") {',
      'return "/tabs/games";',
      'const returnPath = normalizeReturnPath(params.get("returnPath"));',
      "const returnPath = normalizeReturnPath(state.returnPath);",
    ],
  },
  {
    file: "src/features/mini-programs/mobile-mini-programs-route-state.ts",
    description:
      "mini-programs route state normalizes legacy /mini-programs and /discover/mini-programs return paths to /tabs/mini-programs before desktop mini-program pages, search, or saved links reuse them",
    includes: [
      "function normalizeReturnPath(value?: string | null) {",
      'nextValue === "/mini-programs" ||',
      'nextValue === "/discover/mini-programs"',
      'return "/tabs/mini-programs";',
      'const returnPath = normalizeReturnPath(params.get("returnPath"));',
      "const returnPath = normalizeReturnPath(state.returnPath);",
    ],
  },
  {
    file: "src/routes/channels-page.tsx",
    description:
      "desktop channels route only keeps the author side panel when it still matches the current desktop-selected post, self-heals legacy and trailing-slash /channels variants back to /tabs/channels even when the hash already matches, and normalizes stale desktop return paths away from /discover/channels",
    includes: [
      'import { normalizePathname } from "../lib/normalize-pathname";',
      "const normalizedPathname = normalizePathname(pathname);",
      'const normalizedDesktopReturnPath =',
      'routeState.returnPath === "/discover/channels"',
      '"/tabs/channels"',
      'normalizedPathname === "/channels" ||',
      'normalizedPathname === "/discover/channels"',
      "desktopSelectedPost?.authorId === routeSelectedAuthorId",
      "? routeSelectedAuthorId",
      ": undefined;",
      'queryKey: ["app-channel-author", baseUrl, syncedRouteSelectedAuthorId],',
      "enabled: Boolean(isDesktopLayout && syncedRouteSelectedAuthorId),",
      "authorId: syncedRouteSelectedAuthorId,",
      'pathname === "/tabs/channels"',
      'to: "/tabs/channels",',
    ],
  },
  {
    file: "src/routes/channel-author-page.tsx",
    description:
      "desktop channel author redirect normalizes legacy /discover/channels return paths before folding the author page back into the desktop channels workspace",
    includes: [
      'const normalizedDesktopReturnPath =',
      'routeState.returnPath === "/discover/channels"',
      '"/tabs/channels"',
      "returnHash: safeReturnHash,",
      "returnPath: safeReturnPath,",
      'to: "/tabs/channels",',
      "authorId,",
      "replace: true,",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-official-accounts-workspace.tsx",
    description: "desktop official accounts ignores article ids from a different account",
    includes: [
      "currentAccountArticleIds.has(focusedArticleId)",
      "currentAccountArticleIds.has(selectedArticleId)",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-official-accounts-workspace.tsx",
    description:
      "desktop official article window launchers preserve the full current path, including querystring, in returnTo links",
    includes: [
      'import { getCurrentWindowTargetPath } from "../../../runtime/desktop-windowing";',
      "const returnTo =",
      "getCurrentWindowTargetPath();",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-official-accounts-workspace.tsx",
    description:
      "desktop official accounts fallback opens service-account and subscription-inbox workspaces through the shared /tabs/chat officialView protocol",
    includes: [
      "buildDesktopOfficialServiceThreadPath({",
      "buildDesktopSubscriptionInboxPath({",
      "to: buildDesktopOfficialServiceThreadPath({",
      "to: buildDesktopSubscriptionInboxPath({",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-official-accounts-workspace.tsx",
    description:
      "desktop official accounts repairs stale account and article ids in accounts mode",
    includes: [
      "const syncAccountRouteSelection = useCallback(",
      "const selectedAccountMatches = selectedAccountId === effectiveAccountId;",
      "const selectedArticleMatchesAccount = selectedArticleId",
      "selectedArticleMatchesAccount",
      "? selectedArticleId",
      ": activeAccountArticleId,",
      "syncAccountRouteSelection(effectiveAccountId);",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-official-accounts-workspace.tsx",
    description:
      "desktop official accounts fallback keeps account opens on the desktop contacts pane with explicit officialMode=accounts instead of reviving legacy /official-accounts paths",
    includes: [
      'import { buildDesktopContactsRouteHash } from "../../contacts/contacts-route-state";',
      "const openDesktopAccountWorkspace = useCallback(",
      'to: "/tabs/contacts",',
      'pane: "official-accounts",',
      'officialMode: "accounts",',
      "openDesktopAccountWorkspace(accountId, articleId);",
      "openDesktopAccountWorkspace(accountId);",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-official-accounts-workspace.tsx",
    description:
      "desktop official accounts rewrites legacy account selections that are missing officialMode=accounts",
    includes: [
      "if (!selectedAccountId || selectedMode) {",
      'displayMode !== "accounts" ||',
      'onModeChange("accounts");',
    ],
  },
  {
    file: "src/routes/official-accounts-page.tsx",
    description:
      "desktop official-accounts list redirects preserve any existing desktop account/article selection on the legacy /contacts/official-accounts path while still defaulting bare entries to officialMode=feed",
    includes: [
      "const desktopPaneState = useMemo(() => {",
      'return routeState.pane === "official-accounts" ? routeState : null;',
      "<DesktopContactsRouteRedirectShell",
      'pane="official-accounts"',
      'officialMode={desktopPaneState?.officialMode ?? "feed"}',
      "accountId={desktopPaneState?.accountId}",
      "articleId={desktopPaneState?.articleId}",
    ],
  },
  {
    file: "src/routes/starred-friends-page.tsx",
    description:
      "legacy /contacts/starred redirects keep the desktop-selected friend when normalizing back into the contacts workspace",
    includes: [
      "const desktopCompatHash = useMemo(() => {",
      "const routeState = parseDesktopContactsRouteState(hash);",
      'pane: "starred-friends",',
      'routeState.pane === "starred-friends"',
      "hash: desktopCompatHash,",
    ],
  },
  {
    file: "src/routes/tags-page.tsx",
    description:
      "legacy /contacts/tags redirects preserve the current desktop tag and selected friend instead of collapsing back to a bare tags pane",
    includes: [
      "const desktopCompatHash = useMemo(() => {",
      "const routeState = parseDesktopContactsRouteState(hash);",
      'pane: "tags",',
      'tag: routeState.pane === "tags" ? routeState.tag : undefined,',
      'routeState.pane === "tags" ? routeState.characterId : undefined,',
      "hash: desktopCompatHash,",
    ],
  },
  {
    file: "src/routes/world-characters-page.tsx",
    description:
      "legacy /contacts/world-characters redirects keep the desktop-selected world character when normalizing back into the contacts workspace",
    includes: [
      "const desktopPaneState = useMemo(() => {",
      'return routeState.pane === "world-character" ? routeState : null;',
      "<DesktopContactsRouteRedirectShell",
      'pane="world-character"',
      "characterId={desktopPaneState?.characterId}",
      "showWorldCharacters",
    ],
  },
  {
    file: "src/routes/group-contacts-page.tsx",
    description:
      "legacy /contacts/groups redirects keep the desktop-selected group when normalizing back into the contacts workspace",
    includes: [
      "const desktopPaneState = useMemo(() => {",
      'return routeState.pane === "groups" ? routeState : null;',
      "<DesktopContactsRouteRedirectShell",
      'pane="groups"',
      "characterId={desktopPaneState?.characterId}",
    ],
  },
  {
    file: "src/routes/official-account-detail-page.tsx",
    description:
      "desktop official-account detail redirects write officialMode=accounts at the source and keep the currently selected desktop article when the legacy account route already points at the same account",
    includes: [
      "const desktopPaneState = useMemo(() => {",
      'return routeState.pane === "official-accounts" ? routeState : null;',
      "<DesktopContactsRouteRedirectShell",
      'pane="official-accounts"',
      "accountId={accountId}",
      "desktopPaneState?.accountId === accountId",
      "desktopPaneState.articleId",
      'officialMode="accounts"',
    ],
  },
  {
    file: "src/routes/desktop-official-article-window-page.tsx",
    description:
      "desktop official-article window account-home entry writes officialMode=accounts when it jumps back into the contacts workspace",
    includes: [
      'buildDesktopContactsRouteHash({',
      'pane: "official-accounts",',
      "accountId,",
      'officialMode: "accounts",',
    ],
  },
  {
    file: "src/routes/desktop-mobile-page.tsx",
    description:
      "desktop mobile official handoff cards write officialMode=accounts when they jump back into the contacts workspace with an account selection",
    includes: [
      'buildDesktopContactsRouteHash({',
      'pane: "official-accounts",',
      'officialMode: "accounts",',
      "accountId: resolvedOfficialHandoffState.accountId,",
      "accountId: account.id,",
    ],
  },
  {
    file: "src/features/official-accounts/official-article-route-shell.tsx",
    description:
      "desktop official-article route shell writes officialMode=accounts into article-window return targets and preserves the current accountId when the legacy article route already matches the same article",
    includes: [
      'import { useNavigate, useRouterState } from "@tanstack/react-router";',
      'buildDesktopContactsRouteHash({',
      'pane: "official-accounts",',
      "desktopPaneState?.articleId === articleId",
      "desktopPaneState.accountId",
      "articleId,",
      'officialMode: "accounts",',
      'returnTo: `/tabs/contacts',
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-official-accounts-workspace.tsx",
    description:
      "desktop official accounts feed drops stale article ids that are no longer visible and rewrites the fallback article back to the route",
    includes: [
      "currentFeedArticleIds.has(focusedArticleId)",
      "currentFeedArticleIds.has(selectedArticleId)",
      "setFocusedArticleId(null);",
      "const routeAlreadyMatchesFeedSelection =",
      'selectedMode === "feed" &&',
      "onHighlightFeedArticle(nextArticleId);",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-subscription-workspace.tsx",
    description:
      "desktop subscription inbox drops stale article ids from other workspaces, including empty inbox states",
    includes: [
      "!selectedArticleId || currentFeedArticleIds.has(selectedArticleId)",
      "currentFeedArticleIds.has(selectedArticleId)",
      'const syncKey = `${selectedArticleId}->${fallbackArticleId ?? "empty"}`;',
      "onOpenArticle?.(fallbackArticleId ?? undefined);",
    ],
  },
  {
    file: "src/features/desktop/official-accounts/desktop-subscription-workspace.tsx",
    description:
      "desktop subscription inbox fallback opens linked accounts through the desktop contacts pane and preserves the current article context",
    includes: [
      'import { buildDesktopContactsRouteHash } from "../../contacts/contacts-route-state";',
      'to: "/tabs/contacts",',
      'pane: "official-accounts",',
      'officialMode: "accounts",',
      "openDesktopAccountWorkspace(accountId, articleQuery.data.id);",
    ],
  },
  {
    file: "src/features/official-accounts/service/official-account-service-thread.tsx",
    description: "desktop service account thread rejects article ids from another account",
    includes: [
      "const selectedArticleMatchesAccount =",
      "const missingSelectedArticle =",
      "isOfficialAccountArticleMissingError(articleQuery.error);",
      "onCloseArticle?.(accountId);",
    ],
  },
  {
    file: "src/features/official-accounts/service/official-account-service-thread.tsx",
    description:
      "desktop service account thread keeps account-home and article open/close fallbacks on the shared /tabs/chat officialView protocol when no host callbacks are wired",
    includes: [
      'import { buildDesktopChatRouteHash } from "../../desktop/chat/desktop-chat-route-state";',
      'to: "/tabs/chat",',
      'officialView: "official-accounts",',
      'officialMode: "accounts",',
      'officialView: "service-account",',
      "onOpenArticle(articleId, accountId);",
      "onCloseArticle(accountId);",
    ],
  },
  {
    file: "src/features/desktop/feed/desktop-feed-workspace.tsx",
    description: "desktop feed clears stale route-selected posts that are no longer in the visible list",
    includes: [
      "if (!selectedPostId) {",
      "!posts.some((post) => post.id === selectedPostId)",
      "setSelectedPostId(null);",
    ],
  },
  {
    file: "src/routes/moments-page.tsx",
    description:
      "desktop moments self-heals legacy and trailing-slash /moments variants back to /tabs/moments and only opens character authors in the friend moments workspace with desktop return paths",
    includes: [
      'import { normalizePathname } from "../lib/normalize-pathname";',
      "const normalizedPathname = normalizePathname(pathname);",
      'const desktopMomentsPath = "/tabs/moments";',
      'normalizedPathname === "/moments" ||',
      'const desktopPathMismatch = pathname !== desktopMomentsPath;',
      "(!desktopPathMismatch && currentRouteHash === normalizedHash)",
      "to: desktopMomentsPath,",
      "routeSelectedAuthorMoment?.authorType === \"character\"",
      "returnPath: desktopMomentsPath,",
      "if (targetMoment?.authorType !== \"character\") {",
      "params: { characterId: targetMoment.authorId },",
    ],
  },
  {
    file: "src/routes/friend-moments-page.tsx",
    description:
      "desktop friend-moments falls back from legacy source-only starred and tags links to the matching desktop contacts panes instead of reviving old mobile contacts routes",
    includes: [
      'if (routeState.source === "starred-friends") {',
      'if (routeState.source === "tags") {',
      'to: "/tabs/contacts",',
      'pane: "starred-friends",',
      'pane: "tags",',
      'void navigate({ to: "/contacts/starred" });',
      'void navigate({ to: "/contacts/tags" });',
    ],
  },
  {
    file: "src/features/moments/friend-moments-route-state.ts",
    description:
      "desktop friend-moments route state normalizes legacy /moments, /discover/moments, and old contacts return paths back into desktop tabs, and it fills missing pane hashes for legacy starred/tags returns",
    includes: [
      'if (nextValue === "/moments" || nextValue === "/discover/moments") {',
      'return "/tabs/moments";',
      'if (nextValue === "/contacts/starred" || nextValue === "/contacts/tags") {',
      'return "/tabs/contacts";',
      'rawReturnPath === "/contacts/starred"',
      'pane: "starred-friends",',
      'rawReturnPath === "/contacts/tags"',
      'pane: "tags",',
    ],
  },
  {
    file: "src/features/moments/moments-route-state.ts",
    description:
      "desktop moments route state normalizes legacy /moments and /discover/moments return paths back to /tabs/moments",
    includes: [
      'if (nextValue === "/moments" || nextValue === "/discover/moments") {',
      'return "/tabs/moments";',
    ],
  },
];

const guardedRouteFiles = [
  "src/routes/channel-author-page.tsx",
  "src/routes/character-detail-page.tsx",
  "src/routes/friend-moments-page.tsx",
  "src/routes/friend-requests-page.tsx",
  "src/routes/group-contacts-page.tsx",
  "src/routes/mobile-friend-moments-page.tsx",
  "src/routes/mobile-moments-publish-page.tsx",
  "src/routes/official-account-article-page.tsx",
  "src/routes/official-account-detail-page.tsx",
  "src/routes/official-account-service-page.tsx",
  "src/routes/official-accounts-page.tsx",
  "src/routes/starred-friends-page.tsx",
  "src/routes/subscription-inbox-page.tsx",
  "src/routes/tags-page.tsx",
  "src/routes/world-characters-page.tsx",
];

const desktopNavRegressionCases = [
  { pathname: "/tabs/chat", primaryTo: "/tabs/chat", bottomAction: null },
  { pathname: "/tabs/chat/", primaryTo: "/tabs/chat", bottomAction: null },
  { pathname: "/chat", primaryTo: "/tabs/chat", bottomAction: null },
  { pathname: "/chat/123", primaryTo: "/tabs/chat", bottomAction: null },
  { pathname: "/group/123", primaryTo: "/tabs/chat", bottomAction: null },
  { pathname: "/group/new", primaryTo: "/tabs/chat", bottomAction: null },
  {
    pathname: "/official-accounts/service/42",
    primaryTo: "/tabs/chat",
    bottomAction: null,
  },
  { pathname: "/tabs/contacts", primaryTo: "/tabs/contacts", bottomAction: null },
  { pathname: "/contacts", primaryTo: "/tabs/contacts", bottomAction: null },
  {
    pathname: "/official-accounts",
    primaryTo: "/tabs/contacts",
    bottomAction: null,
  },
  {
    pathname: "/official-accounts/articles/42",
    primaryTo: "/tabs/contacts",
    bottomAction: null,
  },
  {
    pathname: "/tabs/favorites",
    primaryTo: "/tabs/favorites",
    bottomAction: null,
  },
  { pathname: "/favorites", primaryTo: "/tabs/favorites", bottomAction: null },
  { pathname: "/notes", primaryTo: "/tabs/favorites", bottomAction: null },
  { pathname: "/tabs/moments", primaryTo: "/tabs/moments", bottomAction: null },
  {
    pathname: "/discover/moments/publish",
    primaryTo: "/tabs/moments",
    bottomAction: null,
  },
  {
    pathname: "/friend-moments/abc",
    primaryTo: "/tabs/moments",
    bottomAction: null,
  },
  {
    pathname: "/moments/friend/abc",
    primaryTo: "/tabs/moments",
    bottomAction: null,
  },
  {
    pathname: "/desktop/friend-moments/abc",
    primaryTo: "/tabs/moments",
    bottomAction: null,
  },
  { pathname: "/discover/feed", primaryTo: "/tabs/feed", bottomAction: null },
  {
    pathname: "/tabs/channels/",
    primaryTo: "/tabs/channels",
    bottomAction: null,
  },
  {
    pathname: "/discover/channels",
    primaryTo: "/tabs/channels",
    bottomAction: null,
  },
  {
    pathname: "/channels/authors/42",
    primaryTo: "/tabs/channels",
    bottomAction: null,
  },
  { pathname: "/tabs/search", primaryTo: "/tabs/search", bottomAction: null },
  { pathname: "/search", primaryTo: "/tabs/search", bottomAction: null },
  { pathname: "/games", primaryTo: "/tabs/games", bottomAction: null },
  {
    pathname: "/discover/games",
    primaryTo: "/tabs/games",
    bottomAction: null,
  },
  {
    pathname: "/discover/mini-programs",
    primaryTo: "/tabs/mini-programs",
    bottomAction: null,
  },
  {
    pathname: "/desktop/mobile",
    primaryTo: null,
    bottomAction: "open-mobile-panel",
  },
  {
    pathname: "/desktop/settings",
    primaryTo: null,
    bottomAction: "open-more-menu",
  },
  {
    pathname: "/profile/settings",
    primaryTo: null,
    bottomAction: "open-more-menu",
  },
  {
    pathname: "/legal/privacy",
    primaryTo: null,
    bottomAction: "open-more-menu",
  },
  {
    pathname: "/desktop/channels/live-companion",
    primaryTo: null,
    bottomAction: "open-more-menu",
  },
];

const failures = [];

for (const expectation of expectations) {
  const filePath = join(appDir, expectation.file);
  const contents = readFileSync(filePath, "utf8");

  for (const pattern of expectation.includes) {
    if (!contents.includes(pattern)) {
      failures.push(
        `${expectation.file}: missing "${pattern}" (${expectation.description})`,
      );
    }
  }
}

for (const relativePath of guardedRouteFiles) {
  const filePath = join(appDir, relativePath);
  const contents = readFileSync(filePath, "utf8");

  if (!contents.includes("isDesktopOnlyPath(routeState.returnPath)")) {
    failures.push(
      `${relativePath}: missing desktop-only returnPath guard for routeState.returnPath`,
    );
  }
}

const desktopNavMatchingModule = await loadTypeScriptModule(
  "src/features/shell/desktop-nav-matching.ts",
);
const {
  desktopBottomNavBindings,
  desktopPrimaryNavBindings,
  isDesktopNavItemActive,
} = desktopNavMatchingModule;

for (const testCase of desktopNavRegressionCases) {
  const activePrimaryItems = desktopPrimaryNavBindings.filter((item) =>
    isDesktopNavItemActive(testCase.pathname, item),
  );
  if (activePrimaryItems.length > 1) {
    failures.push(
      `${testCase.pathname}: expected at most one primary nav match, got ${activePrimaryItems
        .map((item) => item.to)
        .join(", ")}`,
    );
  }

  const activeBottomItems = desktopBottomNavBindings.filter((item) =>
    isDesktopNavItemActive(testCase.pathname, item),
  );
  if (activeBottomItems.length > 1) {
    failures.push(
      `${testCase.pathname}: expected at most one bottom nav match, got ${activeBottomItems
        .map((item) => item.action)
        .join(", ")}`,
    );
  }

  const actualPrimaryTo = activePrimaryItems[0]?.to ?? null;
  if (actualPrimaryTo !== testCase.primaryTo) {
    failures.push(
      `${testCase.pathname}: expected primary nav ${String(testCase.primaryTo)}, got ${String(actualPrimaryTo)}`,
    );
  }

  const actualBottomAction = activeBottomItems[0]?.action ?? null;
  if (actualBottomAction !== testCase.bottomAction) {
    failures.push(
      `${testCase.pathname}: expected bottom nav ${String(testCase.bottomAction)}, got ${String(actualBottomAction)}`,
    );
  }
}

console.log("Desktop web routing audit");
console.log(
  `- Checked files: ${expectations.length + guardedRouteFiles.length}`,
);
console.log(`- Nav regression cases: ${desktopNavRegressionCases.length}`);

if (failures.length > 0) {
  console.error("Desktop web routing audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Desktop web routing audit passed.");
