import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { Button, InlineNotice } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import {
  buildDesktopChatImageViewerRouteHash,
  hydrateDesktopChatImageViewerSessionsFromNative,
  parseDesktopChatImageViewerRouteHash,
  readDesktopChatImageViewerSession,
  type DesktopChatImageViewerSessionItem,
} from "../features/desktop/chat/desktop-chat-image-viewer-route-state";
import {
  parseDesktopChatRouteHash,
} from "../features/desktop/chat/desktop-chat-route-state";
import {
  buildDesktopChatWindowLabel,
  parseDesktopChatWindowRouteHash,
} from "../features/desktop/chat/desktop-chat-window-route-state";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import {
  closeCurrentDesktopWindow,
  DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
  focusStandaloneDesktopWindow,
  focusMainDesktopWindow,
  shouldNavigateCurrentWindow,
  type DesktopStandaloneWindowNavigatePayload,
} from "../runtime/desktop-windowing";
import { revealSavedFile } from "../runtime/reveal-saved-file";
import { saveRemoteFile } from "../runtime/save-remote-file";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DesktopChatImageViewerPage() {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopShell = runtimeConfig.appPlatform === "desktop";
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
  const [sessionItems, setSessionItems] = useState<
    DesktopChatImageViewerSessionItem[]
  >(
    () =>
      routeState?.sessionId
        ? readDesktopChatImageViewerSession(routeState.sessionId)
        : [],
  );
  const routeReturnTo = useMemo(
    () =>
      resolveChatImageViewerReturnPath(
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
      returnTo: resolveChatImageViewerReturnPath(
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
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const autoPrintTokenRef = useRef<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<{
    message: string;
    tone: "success" | "danger";
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  useEffect(() => {
    const sessionId = routeState?.sessionId;
    if (!sessionId) {
      setSessionItems([]);
      return;
    }

    setSessionItems(readDesktopChatImageViewerSession(sessionId));
    if (!nativeDesktopShell) {
      return;
    }

    let cancelled = false;

    void hydrateDesktopChatImageViewerSessionsFromNative().then(() => {
      if (cancelled) {
        return;
      }

      setSessionItems(readDesktopChatImageViewerSession(sessionId));
    });

    return () => {
      cancelled = true;
    };
  }, [nativeDesktopShell, routeState?.sessionId]);

  const requestCurrentWindowPrint = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }

    window.print();
    return true;
  }, []);

  const handleImageSave = useCallback((input: { url: string; fileName: string }) => {
    void saveRemoteFile({
      url: input.url,
      fileName: input.fileName,
      kind: "image",
      dialogTitle: "保存图片",
    }).then((result) => {
      if (result.status === "cancelled") {
        return;
      }

      const canRevealSavedFile =
        result.status === "saved" && Boolean(result.savedPath?.trim());
      const savedPath = canRevealSavedFile ? result.savedPath!.trim() : null;

      setSaveNotice({
        message: result.message,
        tone: result.status === "failed" ? "danger" : "success",
        actionLabel: canRevealSavedFile ? "打开位置" : undefined,
        onAction:
          savedPath
            ? () => {
                void revealSavedFile(savedPath).then((revealed) => {
                  setSaveNotice({
                    message: revealed
                      ? "已打开所在位置。"
                      : "打开所在位置失败，请稍后再试。",
                    tone: revealed ? "success" : "danger",
                  });
                });
              }
            : undefined,
      });
    });
  }, []);

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
          closeStandaloneWindow(fallbackPath);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleImageSave({
          url: activeItem.imageUrl,
          fileName: activeItem.title,
        });
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        requestCurrentWindowPrint();
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
  }, [
    activeItem,
    activeItemIndex,
    fallbackPath,
    handleImageSave,
    navigateToItem,
    requestCurrentWindowPrint,
    viewerItems,
  ]);

  useEffect(() => {
    if (
      !routeState?.printToken ||
      !activeItem ||
      typeof window === "undefined"
    ) {
      return;
    }

    if (autoPrintTokenRef.current === routeState.printToken) {
      return;
    }

    const currentImageElement = imageElementRef.current;
    const triggerPrint = () => {
      autoPrintTokenRef.current = routeState.printToken ?? null;
      window.setTimeout(() => {
        requestCurrentWindowPrint();
      }, 80);
    };

    if (currentImageElement && !currentImageElement.complete) {
      currentImageElement.addEventListener("load", triggerPrint, {
        once: true,
      });
      return () => {
        currentImageElement.removeEventListener("load", triggerPrint);
      };
    }

    triggerPrint();
  }, [activeItem, requestCurrentWindowPrint, routeState?.printToken]);

  useEffect(() => {
    if (!saveNotice) {
      return;
    }

    const timer = window.setTimeout(
      () => setSaveNotice(null),
      saveNotice.actionLabel ? 5000 : 2200,
    );
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  useEffect(() => {
    if (!nativeDesktopShell) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    async function bindStandaloneWindowNavigation() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();

        unlisten =
          await currentWindow.listen<DesktopStandaloneWindowNavigatePayload>(
            DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
            ({ payload }) => {
              const nextTarget = payload.targetPath.trim();
              if (shouldNavigateCurrentWindow(nextTarget)) {
                window.location.assign(nextTarget);
                return;
              }

              if (typeof window !== "undefined") {
                window.focus();
              }
            },
          );

        if (cancelled) {
          unlisten?.();
          unlisten = null;
        }
      } catch {
        // Ignore event binding failures outside the native Tauri shell.
      }
    }

    void bindStandaloneWindowNavigation();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [nativeDesktopShell]);

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
              onClick={() => focusReturnTargetWindow(fallbackPath)}
              className="h-9 rounded-[9px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
            >
              回到消息页
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="yj-desktop-image-print-root relative flex h-full min-h-0 flex-col bg-[#1f1f1f] text-white">
      <style>{`
        @media print {
          .yj-desktop-image-print-root {
            background: #ffffff !important;
            color: #111111 !important;
            min-height: auto !important;
          }

          .yj-desktop-image-print-hidden {
            display: none !important;
          }

          .yj-desktop-image-print-stage {
            display: flex !important;
            min-height: auto !important;
            padding: 0 !important;
            align-items: center !important;
            justify-content: center !important;
            background: #ffffff !important;
          }

          .yj-desktop-image-print-stage img {
            max-width: 100% !important;
            max-height: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      <header className="yj-desktop-image-print-hidden flex items-start justify-between gap-4 border-b border-white/8 bg-[#242424] px-5 py-4">
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
            onClick={() => {
              handleImageSave({
                url: activeItem.imageUrl,
                fileName: activeItem.title,
              });
            }}
          >
            <Download size={16} />
          </StandaloneActionButton>
          <StandaloneActionButton
            label="打印图片"
            onClick={() => requestCurrentWindowPrint()}
          >
            <Printer size={16} />
          </StandaloneActionButton>
          {activeItemReturnTo ? (
            <StandaloneActionButton
              label="定位到聊天位置"
              onClick={() => focusReturnTargetWindow(activeItemReturnTo)}
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
          className="yj-desktop-image-print-hidden"
        >
          <ChevronLeft size={22} />
        </ViewerNavButton>
      ) : null}
      {activeItemIndex < viewerItems.length - 1 ? (
        <ViewerNavButton
          label="下一张图片"
          side="right"
          onClick={() => navigateToItem(viewerItems[activeItemIndex + 1]!)}
          className="yj-desktop-image-print-hidden"
        >
          <ChevronRight size={22} />
        </ViewerNavButton>
      ) : null}

      {saveNotice ? (
        <div className="yj-desktop-image-print-hidden px-5 pt-3">
          <InlineNotice
            className="flex items-center justify-between gap-3 text-xs"
            tone={saveNotice.tone}
          >
            <span>{saveNotice.message}</span>
            {saveNotice.actionLabel && saveNotice.onAction ? (
              <InlineNoticeActionButton
                label={saveNotice.actionLabel}
                onClick={saveNotice.onAction}
              />
            ) : null}
          </InlineNotice>
        </div>
      ) : null}

      <div className="yj-desktop-image-print-stage flex min-h-0 flex-1 items-center justify-center px-16 py-8">
        <img
          ref={imageElementRef}
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
  className,
  label,
  onClick,
  side,
}: {
  children: ReactNode;
  className?: string;
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
      } ${className ?? ""}`}
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

function resolveChatImageViewerReturnPath(
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

  if (basePath === "/desktop/chat-window") {
    const standaloneWindowRouteState = parseDesktopChatWindowRouteHash(
      hashIndex === -1 ? "" : normalizedPath.slice(hashIndex),
    );

    if (!standaloneWindowRouteState) {
      return undefined;
    }

    const conversationPath =
      standaloneWindowRouteState.conversationType === "group"
        ? `/group/${standaloneWindowRouteState.conversationId}`
        : `/chat/${standaloneWindowRouteState.conversationId}`;

    return conversationPathSet.has(conversationPath) ? normalizedPath : undefined;
  }

  if (basePath === "/tabs/chat") {
    const desktopChatRouteState = parseDesktopChatRouteHash(
      hashIndex === -1 ? "" : normalizedPath.slice(hashIndex),
    );
    if (!desktopChatRouteState.conversationId) {
      return normalizedPath;
    }

    const hasConversation =
      conversationPathSet.has(`/chat/${desktopChatRouteState.conversationId}`) ||
      conversationPathSet.has(`/group/${desktopChatRouteState.conversationId}`);

    return hasConversation ? normalizedPath : undefined;
  }

  return conversationPathSet.has(basePath) ? normalizedPath : undefined;
}

function closeStandaloneWindow(fallbackPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  void closeCurrentDesktopWindow().then((closed) => {
    if (closed) {
      return;
    }

    closeCurrentWindow(() => {
      focusMainWindow(fallbackPath);
    });
  });
}

function focusMainWindow(targetPath: string) {
  void focusReturnTargetWindow(targetPath);
}

async function focusReturnTargetWindow(targetPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  const standaloneWindowLabel = resolveStandaloneChatWindowLabel(targetPath);
  if (standaloneWindowLabel) {
    const focusedStandalone = await focusStandaloneDesktopWindow(
      standaloneWindowLabel,
      targetPath,
    );
    if (focusedStandalone) {
      void closeCurrentDesktopWindow();
      return;
    }
  }

  void focusMainDesktopWindow(targetPath).then((focused) => {
    if (focused) {
      void closeCurrentDesktopWindow();
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
  });
}

function resolveStandaloneChatWindowLabel(targetPath: string) {
  const normalizedPath = targetPath.trim();
  if (!normalizedPath) {
    return null;
  }

  const hashIndex = normalizedPath.indexOf("#");
  const basePath =
    hashIndex === -1 ? normalizedPath : normalizedPath.slice(0, hashIndex);

  if (basePath !== "/desktop/chat-window") {
    return null;
  }

  const routeState = parseDesktopChatWindowRouteHash(
    hashIndex === -1 ? "" : normalizedPath.slice(hashIndex),
  );
  if (!routeState) {
    return null;
  }

  return buildDesktopChatWindowLabel(routeState.conversationId);
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
