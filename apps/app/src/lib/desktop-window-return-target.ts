import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";
import {
  buildDesktopChatWindowLabel,
  parseDesktopChatWindowRouteHash,
} from "../features/desktop/chat/desktop-chat-window-route-state";

export type DesktopWindowReturnTarget = {
  standaloneWindowLabel: string | null;
  mainWindowPath: string;
};

export function resolveDesktopWindowReturnTarget(
  targetPath: string,
): DesktopWindowReturnTarget {
  const normalizedPath = targetPath.trim();
  if (!normalizedPath) {
    return {
      standaloneWindowLabel: null,
      mainWindowPath: "",
    };
  }

  const hashIndex = normalizedPath.indexOf("#");
  const basePath =
    hashIndex === -1 ? normalizedPath : normalizedPath.slice(0, hashIndex);

  if (basePath !== "/desktop/chat-window") {
    return {
      standaloneWindowLabel: null,
      mainWindowPath: normalizedPath,
    };
  }

  const routeState = parseDesktopChatWindowRouteHash(
    hashIndex === -1 ? "" : normalizedPath.slice(hashIndex),
  );
  if (!routeState) {
    return {
      standaloneWindowLabel: null,
      mainWindowPath: normalizedPath,
    };
  }

  return {
    standaloneWindowLabel: buildDesktopChatWindowLabel(
      routeState.conversationId,
    ),
    mainWindowPath: buildDesktopChatThreadPath({
      conversationId: routeState.conversationId,
      messageId: routeState.highlightedMessageId,
    }),
  };
}
