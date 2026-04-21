import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(scriptDir, "..");

const expectations = [
  {
    file: "src/features/shell/desktop-shell.tsx",
    description:
      "desktop shell records SPA navigation state and opens the self-chat shortcut through the desktop chat workspace",
    includes: [
      'select: (state) => state.location.searchStr,',
      'import { recordAppNavigation } from "../../lib/history-back";',
      'import { buildDesktopChatThreadPath } from "../desktop/chat/desktop-chat-route-state";',
      'recordAppNavigation(`${pathname}${search}${hash}`);',
      "to: buildDesktopChatThreadPath({",
      "conversationId: conversation.id,",
    ],
  },
  {
    file: "src/routes/games-page.tsx",
    description: "desktop games route restores query-driven selection from the raw search string",
    includes: [
      'select: (state) => state.location.searchStr,',
      ">(inviteActivityFromSearch?.id ?? null);",
      "activity && activity.gameId === selectedGameId",
      "setActiveInviteActivityId(null);",
      "activeInviteActivity?.gameId === selectedGameId",
    ],
  },
  {
    file: "src/routes/mini-programs-page.tsx",
    description:
      "desktop mini programs route restores query-driven selection from the raw search string, scopes group relay context to the group relay workspace, and routes desktop group-relay returns back through /tabs/chat",
    includes: [
      'select: (state) => state.location.searchStr,',
      'import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";',
      'selectedMiniProgramId === "group-relay" ? groupRelayLaunchContext : null;',
      "sourceGroupId: activeLaunchContext?.sourceGroupId,",
      'miniProgramId === "group-relay" ? groupRelayLaunchContext : null;',
      "to: buildDesktopChatThreadPath({",
      "conversationId: activeLaunchContext.sourceGroupId,",
    ],
  },
  {
    file: "src/features/desktop/chat/desktop-chat-details-panel.tsx",
    description:
      "desktop chat details carries group-qr source context, preserves desktop return hashes for chat/group background and group qr pages, and opens common groups through the desktop chat workspace",
    includes: [
      'import { buildGroupInviteReturnSearch } from "../../../lib/group-invite-delivery";',
      'import { buildMobileChatRouteHash } from "../../chat/mobile-chat-route-state";',
      'import { buildMobileGroupRouteHash } from "../../chat/mobile-group-route-state";',
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
      "desktop add-friend workspace syncs the selected search result back to the route hash, repairs stale openCompose entries, and opens created chats through /tabs/chat",
    includes: [
      'if (!routeState.openCompose || loading) {',
      'if (routeState.openCompose) {',
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
      "desktop character detail keeps start-chat, direct-call, and common-group opens on the desktop chat workspace instead of legacy /chat and /group routes",
    includes: [
      "buildDesktopChatRouteHash,",
      "buildDesktopChatThreadPath,",
      "to: isDesktopLayout",
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
      "desktop create-group route keeps desktop dialog close and post-create flows on the desktop chat workspace instead of legacy /chat and /group routes",
    includes: [
      'import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";',
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
    file: "src/features/search/desktop-search-launcher.tsx",
    description:
      "desktop search launcher opens conversation and official-account suggestions through desktop workspace routes and normalizes legacy favorite quick links before opening them",
    includes: [
      'import { buildDesktopContactsRouteHash } from "../contacts/contacts-route-state";',
      'import { buildDesktopChatThreadPath } from "../desktop/chat/desktop-chat-route-state";',
      "resolveSearchNavigationTarget(item, {",
      "desktopLayout: true,",
      "to: buildDesktopChatThreadPath({",
      "messageId: message.messageId,",
      'pane: "official-accounts",',
      "to: buildDesktopOfficialAccountSearchPath(",
    ],
  },
  {
    file: "src/features/search/search-navigation.ts",
    description:
      "desktop search navigation rewrites legacy /chat, /group, and official-account quick-link targets to desktop workspace routes while preserving legacy mobile behavior elsewhere",
    includes: [
      'import { buildDesktopContactsRouteHash } from "../contacts/contacts-route-state";',
      'import {',
      "buildDesktopChatRouteHash,",
      "buildDesktopOfficialServiceThreadPath,",
      "buildDesktopSubscriptionInboxPath,",
      "options?: SearchNavigationOptions,",
      "resolveDesktopConversationNavigationTarget(normalizedTarget)",
      "resolveDesktopOfficialNavigationTarget(normalizedTarget)",
      'to: "/tabs/chat",',
      'target.to === "/chat/subscription-inbox"',
      'target.to === "/contacts/official-accounts"',
      'pane: "official-accounts",',
      "messageId: parseLegacyHighlightedMessageId(target.hash),",
    ],
  },
  {
    file: "src/routes/search-page.tsx",
    description:
      "desktop search page passes desktopLayout-aware normalization into quick-link and result navigation so legacy favorite routes open directly in desktop workspaces",
    includes: [
      "resolveSearchNavigationTarget(item, {",
      "desktopLayout: isDesktopLayout,",
      "applyMobileSearchReturn(",
      "const navigationTarget = applyMobileSearchReturn(",
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
      "desktop mobile rewrites stale call handoff titles from the live conversation, keeps mobile handoff copies on mobile chat paths, routes group-invite returns and desktop-open actions through /tabs/chat, and repairs stale official handoffs from live account/article data",
    includes: [
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
      "desktop favorites uses the full current path for inline note-editor returnTo links and normalizes legacy favorite open targets back into desktop workspaces",
    includes: [
      'import { resolveSearchNavigationTarget } from "../features/search/search-navigation";',
      "selectedFavoriteNavigationTarget",
      "resolveSearchNavigationTarget(",
      "{ desktopLayout: true },",
      "search={selectedFavoriteNavigationTarget?.search as never}",
      "hash={selectedFavoriteNavigationTarget?.hash}",
      'import { getCurrentWindowTargetPath } from "../runtime/desktop-windowing";',
      "returnTo:",
      "getCurrentWindowTargetPath()",
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
    file: "src/routes/mobile-moments-publish-page.tsx",
    description: "mobile moments publish clears returnHash when returnPath is unsafe",
    includes: [
      "const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;",
    ],
  },
  {
    file: "src/routes/channels-page.tsx",
    description:
      "desktop channels route only keeps the author side panel when it still matches the current desktop-selected post",
    includes: [
      "desktopSelectedPost?.authorId === routeSelectedAuthorId",
      "? routeSelectedAuthorId",
      ": undefined;",
      'queryKey: ["app-channel-author", baseUrl, syncedRouteSelectedAuthorId],',
      "enabled: Boolean(isDesktopLayout && syncedRouteSelectedAuthorId),",
      "authorId: syncedRouteSelectedAuthorId,",
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
      "desktop official accounts rewrites legacy account selections that are missing officialMode=accounts",
    includes: [
      "if (!selectedAccountId || selectedMode) {",
      'displayMode !== "accounts" ||',
      'onModeChange("accounts");',
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
    description: "desktop moments only opens character authors in the friend moments workspace",
    includes: [
      "routeSelectedAuthorMoment?.authorType === \"character\"",
      "if (targetMoment?.authorType !== \"character\") {",
      "params: { characterId: targetMoment.authorId },",
    ],
  },
];

const guardedRouteFiles = [
  "src/routes/channel-author-page.tsx",
  "src/routes/character-detail-page.tsx",
  "src/routes/friend-moments-page.tsx",
  "src/routes/friend-requests-page.tsx",
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

console.log("Desktop web routing audit");
console.log(`- Checked files: ${expectations.length + guardedRouteFiles.length}`);

if (failures.length > 0) {
  console.error("Desktop web routing audit failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Desktop web routing audit passed.");
