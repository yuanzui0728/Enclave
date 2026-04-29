import { describe, expect, it, vi } from "vitest";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPathFromConversationPath,
  parseDesktopChatRouteHash,
} from "../src/features/desktop/chat/desktop-chat-route-state";
import {
  buildDesktopChatWindowLabel,
  buildDesktopChatWindowPath,
  parseDesktopChatWindowRouteHash,
} from "../src/features/desktop/chat/desktop-chat-window-route-state";
import {
  buildDesktopContactsRouteHash,
  parseDesktopContactsRouteState,
} from "../src/features/contacts/contacts-route-state";
import {
  buildDesktopNoteWindowPath,
  parseDesktopNoteEditorRouteHash,
  parseDesktopNoteWindowRouteHash,
} from "../src/features/favorites/note-window-route-state";
import {
  desktopBottomNavBindings,
  desktopPrimaryNavBindings,
  isDesktopNavItemActive,
} from "../src/features/shell/desktop-nav-matching";
import {
  buildDesktopStandaloneWindowLabel,
  shouldNavigateCurrentWindow,
} from "../src/runtime/desktop-windowing";
import { createSessionStateStorage } from "../src/runtime/session-storage";

describe("desktop route state", () => {
  it("round-trips desktop chat detail state and drops invalid one-shot fields", () => {
    const hash = buildDesktopChatRouteHash({
      conversationId: " group-1 ",
      messageId: "msg-9",
      panel: "details",
      detailsAction: "announcement",
      callAction: "video",
    });

    expect(hash).toBe(
      "conversationId=group-1&messageId=msg-9&panel=details&callAction=video&detailsAction=announcement",
    );
    expect(parseDesktopChatRouteHash(`#${hash}`)).toEqual({
      conversationId: "group-1",
      messageId: "msg-9",
      panel: "details",
      callAction: "video",
      detailsAction: "announcement",
      officialView: undefined,
      officialMode: undefined,
      accountId: undefined,
      articleId: undefined,
    });

    expect(
      parseDesktopChatRouteHash(
        "conversationId=group-1&panel=history&detailsAction=announcement&callAction=bad",
      ),
    ).toMatchObject({
      conversationId: "group-1",
      panel: "history",
      detailsAction: undefined,
      callAction: undefined,
    });
  });

  it("keeps official account state isolated from normal chat panel state", () => {
    const hash = buildDesktopChatRouteHash({
      panel: "details",
      callAction: "voice",
      officialView: "service-account",
      officialMode: "accounts",
      accountId: "oa-1",
      articleId: "article-2",
    });

    expect(parseDesktopChatRouteHash(hash)).toEqual({
      conversationId: undefined,
      messageId: undefined,
      panel: undefined,
      callAction: undefined,
      detailsAction: undefined,
      officialView: "service-account",
      officialMode: "accounts",
      accountId: "oa-1",
      articleId: "article-2",
    });
  });

  it("normalizes legacy chat and group paths into the desktop chat workspace", () => {
    expect(buildDesktopChatThreadPathFromConversationPath("/chat/direct-1")).toBe(
      "/tabs/chat#conversationId=direct-1",
    );
    expect(
      buildDesktopChatThreadPathFromConversationPath("/group/group-1/details"),
    ).toBe("/tabs/chat#conversationId=group-1");
    expect(buildDesktopChatThreadPathFromConversationPath("/contacts")).toBeNull();
  });

  it("round-trips contacts panes without dropping selection state", () => {
    const tagHash = buildDesktopContactsRouteHash({
      pane: "tags",
      tag: "重要朋友",
      characterId: "char-1",
      showWorldCharacters: true,
    });

    expect(parseDesktopContactsRouteState(`#${tagHash}`)).toMatchObject({
      pane: "tags",
      tag: "重要朋友",
      characterId: "char-1",
      showWorldCharacters: true,
    });

    const officialHash = buildDesktopContactsRouteHash({
      pane: "official-accounts",
      officialMode: "accounts",
      accountId: "oa-1",
      articleId: "article-1",
    });

    expect(parseDesktopContactsRouteState(officialHash)).toMatchObject({
      pane: "official-accounts",
      officialMode: "accounts",
      accountId: "oa-1",
      articleId: "article-1",
    });
  });

  it("keeps standalone chat and note window routes stable", () => {
    const chatPath = buildDesktopChatWindowPath({
      conversationId: "conv-1",
      conversationType: "direct",
      title: "测试聊天",
      returnTo: "/tabs/chat#conversationId=conv-1",
      highlightedMessageId: "msg-1",
    });
    const chatUrl = new URL(`http://127.0.0.1${chatPath}`);

    expect(chatUrl.pathname).toBe("/desktop/chat-window");
    expect(parseDesktopChatWindowRouteHash(chatUrl.hash)).toEqual({
      conversationId: "conv-1",
      conversationType: "direct",
      title: "测试聊天",
      returnTo: "/tabs/chat#conversationId=conv-1",
      highlightedMessageId: "msg-1",
    });
    expect(buildDesktopChatWindowLabel("conv/1?bad")).toBe(
      "desktop-chat-window:conv/1_bad",
    );

    const notePath = buildDesktopNoteWindowPath({
      draftId: "draft-1",
      noteId: "note-1",
      returnTo: "/tabs/favorites#category=notes",
    });
    expect(parseDesktopNoteWindowRouteHash(notePath.split("#")[1] ?? "")).toEqual({
      draftId: "draft-1",
      noteId: "note-1",
      returnTo: "/tabs/favorites#category=notes",
    });
    expect(parseDesktopNoteEditorRouteHash("#legacy-note")).toEqual({
      draftId: "legacy-note",
      noteId: "legacy-note",
      returnTo: undefined,
    });
  });

  it("matches desktop navigation for self-healing legacy paths", () => {
    const chatItem = desktopPrimaryNavBindings.find(
      (item) => item.to === "/tabs/chat",
    );
    const feedItem = desktopPrimaryNavBindings.find(
      (item) => item.to === "/tabs/feed",
    );
    const moreItem = desktopBottomNavBindings.find(
      (item) => item.action === "open-more-menu",
    );

    expect(chatItem && isDesktopNavItemActive("/group/new/", chatItem)).toBe(
      true,
    );
    expect(feedItem && isDesktopNavItemActive("/discover/feed/", feedItem)).toBe(
      true,
    );
    expect(moreItem && isDesktopNavItemActive("/legal/privacy", moreItem)).toBe(
      true,
    );
  });

  it("keeps browser fallback window targets and web storage synchronous", () => {
    expect(buildDesktopStandaloneWindowLabel("desktop note", "a/b?c")).toBe(
      "desktop_note:a/b_c",
    );

    window.history.replaceState(null, "", "/tabs/chat#conversationId=conv-1");
    expect(shouldNavigateCurrentWindow("/tabs/chat#conversationId=conv-1")).toBe(
      false,
    );
    expect(shouldNavigateCurrentWindow("/tabs/contacts")).toBe(true);

    window.localStorage.setItem(
      "desktop-test-storage",
      JSON.stringify({ state: { value: "ready" }, version: 0 }),
    );
    const storage = createSessionStateStorage();
    expect(storage.getItem("desktop-test-storage")).toEqual({
      state: { value: "ready" },
      version: 0,
    });
  });

  it("hydrates persisted runtime entry state before desktop route guards run", async () => {
    vi.resetModules();
    const previousRuntimeConfig = window.localStorage.getItem(
      "yinjie-app-runtime-config",
    );

    try {
      window.localStorage.setItem(
        "yinjie-app-runtime-config",
        JSON.stringify({
          apiBaseUrl: "http://127.0.0.1:3000",
          socketBaseUrl: "http://127.0.0.1:3000",
          worldAccessMode: "local",
          cloudPhone: "13800000000",
          cloudWorldId: "world-1",
          publicAppName: "Persisted Yinjie",
          configStatus: "validated",
        }),
      );

      const { getAppRuntimeConfig } = await import(
        "../src/runtime/runtime-config-store"
      );

      expect(getAppRuntimeConfig()).toMatchObject({
        apiBaseUrl: "http://127.0.0.1:3000",
        socketBaseUrl: "http://127.0.0.1:3000",
        worldAccessMode: "local",
        cloudPhone: "13800000000",
        cloudWorldId: "world-1",
        publicAppName: "Persisted Yinjie",
        configStatus: "validated",
      });
    } finally {
      if (previousRuntimeConfig === null) {
        window.localStorage.removeItem("yinjie-app-runtime-config");
      } else {
        window.localStorage.setItem(
          "yinjie-app-runtime-config",
          previousRuntimeConfig,
        );
      }
      vi.resetModules();
    }
  });
});
