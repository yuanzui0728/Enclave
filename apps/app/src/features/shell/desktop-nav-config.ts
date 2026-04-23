import {
  Blocks,
  Gamepad2,
  BellDot,
  MoreHorizontal,
  Newspaper,
  PlaySquare,
  Search,
  Smartphone,
  Star,
  UsersRound,
  MessageCircleMore,
  FolderOpen,
  History,
  Lock,
  RadioTower,
  Settings,
} from "lucide-react";

export type DesktopNavRouteItem = {
  kind: "route";
  icon: typeof MessageCircleMore;
  label: string;
  shortLabel: string;
  to: string;
  matches: string[];
  excludedMatches?: string[];
};

export type DesktopNavActionItem = {
  kind: "action";
  icon: typeof MessageCircleMore;
  label: string;
  shortLabel: string;
  action:
    | "open-mobile-panel"
    | "open-more-menu"
    | "open-live-companion"
    | "open-chat-files"
    | "open-chat-history"
    | "lock"
    | "open-feedback"
    | "open-settings";
  matches?: string[];
  excludedMatches?: string[];
};

export type DesktopNavItem = DesktopNavRouteItem | DesktopNavActionItem;

export const desktopPrimaryNavItems: DesktopNavRouteItem[] = [
  {
    kind: "route",
    icon: MessageCircleMore,
    label: "消息",
    shortLabel: "消息",
    to: "/tabs/chat",
    matches: [
      "/tabs/chat",
      "/chat",
      "/group/",
      "/official-accounts/service/",
    ],
  },
  {
    kind: "route",
    icon: UsersRound,
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
    kind: "route",
    icon: Star,
    label: "收藏",
    shortLabel: "收藏",
    to: "/tabs/favorites",
    matches: ["/tabs/favorites", "/favorites", "/notes", "/desktop/note-window"],
  },
  {
    kind: "route",
    icon: BellDot,
    label: "朋友圈",
    shortLabel: "朋友圈",
    to: "/tabs/moments",
    matches: [
      "/tabs/moments",
      "/discover/moments",
      "/discover/moments/publish",
      "/desktop/friend-moments/",
    ],
  },
  {
    kind: "route",
    icon: Newspaper,
    label: "广场动态",
    shortLabel: "广场",
    to: "/tabs/feed",
    matches: ["/tabs/feed", "/discover/feed"],
  },
  {
    kind: "route",
    icon: PlaySquare,
    label: "视频号",
    shortLabel: "视频号",
    to: "/tabs/channels",
    matches: ["/tabs/channels", "/discover/channels", "/channels/authors/"],
  },
  {
    kind: "route",
    icon: Search,
    label: "搜一搜",
    shortLabel: "搜索",
    to: "/tabs/search",
    matches: ["/tabs/search", "/search"],
  },
  {
    kind: "route",
    icon: Gamepad2,
    label: "游戏中心",
    shortLabel: "游戏",
    to: "/tabs/games",
    matches: ["/tabs/games", "/games", "/discover/games"],
  },
  {
    kind: "route",
    icon: Blocks,
    label: "小程序面板",
    shortLabel: "小程序",
    to: "/tabs/mini-programs",
    matches: ["/tabs/mini-programs", "/discover/mini-programs"],
  },
];

export const desktopBottomNavItems: DesktopNavActionItem[] = [
  {
    kind: "action",
    icon: Smartphone,
    label: "手机",
    shortLabel: "手机",
    action: "open-mobile-panel",
    matches: ["/desktop/mobile"],
  },
  {
    kind: "action",
    icon: MoreHorizontal,
    label: "更多",
    shortLabel: "更多",
    action: "open-more-menu",
    matches: [
      "/desktop/chat-files",
      "/desktop/chat-history",
      "/desktop/feedback",
      "/desktop/settings",
      "/desktop/channels/",
    ],
  },
];

export const desktopMoreMenuItems: DesktopNavActionItem[] = [
  {
    kind: "action",
    icon: RadioTower,
    label: "视频号直播伴侣",
    shortLabel: "直播伴侣",
    action: "open-live-companion",
  },
  {
    kind: "action",
    icon: FolderOpen,
    label: "聊天文件",
    shortLabel: "聊天文件",
    action: "open-chat-files",
  },
  {
    kind: "action",
    icon: History,
    label: "聊天记录管理",
    shortLabel: "聊天记录",
    action: "open-chat-history",
  },
  {
    kind: "action",
    icon: Lock,
    label: "锁定",
    shortLabel: "锁定",
    action: "lock",
  },
  {
    kind: "action",
    icon: MessageCircleMore,
    label: "意见反馈",
    shortLabel: "反馈",
    action: "open-feedback",
  },
  {
    kind: "action",
    icon: Settings,
    label: "设置",
    shortLabel: "设置",
    action: "open-settings",
  },
];

export function isDesktopNavItemActive(
  pathname: string,
  item: Pick<DesktopNavItem, "excludedMatches" | "matches">,
) {
  const matches =
    item.matches?.some((prefix) => pathname.startsWith(prefix)) ?? false;
  if (!matches) {
    return false;
  }

  return !(
    item.excludedMatches?.some((prefix) => pathname.startsWith(prefix)) ?? false
  );
}
