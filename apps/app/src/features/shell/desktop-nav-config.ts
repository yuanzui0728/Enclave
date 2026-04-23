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
import {
  desktopBottomNavBindings,
  desktopPrimaryNavBindings,
  isDesktopNavItemActive,
  type DesktopNavAction,
  type DesktopNavActionBinding,
  type DesktopNavRouteBinding,
} from "./desktop-nav-matching";

export type DesktopNavRouteItem = DesktopNavRouteBinding & {
  kind: "route";
  icon: typeof MessageCircleMore;
};

export type DesktopNavActionItem = DesktopNavActionBinding & {
  kind: "action";
  icon: typeof MessageCircleMore;
};

export type DesktopNavItem = DesktopNavRouteItem | DesktopNavActionItem;

const desktopPrimaryNavIcons: Record<
  DesktopNavRouteBinding["to"],
  typeof MessageCircleMore
> = {
  "/tabs/chat": MessageCircleMore,
  "/tabs/contacts": UsersRound,
  "/tabs/favorites": Star,
  "/tabs/moments": BellDot,
  "/tabs/feed": Newspaper,
  "/tabs/channels": PlaySquare,
  "/tabs/search": Search,
  "/tabs/games": Gamepad2,
  "/tabs/mini-programs": Blocks,
};

export const desktopPrimaryNavItems: DesktopNavRouteItem[] =
  desktopPrimaryNavBindings.map((item) => ({
    ...item,
    kind: "route",
    icon: desktopPrimaryNavIcons[item.to],
  }));

const desktopBottomNavIcons: Record<
  DesktopNavAction,
  typeof MessageCircleMore
> = {
  "open-mobile-panel": Smartphone,
  "open-more-menu": MoreHorizontal,
  "open-live-companion": RadioTower,
  "open-chat-files": FolderOpen,
  "open-chat-history": History,
  lock: Lock,
  "open-feedback": MessageCircleMore,
  "open-settings": Settings,
};

export const desktopBottomNavItems: DesktopNavActionItem[] =
  desktopBottomNavBindings.map((item) => ({
    ...item,
    kind: "action",
    icon: desktopBottomNavIcons[item.action],
  }));

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

export { isDesktopNavItemActive };
