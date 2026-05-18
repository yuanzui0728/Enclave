import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
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
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import {
  buildDesktopChatImageViewerRouteHash,
  hydrateDesktopChatImageViewerSessionsFromNative,
  parseDesktopChatImageViewerRouteHash,
  readDesktopChatImageViewerSession,
  type DesktopChatImageViewerSessionItem,
} from "../features/chat/chat-image-viewer-route-state";
import {
  parseDesktopChatRouteHash,
} from "../features/desktop/chat/desktop-chat-route-state";
import {
  parseDesktopChatWindowRouteHash,
} from "../features/desktop/chat/desktop-chat-window-route-state";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { resolveDesktopWindowReturnTarget } from "../lib/desktop-window-return-target";
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
  const t = useRuntimeTranslator();
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

  // 走查新一轮 R2：handleImageSave 是 fire-and-forget，无任何同步锁。两条路径
  // 都会触发它：
  // · 顶栏「保存」按钮 onClick
  // · Cmd/Ctrl+S 键盘快捷（line 下方 keydown handler）
  // 同帧 <16ms double-click 同一按钮，或按住 Cmd 然后连按两下 S，saveRemoteFile
  // 走 Tauri/native 实现时弹出 2 个文件保存对话框堆叠（webview 阻塞型 dialog 在
  // Tauri 里被 spawn 两次），web fallback 走 anchor download 也会触发 2 次下载
  // （文件名后缀 -1 / 浏览器去重表现不稳）。和姊妹 chat-message-list R4 / R5
  // 同款 sync ref 锁；按 url 上锁，不同图片互不影响（连切前/后图各自保存合法）。
  const savingImageUrlsRef = useRef<Set<string>>(new Set());
  const handleImageSave = useCallback((input: { url: string; fileName: string }) => {
    if (savingImageUrlsRef.current.has(input.url)) {
      return;
    }
    savingImageUrlsRef.current.add(input.url);
    void saveRemoteFile({
      url: input.url,
      fileName: input.fileName,
      kind: "image",
      dialogTitle: t(msg`保存图片`),
    })
      .then((result) => {
        if (result.status === "cancelled") {
          return;
        }

        const canRevealSavedFile =
          result.status === "saved" && Boolean(result.savedPath?.trim());
        const savedPath = canRevealSavedFile ? result.savedPath!.trim() : null;

        setSaveNotice({
          message: result.message,
          tone: result.status === "failed" ? "danger" : "success",
          actionLabel: canRevealSavedFile ? t(msg`打开位置`) : undefined,
          onAction:
            savedPath
              ? () => {
                  void revealSavedFile(savedPath).then((revealed) => {
                    setSaveNotice({
                      message: revealed
                        ? t(msg`已打开所在位置。`)
                        : t(msg`打开所在位置失败，请稍后再试。`),
                      tone: revealed ? "success" : "danger",
                    });
                  });
                }
              : undefined,
        });
      })
      .finally(() => {
        savingImageUrlsRef.current.delete(input.url);
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
    if (!routeState || !activeItem || !sessionItems.length) {
      return;
    }

    const nextHash = buildDesktopChatImageViewerRouteHash({
      imageUrl: activeItem.imageUrl,
      title: activeItem.title,
      meta: activeItem.meta,
      returnTo: activeItem.returnTo,
      sessionId: routeState.sessionId,
      activeId: activeItem.id,
      printToken: routeState.printToken,
    });
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;

    if (normalizedHash === nextHash) {
      return;
    }

    void navigate({
      to: "/desktop/chat-image-viewer",
      hash: nextHash,
      replace: true,
    });
  }, [
    activeItem,
    hash,
    navigate,
    routeState,
    sessionItems.length,
  ]);

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
            title={t(msg`这张图片已经失去上下文`)}
            description={t(msg`可能是新窗口参数被清掉了。回到消息页后重新打开一次即可。`)}
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => focusReturnTargetWindow(fallbackPath)}
              className="h-9 rounded-[9px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
            >
              {t(msg`回到消息页`)}
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
            label={t(msg`保存图片`)}
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
            label={t(msg`打印图片`)}
            onClick={() => requestCurrentWindowPrint()}
          >
            <Printer size={16} />
          </StandaloneActionButton>
          {activeItemReturnTo ? (
            <StandaloneActionButton
              label={t(msg`定位到聊天位置`)}
              onClick={() => focusReturnTargetWindow(activeItemReturnTo)}
            >
              <ArrowLeft size={16} />
            </StandaloneActionButton>
          ) : null}
          <StandaloneActionButton
            label={t(msg`关闭窗口`)}
            onClick={() => closeStandaloneWindow(fallbackPath)}
          >
            <X size={16} />
          </StandaloneActionButton>
        </div>
      </header>

      {activeItemIndex > 0 ? (
        <ViewerNavButton
          label={t(msg`上一张图片`)}
          side="left"
          onClick={() => navigateToItem(viewerItems[activeItemIndex - 1]!)}
          className="yj-desktop-image-print-hidden"
        >
          <ChevronLeft size={22} />
        </ViewerNavButton>
      ) : null}
      {activeItemIndex < viewerItems.length - 1 ? (
        <ViewerNavButton
          label={t(msg`下一张图片`)}
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
          // 走查电脑端单聊 R92：和姊妹 R88 chat-message-list 内全屏 viewer
          // <img> 同款修法。这是「在独立窗口打开图片」开出来的 standalone
          // window 主 <img>，src 是消息原图 (常见 1-5MB 手机直出)。
          // 1) decoding="async"——浏览器默认同步在主线程 decode 才渲染，独
          //    立窗口打开瞬间整页冻 100-300ms（用户从 chat 消息列表 / 文件页
          //    点「在独立窗口打开」会有可见的"窗口黑屏几百 ms 再出图"）。
          //    自动打印路径 (line 380-389) 已经在等 image load 事件，async
          //    decode 不影响 onload 时机。
          // 2) draggable={false}——viewer 顶栏「保存图片」走 saveRemoteFile，
          //    用户在 viewer 里按住图想缩放 / 拖到 chrome 下载位置时浏览器
          //    默认会触发 HTML5 native drag (图片 URL)，drag start 后顶栏
          //    按钮的 click 不 fire；ArrowLeft/Right 键盘导航也在 image 上
          //    focus 时被 drag handler 拦掉。和姊妹 chat-message-list R88
          //    / chat-composer 5407 / sticker-img 一批已挂的同款。
          decoding="async"
          draggable={false}
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

  const resolvedTarget = resolveDesktopWindowReturnTarget(targetPath);
  if (resolvedTarget.standaloneWindowLabel) {
    const focusedStandalone = await focusStandaloneDesktopWindow(
      resolvedTarget.standaloneWindowLabel,
      targetPath,
    );
    if (focusedStandalone) {
      void closeCurrentDesktopWindow();
      return;
    }
  }

  const nextMainWindowPath = resolvedTarget.mainWindowPath || targetPath;

  void focusMainDesktopWindow(nextMainWindowPath).then((focused) => {
    if (focused) {
      void closeCurrentDesktopWindow();
      return;
    }

    try {
      if (window.opener && !window.opener.closed) {
        window.opener.location.assign(nextMainWindowPath);
        window.opener.focus?.();
        closeCurrentWindow();
        return;
      }
    } catch {
      // Ignore opener access failures and fall back to local navigation.
    }

    window.location.assign(nextMainWindowPath);
  });
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
