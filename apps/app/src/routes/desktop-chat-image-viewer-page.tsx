import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  X,
} from "lucide-react";
import { Button } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import {
  buildDesktopChatImageViewerRouteHash,
  parseDesktopChatImageViewerRouteHash,
  readDesktopChatImageViewerSession,
  type DesktopChatImageViewerSessionItem,
} from "../features/desktop/chat/desktop-chat-image-viewer-route-state";

export function DesktopChatImageViewerPage() {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseDesktopChatImageViewerRouteHash(hash),
    [hash],
  );
  const sessionItems = useMemo(
    () =>
      routeState?.sessionId
        ? readDesktopChatImageViewerSession(routeState.sessionId)
        : [],
    [routeState?.sessionId],
  );
  const viewerItems = useMemo(() => {
    if (!routeState) {
      return [] as DesktopChatImageViewerSessionItem[];
    }

    if (sessionItems.length) {
      return sessionItems;
    }

    return [
      {
        id: routeState.activeId || "current-image",
        imageUrl: routeState.imageUrl,
        title: routeState.title,
        meta: routeState.meta,
        returnTo: routeState.returnTo,
      },
    ];
  }, [routeState, sessionItems]);
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
  const fallbackPath = activeItem?.returnTo ?? routeState?.returnTo ?? "/tabs/chat";

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

      if (event.key === "ArrowRight" && activeItemIndex < viewerItems.length - 1) {
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
      <div className="flex h-full min-h-0 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.92),rgba(8,15,28,1))] p-6">
        <div className="w-full max-w-lg rounded-[30px] border border-white/10 bg-[rgba(15,23,42,0.72)] p-8 shadow-[0_32px_80px_rgba(2,6,23,0.38)] backdrop-blur-xl">
          <EmptyState
            title="这张图片已经失去上下文"
            description="可能是新窗口参数被清掉了。回到消息页后重新打开一次即可。"
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => window.location.assign("/tabs/chat")}
              className="rounded-2xl"
            >
              回到消息页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.92),rgba(8,15,28,1))] text-white">
      <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-medium">
            {activeItem.title}
          </div>
          {activeItem.meta ? (
            <div className="mt-1 truncate text-[12px] text-white/68">
              {activeItem.meta}
            </div>
          ) : null}
          <div className="mt-1 text-[12px] text-white/52">
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
          {activeItem.returnTo ? (
            <StandaloneActionButton
              label="定位到聊天位置"
              onClick={() => window.location.assign(activeItem.returnTo!)}
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

      <div className="flex min-h-0 flex-1 items-center justify-center px-20 py-8">
        <img
          src={activeItem.imageUrl}
          alt={activeItem.title}
          className="max-h-full max-w-full rounded-[24px] object-contain shadow-[0_32px_88px_rgba(2,6,23,0.46)]"
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
      className={`absolute top-1/2 z-10 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/18 ${
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
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-white/10 text-white transition hover:bg-white/18"
      title={label}
    >
      {children}
    </button>
  );
}

function closeStandaloneWindow(fallbackPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (window.opener && !window.opener.closed) {
    window.close();
    return;
  }

  window.location.assign(fallbackPath);
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
        background: #0f172a;
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
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
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
