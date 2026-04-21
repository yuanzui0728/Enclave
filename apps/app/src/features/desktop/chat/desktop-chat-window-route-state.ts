import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  buildDesktopStandaloneWindowLabel,
  openBrowserStandaloneWindow,
  openDesktopStandaloneWindow,
} from "../../../runtime/desktop-windowing";

const DESKTOP_CHAT_WINDOW_PATH = "/desktop/chat-window";

export type DesktopChatWindowRouteState = {
  conversationId: string;
  conversationType: "direct" | "group";
  title: string;
  returnTo?: string;
  highlightedMessageId?: string;
};

export function buildDesktopChatWindowRouteHash(
  input: DesktopChatWindowRouteState,
) {
  const params = new URLSearchParams();
  params.set("conversationId", input.conversationId);
  params.set("type", input.conversationType);
  params.set("title", input.title.trim() || "聊天");

  if (input.returnTo?.trim()) {
    params.set("returnTo", input.returnTo.trim());
  }

  if (input.highlightedMessageId?.trim()) {
    params.set("messageId", input.highlightedMessageId.trim());
  }

  return params.toString();
}

export function buildDesktopChatWindowPath(input: DesktopChatWindowRouteState) {
  const hash = buildDesktopChatWindowRouteHash(input);
  return hash ? `${DESKTOP_CHAT_WINDOW_PATH}#${hash}` : DESKTOP_CHAT_WINDOW_PATH;
}

export function parseDesktopChatWindowRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  const conversationId = params.get("conversationId")?.trim();
  const conversationType = params.get("type")?.trim();
  const title = params.get("title")?.trim();
  if (
    !conversationId ||
    (conversationType !== "direct" && conversationType !== "group") ||
    !title
  ) {
    return null;
  }

  const returnTo = params.get("returnTo")?.trim();
  const highlightedMessageId = params.get("messageId")?.trim();

  return {
    conversationId,
    conversationType,
    title,
    returnTo: returnTo || undefined,
    highlightedMessageId: highlightedMessageId || undefined,
  } satisfies DesktopChatWindowRouteState;
}

export function buildDesktopChatWindowLabel(conversationId: string) {
  return buildDesktopStandaloneWindowLabel(
    "desktop-chat-window",
    conversationId,
  );
}

export async function openDesktopChatWindow(input: DesktopChatWindowRouteState) {
  if (typeof window === "undefined") {
    return false;
  }

  const windowLabel = buildDesktopChatWindowLabel(input.conversationId);
  const routePath = buildDesktopChatWindowPath(input);
  const width = Math.max(
    1040,
    Math.min(window.screen.availWidth - 96, 1220),
  );
  const height = Math.max(760, Math.min(window.screen.availHeight - 96, 920));
  const left = Math.max(24, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(24, Math.round((window.screen.availHeight - height) / 2));
  const features = [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(",");

  if (!isDesktopRuntimeAvailable()) {
    return openBrowserStandaloneWindow({
      label: windowLabel,
      url: routePath,
      features,
    });
  }

  if (
    await openDesktopStandaloneWindow({
      label: windowLabel,
      url: routePath,
      title: input.title.trim() || "聊天",
      width,
      height,
      minWidth: 1040,
      minHeight: 760,
    })
  ) {
    return true;
  }

  return openBrowserStandaloneWindow({
    label: windowLabel,
    url: routePath,
    features,
  });
}
