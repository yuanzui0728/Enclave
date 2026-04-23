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
  label: string;
  shortLabel: string;
  to: string;
};

export type DesktopNavActionBinding = DesktopNavMatchItem & {
  label: string;
  shortLabel: string;
  action: DesktopNavAction;
};

export const desktopPrimaryNavBindings: DesktopNavRouteBinding[] = [
  {
    label: "消息",
    shortLabel: "消息",
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
    label: "通讯录",
    shortLabel: "通讯录",
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
    label: "收藏",
    shortLabel: "收藏",
    to: "/tabs/favorites",
    matches: ["/tabs/favorites", "/favorites", "/notes", "/desktop/note-window"],
  },
  {
    label: "朋友圈",
    shortLabel: "朋友圈",
    to: "/tabs/moments",
    matches: [
      "/tabs/moments",
      "/moments",
      "/discover/moments",
      "/discover/moments/publish",
      "/friend-moments/",
      "/desktop/friend-moments/",
    ],
  },
  {
    label: "广场动态",
    shortLabel: "广场",
    to: "/tabs/feed",
    matches: ["/tabs/feed", "/feed", "/discover/feed"],
  },
  {
    label: "视频号",
    shortLabel: "视频号",
    to: "/tabs/channels",
    matches: ["/tabs/channels", "/channels", "/discover/channels"],
  },
  {
    label: "搜一搜",
    shortLabel: "搜索",
    to: "/tabs/search",
    matches: ["/tabs/search", "/search"],
  },
  {
    label: "游戏中心",
    shortLabel: "游戏",
    to: "/tabs/games",
    matches: ["/tabs/games", "/games", "/discover/games"],
  },
  {
    label: "小程序面板",
    shortLabel: "小程序",
    to: "/tabs/mini-programs",
    matches: ["/tabs/mini-programs", "/mini-programs", "/discover/mini-programs"],
  },
];

export const desktopBottomNavBindings: DesktopNavActionBinding[] = [
  {
    label: "手机",
    shortLabel: "手机",
    action: "open-mobile-panel",
    matches: ["/desktop/mobile"],
  },
  {
    label: "更多",
    shortLabel: "更多",
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
