import { msg } from "@lingui/macro";

type ShellMessage = ReturnType<typeof msg>;

export type DesktopNavAction =
  | "open-mobile-panel"
  | "open-more-menu"
  | "open-live-companion"
  | "open-chat-files"
  | "open-chat-history"
  | "lock"
  | "open-feedback"
  | "open-settings";

export type DesktopNavMatchItem = {
  matches?: string[];
  excludedMatches?: string[];
};

export type DesktopNavRouteBinding = DesktopNavMatchItem & {
  label: ShellMessage;
  shortLabel: ShellMessage;
  to: string;
};

export type DesktopNavActionBinding = DesktopNavMatchItem & {
  label: ShellMessage;
  shortLabel: ShellMessage;
  action: DesktopNavAction;
};

export const desktopPrimaryNavBindings: DesktopNavRouteBinding[] = [
  {
    label: msg`消息`,
    shortLabel: msg`消息`,
    to: "/tabs/chat",
    matches: [
      "/tabs/chat",
      "/chat",
      "/chat/subscription-inbox",
      "/group/",
      "/group/new",
      "/official-accounts/service/",
    ],
  },
  {
    label: msg`通讯录`,
    shortLabel: msg`通讯录`,
    to: "/tabs/contacts",
    matches: [
      "/tabs/contacts",
      "/contacts",
      "/contacts/starred",
      "/contacts/tags",
      "/contacts/official-accounts",
      "/desktop/add-friend",
      "/official-accounts",
      "/official-accounts/",
      "/character/",
      "/friend-requests",
    ],
    excludedMatches: ["/official-accounts/service/"],
  },
  {
    label: msg`收藏`,
    shortLabel: msg`收藏`,
    to: "/tabs/favorites",
    matches: ["/tabs/favorites", "/favorites", "/notes", "/desktop/note-window"],
  },
  {
    label: msg`朋友圈`,
    shortLabel: msg`朋友圈`,
    to: "/tabs/moments",
    matches: [
      "/tabs/moments",
      "/moments",
      "/moments/friend/",
      "/discover/moments",
      "/discover/moments/publish",
      "/friend-moments/",
      "/desktop/friend-moments/",
    ],
  },
  {
    label: msg`广场动态`,
    shortLabel: msg`广场`,
    to: "/tabs/feed",
    matches: ["/tabs/feed", "/feed", "/discover/feed"],
  },
  {
    label: msg`视频号`,
    shortLabel: msg`视频号`,
    to: "/tabs/channels",
    matches: ["/tabs/channels", "/channels", "/discover/channels"],
  },
  {
    label: msg`搜一搜`,
    shortLabel: msg`搜索`,
    to: "/tabs/search",
    matches: ["/tabs/search", "/search"],
  },
  {
    label: msg`游戏中心`,
    shortLabel: msg`游戏`,
    to: "/tabs/games",
    matches: ["/tabs/games", "/games", "/discover/games"],
  },
  {
    label: msg`小程序面板`,
    shortLabel: msg`小程序`,
    to: "/tabs/mini-programs",
    matches: ["/tabs/mini-programs", "/mini-programs", "/discover/mini-programs"],
  },
];

export const desktopBottomNavBindings: DesktopNavActionBinding[] = [
  {
    label: msg`手机`,
    shortLabel: msg`手机`,
    action: "open-mobile-panel",
    matches: ["/desktop/mobile"],
  },
  {
    label: msg`更多`,
    shortLabel: msg`更多`,
    action: "open-more-menu",
    matches: [
      "/desktop/chat-files",
      "/desktop/chat-history",
      "/desktop/feedback",
      "/desktop/settings",
      "/profile/settings",
      "/legal/",
      "/desktop/channels/",
    ],
  },
];

export function normalizeDesktopNavMatchPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return "";
  }

  if (trimmed === "/") {
    return "/";
  }

  return trimmed.replace(/\/+$/, "");
}

export function matchesDesktopNavPath(pathname: string, match: string) {
  const normalizedPathname = normalizeDesktopNavMatchPath(pathname);
  const normalizedMatch = normalizeDesktopNavMatchPath(match);
  if (!normalizedPathname || !normalizedMatch) {
    return false;
  }

  return (
    normalizedPathname === normalizedMatch ||
    normalizedPathname.startsWith(`${normalizedMatch}/`)
  );
}

export function isDesktopNavItemActive(
  pathname: string,
  item: DesktopNavMatchItem,
) {
  const matches =
    item.matches?.some((prefix) => matchesDesktopNavPath(pathname, prefix)) ??
    false;
  if (!matches) {
    return false;
  }

  return !(
    item.excludedMatches?.some((prefix) =>
      matchesDesktopNavPath(pathname, prefix),
    ) ?? false
  );
}
