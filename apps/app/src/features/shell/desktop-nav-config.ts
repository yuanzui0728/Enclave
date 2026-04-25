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
import { msg } from "@lingui/macro";
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
    label: msg`视频号直播伴侣`,
    shortLabel: msg`直播伴侣`,
    action: "open-live-companion",
  },
  {
    kind: "action",
    icon: FolderOpen,
    label: msg`聊天文件`,
    shortLabel: msg`聊天文件`,
    action: "open-chat-files",
  },
  {
    kind: "action",
    icon: History,
    label: msg`聊天记录管理`,
    shortLabel: msg`聊天记录`,
    action: "open-chat-history",
  },
  {
    kind: "action",
    icon: Lock,
    label: msg`锁定`,
    shortLabel: msg`锁定`,
    action: "lock",
  },
  {
    kind: "action",
    icon: MessageCircleMore,
    label: msg`意见反馈`,
    shortLabel: msg`反馈`,
    action: "open-feedback",
  },
  {
    kind: "action",
    icon: Settings,
    label: msg`设置`,
    shortLabel: msg`设置`,
    action: "open-settings",
  },
];

export { isDesktopNavItemActive };
