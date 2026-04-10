import { useEffect, useMemo, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Download, Printer, X } from "lucide-react";
import { Button } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { parseDesktopChatImageViewerRouteHash } from "../features/desktop/chat/desktop-chat-image-viewer-route-state";

export function DesktopChatImageViewerPage() {
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseDesktopChatImageViewerRouteHash(hash),
    [hash],
  );

  const fallbackPath = routeState?.returnTo ?? "/tabs/chat";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!routeState) {
        if (event.key === "Escape") {
          event.preventDefault();
          window.location.assign(fallbackPath);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveUrlAsFile(routeState.imageUrl, routeState.title);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        openPrintWindow({
          title: routeState.title,
          imageUrl: routeState.imageUrl,
        });
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeStandaloneWindow(fallbackPath);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fallbackPath, routeState]);

  if (!routeState) {
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
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.92),rgba(8,15,28,1))] text-white">
      <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
        <div className="min-w-0">
          <div className="truncate text-[16px] font-medium">
            {routeState.title}
          </div>
          {routeState.meta ? (
            <div className="mt-1 truncate text-[12px] text-white/68">
              {routeState.meta}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <StandaloneActionButton
            label="保存图片"
            onClick={() => saveUrlAsFile(routeState.imageUrl, routeState.title)}
          >
            <Download size={16} />
          </StandaloneActionButton>
          <StandaloneActionButton
            label="打印图片"
            onClick={() =>
              openPrintWindow({
                title: routeState.title,
                imageUrl: routeState.imageUrl,
              })
            }
          >
            <Printer size={16} />
          </StandaloneActionButton>
          {routeState.returnTo ? (
            <StandaloneActionButton
              label="定位到聊天位置"
              onClick={() => window.location.assign(routeState.returnTo!)}
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

      <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-8">
        <img
          src={routeState.imageUrl}
          alt={routeState.title}
          className="max-h-full max-w-full rounded-[24px] object-contain shadow-[0_32px_88px_rgba(2,6,23,0.46)]"
        />
      </div>
    </div>
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
