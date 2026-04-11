import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  X,
} from "lucide-react";
import { getConversations } from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import {
  buildDesktopChatImageViewerRouteHash,
  parseDesktopChatImageViewerRouteHash,
  readDesktopChatImageViewerSession,
  type DesktopChatImageViewerSessionItem,
} from "../features/desktop/chat/desktop-chat-image-viewer-route-state";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DesktopChatImageViewerPage() {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseDesktopChatImageViewerRouteHash(hash),
    [hash],
  );
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: Boolean(routeState),
  });
  const shouldValidateReturnPaths =
    !conversationsQuery.isLoading && !conversationsQuery.isError;
  const conversationPathSet = useMemo(
    () =>
      new Set(
        (conversationsQuery.data ?? []).map((conversation) =>
          isPersistedGroupConversation(conversation)
            ? `/group/${conversation.id}`
            : `/chat/${conversation.id}`,
        ),
      ),
    [conversationsQuery.data],
  );
  const sessionItems = useMemo(
    () =>
      routeState?.sessionId
        ? readDesktopChatImageViewerSession(routeState.sessionId)
        : [],
    [routeState?.sessionId],
  );
  const routeReturnTo = useMemo(
    () =>
      resolveConversationReturnPath(
        routeState?.returnTo,
        conversationPathSet,
        shouldValidateReturnPaths,
      ),
    [conversationPathSet, routeState?.returnTo, shouldValidateReturnPaths],
  );
  const viewerItems = useMemo(() => {
    if (!routeState) {
      return [] as DesktopChatImageViewerSessionItem[];
    }

    const rawItems = sessionItems.length
      ? sessionItems
      : [
          {
            id: routeState.activeId || "current-image",
            imageUrl: routeState.imageUrl,
            title: routeState.title,
            meta: routeState.meta,
            returnTo: routeState.returnTo,
          },
        ];

    return rawItems.map((item) => ({
      ...item,
      returnTo: resolveConversationReturnPath(
        item.returnTo,
        conversationPathSet,
        shouldValidateReturnPaths,
      ),
    }));
  }, [
    conversationPathSet,
    routeState,
    sessionItems,
    shouldValidateReturnPaths,
  ]);
  const activeItemIndex = useMemo(() => {
    if (!viewerItems.length) {
      return -1;
    }

    if (!routeState?.activeId) {
      return 0;
    }

    const matchedIndex = viewerItems.findIndex(
      (item) => item.id === routeState.activeId,
    );
    return matchedIndex >= 0 ? matchedIndex : 0;
  }, [routeState?.activeId, viewerItems]);
  const activeItem =
    activeItemIndex >= 0 ? viewerItems[activeItemIndex] : undefined;
  const activeItemReturnTo = activeItem?.returnTo;
  const fallbackPath = activeItem?.returnTo ?? routeReturnTo ?? "/tabs/chat";

  const navigateToItem = useCallback(
    (item: DesktopChatImageViewerSessionItem) => {
      if (!routeState) {
        return;
      }

      void navigate({
        to: "/desktop/chat-image-viewer",
        hash: buildDesktopChatImageViewerRouteHash({
          imageUrl: item.imageUrl,
          title: item.title,
          meta: item.meta,
          returnTo: item.returnTo,
          sessionId: routeState.sessionId,
          activeId: item.id,
        }),
        replace: true,
      });
    },
    [navigate, routeState],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!activeItem) {
        if (event.key === "Escape") {
          event.preventDefault();
          window.location.assign(fallbackPath);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveUrlAsFile(activeItem.imageUrl, activeItem.title);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        openPrintWindow({
          title: activeItem.title,
          imageUrl: activeItem.imageUrl,
        });
        return;
      }

      if (event.key === "ArrowLeft" && activeItemIndex > 0) {
        event.preventDefault();
        navigateToItem(viewerItems[activeItemIndex - 1]!);
        return;
      }

      if (
        event.key === "ArrowRight" &&
        activeItemIndex < viewerItems.length - 1
      ) {
        event.preventDefault();
        navigateToItem(viewerItems[activeItemIndex + 1]!);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeStandaloneWindow(fallbackPath);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeItem, activeItemIndex, fallbackPath, navigateToItem, viewerItems]);

  if (!routeState || !activeItem) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#1f1f1f] p-6">
        <div className="w-full max-w-lg rounded-[20px] border border-white/10 bg-[#2a2a2a] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.28)]">
          <EmptyState
            title="这张图片已经失去上下文"
            description="可能是新窗口参数被清掉了。回到消息页后重新打开一次即可。"
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => focusMainWindow(fallbackPath)}
              className="h-9 rounded-[9px] bg-[#07c160] px-4 text-white hover:bg-[#06ad56]"
            >
              回到消息页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#1f1f1f] text-white">
      <header className="flex items-start justify-between gap-4 border-b border-white/8 bg-[#242424] px-5 py-4">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-medium">
            {activeItem.title}
          </div>
          {activeItem.meta ? (
            <div className="mt-1 truncate text-[12px] text-white/62">
              {activeItem.meta}
            </div>
          ) : null}
          <div className="mt-1 text-[12px] text-white/46">
            {activeItemIndex + 1} / {viewerItems.length}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StandaloneActionButton
            label="保存图片"
            onClick={() => saveUrlAsFile(activeItem.imageUrl, activeItem.title)}
          >
            <Download size={16} />
          </StandaloneActionButton>
          <StandaloneActionButton
            label="打印图片"
            onClick={() =>
              openPrintWindow({
                title: activeItem.title,
                imageUrl: activeItem.imageUrl,
              })
            }
          >
            <Printer size={16} />
          </StandaloneActionButton>
          {activeItemReturnTo ? (
            <StandaloneActionButton
              label="定位到聊天位置"
              onClick={() => focusMainWindow(activeItemReturnTo)}
            >
              <ArrowLeft size={16} />
            </StandaloneActionButton>
          ) : null}
          <StandaloneActionButton
            label="关闭窗口"
            onClick={() => closeStandaloneWindow(fallbackPath)}
          >
            <X size={16} />
          </StandaloneActionButton>
        </div>
      </header>

      {activeItemIndex > 0 ? (
        <ViewerNavButton
          label="上一张图片"
          side="left"
          onClick={() => navigateToItem(viewerItems[activeItemIndex - 1]!)}
        >
          <ChevronLeft size={22} />
        </ViewerNavButton>
      ) : null}
      {activeItemIndex < viewerItems.length - 1 ? (
        <ViewerNavButton
          label="下一张图片"
          side="right"
          onClick={() => navigateToItem(viewerItems[activeItemIndex + 1]!)}
        >
          <ChevronRight size={22} />
        </ViewerNavButton>
      ) : null}

      <div className="flex min-h-0 flex-1 items-center justify-center px-16 py-8">
        <img
          src={activeItem.imageUrl}
          alt={activeItem.title}
          className="max-h-full max-w-full rounded-[14px] object-contain shadow-[0_20px_64px_rgba(0,0,0,0.34)]"
        />
      </div>
    </div>
  );
}

function ViewerNavButton({
  children,
  label,
  onClick,
  side,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  side: "left" | "right";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[12px] border border-white/12 bg-[#2b2b2b] text-white transition hover:bg-[#343434] ${
        side === "left" ? "left-6" : "right-6"
      }`}
    >
      {children}
    </button>
  );
}

function StandaloneActionButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/12 bg-[#2b2b2b] text-white transition hover:bg-[#343434]"
      title={label}
    >
      {children}
    </button>
  );
}

function resolveConversationReturnPath(
  path: string | undefined,
  conversationPathSet: ReadonlySet<string>,
  shouldValidate: boolean,
) {
  const normalizedPath = path?.trim();
  if (!normalizedPath) {
    return undefined;
  }

  if (!shouldValidate) {
    return normalizedPath;
  }

  const hashIndex = normalizedPath.indexOf("#");
  const queryIndex = normalizedPath.indexOf("?");
  const cutIndex =
    hashIndex === -1
      ? queryIndex
      : queryIndex === -1
        ? hashIndex
        : Math.min(hashIndex, queryIndex);
  const basePath =
    cutIndex === -1 ? normalizedPath : normalizedPath.slice(0, cutIndex);

  return conversationPathSet.has(basePath) ? normalizedPath : undefined;
}

function closeStandaloneWindow(fallbackPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  closeCurrentWindow(() => {
    focusMainWindow(fallbackPath);
  });
}

function focusMainWindow(targetPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.location.assign(targetPath);
      window.opener.focus?.();
      closeCurrentWindow();
      return;
    }
  } catch {
    // Ignore opener access failures and fall back to local navigation.
  }

  window.location.assign(targetPath);
}

function closeCurrentWindow(onBlocked?: () => void) {
  window.close();

  if (!onBlocked) {
    return;
  }

  window.setTimeout(() => {
    if (!window.closed) {
      onBlocked();
    }
  }, 120);
}

function saveUrlAsFile(url: string, fileName: string) {
  if (typeof document === "undefined") {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function openPrintWindow(input: { title: string; imageUrl: string }) {
  if (typeof window === "undefined") {
    return false;
  }

  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    return false;
  }

  const escapedTitle = escapeHtml(input.title);
  const escapedImageUrl = escapeHtml(input.imageUrl);
  printWindow.document.write(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapedTitle}</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #1f1f1f;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }

      img {
        max-width: 100%;
        max-height: calc(100vh - 48px);
        object-fit: contain;
        box-shadow: 0 20px 52px rgba(0, 0, 0, 0.26);
      }
    </style>
  </head>
  <body>
    <img src="${escapedImageUrl}" alt="${escapedTitle}" />
  </body>
</html>`);
  printWindow.document.close();

  const printedImage = printWindow.document.querySelector(
    "img",
  ) as HTMLImageElement | null;
  if (printedImage) {
    printedImage.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  } else {
    printWindow.focus();
    printWindow.print();
  }

  return true;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
