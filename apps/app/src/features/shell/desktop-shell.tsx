import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PropsWithChildren,
} from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Camera,
  Clock3,
  Copy,
  LockKeyhole,
  MessageSquareText,
  Minus,
  ShieldCheck,
  X,
} from "lucide-react";
import { getOrCreateConversation, listCharacters } from "@yinjie/contracts";
import { Button, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { recordAppNavigation } from "../../lib/history-back";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  DESKTOP_MAIN_WINDOW_NAVIGATE_EVENT,
  shouldNavigateCurrentWindow,
  type DesktopMainWindowNavigatePayload,
} from "../../runtime/desktop-windowing";
import { useWorldOwnerStore } from "../../store/world-owner-store";
import { formatTimestamp } from "../../lib/format";
import { hydrateDesktopFavoritesFromNative } from "../desktop/favorites/desktop-favorites-storage";
import { buildDesktopChatThreadPath } from "../desktop/chat/desktop-chat-route-state";
import {
  desktopBottomNavItems,
  desktopMoreMenuItems,
  desktopPrimaryNavItems,
  isDesktopNavItemActive,
  type DesktopNavActionItem,
} from "./desktop-nav-config";
import {
  clearDesktopLocked,
  hydrateDesktopLockSnapshotFromNative,
  readDesktopLockSnapshot,
  saveDesktopLockPasscode,
  setDesktopLocked,
  verifyDesktopLockPasscode,
} from "./desktop-lock-storage";

type DesktopWindowHandle = {
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  minimize: () => Promise<void>;
  onResized: (handler: () => void) => Promise<() => void>;
  startDragging: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
};

async function resolveDesktopWindowHandle(): Promise<DesktopWindowHandle | null> {
  try {
    const [{ invoke }, { getCurrentWindow }] = await Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/api/window"),
    ]);
    const currentWindow = getCurrentWindow();

    return {
      close: async () => {
        try {
          await currentWindow.close();
        } catch {
          await invoke("desktop_window_close");
        }
      },
      isMaximized: async () => {
        try {
          return await currentWindow.isMaximized();
        } catch {
          return await invoke<boolean>("desktop_window_is_maximized");
        }
      },
      minimize: async () => {
        try {
          await currentWindow.minimize();
        } catch {
          await invoke("desktop_window_minimize");
        }
      },
      onResized: async (handler) => {
        try {
          return await currentWindow.onResized(() => {
            handler();
          });
        } catch {
          return () => {};
        }
      },
      startDragging: async () => {
        try {
          await currentWindow.startDragging();
        } catch {
          await invoke("desktop_window_drag");
        }
      },
      toggleMaximize: async () => {
        try {
          await currentWindow.toggleMaximize();
        } catch {
          await invoke("desktop_window_toggle_maximize");
        }
      },
    };
  } catch {
    return null;
  }
}

export function DesktopShell({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const standaloneDesktopRoute = isStandaloneDesktopRoute(pathname);
  const profileRouteActive = isDesktopProfileRoute(pathname);
  const runtimeConfig = useAppRuntimeConfig();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerSignature = useWorldOwnerStore((state) => state.signature);
  const appTitle = runtimeConfig.publicAppName.trim() || "Yinjie";
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeDesktopShell = runtimeConfig.appPlatform === "desktop";
  const [desktopWindow, setDesktopWindow] =
    useState<DesktopWindowHandle | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isOwnerCardOpen, setIsOwnerCardOpen] = useState(false);
  const [isOpeningSelfConversation, setIsOpeningSelfConversation] =
    useState(false);
  const [ownerCardNotice, setOwnerCardNotice] = useState<string | null>(null);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(
    () => readDesktopLockSnapshot().isLocked,
  );
  const [lockMode, setLockMode] = useState<"unlock" | "setup">(() =>
    readDesktopLockSnapshot().passcodeDigest ? "unlock" : "setup",
  );
  const [lockedAt, setLockedAt] = useState<string | null>(
    () => readDesktopLockSnapshot().lockedAt,
  );
  const [favoritesStoreReady, setFavoritesStoreReady] =
    useState(!nativeDesktopShell);
  const [lockPasscodeLength, setLockPasscodeLength] = useState<number | null>(
    () => readDesktopLockSnapshot().passcodeLength,
  );
  const [lockStoreReady, setLockStoreReady] = useState(!nativeDesktopShell);
  const [unlockPasscode, setUnlockPasscode] = useState("");
  const [setupPasscode, setSetupPasscode] = useState("");
  const [setupPasscodeConfirm, setSetupPasscodeConfirm] = useState("");
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockNotice, setLockNotice] = useState<string | null>(null);

  useEffect(() => {
    recordAppNavigation(`${pathname}${search}${hash}`);
  }, [hash, pathname, search]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.classList.add("yj-desktop-window");
    document.body.classList.add("yj-desktop-window");

    return () => {
      document.documentElement.classList.remove("yj-desktop-window");
      document.body.classList.remove("yj-desktop-window");
    };
  }, []);

  useEffect(() => {
    if (!nativeDesktopShell) {
      setFavoritesStoreReady(true);
      setLockStoreReady(true);
      setDesktopWindow(null);
      setIsMaximized(false);
      return;
    }

    let cancelled = false;
    let unlistenResize: (() => void) | null = null;

    async function bindDesktopWindow() {
      const currentWindow = await resolveDesktopWindowHandle();

      if (cancelled || !currentWindow) {
        return;
      }

      setDesktopWindow(currentWindow);

      const syncMaximizedState = async () => {
        try {
          const nextValue = await currentWindow.isMaximized();
          if (!cancelled) {
            setIsMaximized(nextValue);
          }
        } catch {
          if (!cancelled) {
            setIsMaximized(false);
          }
        }
      };

      await syncMaximizedState();
      unlistenResize = await currentWindow.onResized(() => {
        void syncMaximizedState();
      });
    }

    void bindDesktopWindow();

    return () => {
      cancelled = true;
      setDesktopWindow(null);
      unlistenResize?.();
    };
  }, [nativeDesktopShell]);

  useEffect(() => {
    if (!nativeDesktopShell) {
      return;
    }

    let cancelled = false;

    const syncDesktopLockSnapshot = async () => {
      const snapshot = await hydrateDesktopLockSnapshotFromNative();
      if (cancelled) {
        return;
      }

      setIsLocked(snapshot.isLocked);
      setLockMode(snapshot.passcodeDigest ? "unlock" : "setup");
      setLockedAt(snapshot.lockedAt);
      setLockPasscodeLength(snapshot.passcodeLength);
      setLockStoreReady(true);
    };

    const handleFocus = () => {
      void syncDesktopLockSnapshot();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncDesktopLockSnapshot();
      }
    };

    void syncDesktopLockSnapshot();

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [nativeDesktopShell]);

  useEffect(() => {
    if (!nativeDesktopShell) {
      return;
    }

    let cancelled = false;

    const syncDesktopFavorites = async () => {
      await hydrateDesktopFavoritesFromNative();
      if (cancelled) {
        return;
      }

      setFavoritesStoreReady(true);
    };

    void syncDesktopFavorites();

    return () => {
      cancelled = true;
    };
  }, [nativeDesktopShell]);

  useEffect(() => {
    if (!nativeDesktopShell) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    async function bindMainWindowNavigation() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();

        unlisten = await currentWindow.listen<DesktopMainWindowNavigatePayload>(
          DESKTOP_MAIN_WINDOW_NAVIGATE_EVENT,
          ({ payload }) => {
            const nextTarget = payload.targetPath?.trim();
            if (nextTarget && shouldNavigateCurrentWindow(nextTarget)) {
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

    void bindMainWindowNavigation();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [nativeDesktopShell]);

  useEffect(() => {
    setIsMoreMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setIsOwnerCardOpen(false);
    setOwnerCardNotice(null);
  }, [pathname]);

  useEffect(() => {
    if (!lockNotice) {
      return;
    }

    const timer = window.setTimeout(() => setLockNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [lockNotice]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox']",
        )
      ) {
        return;
      }

      if (isLocked) {
        return;
      }

      const withCommand = event.metaKey || event.ctrlKey;
      if (!withCommand) {
        if (event.key === "Escape") {
          setIsMoreMenuOpen(false);
          setIsOwnerCardOpen(false);
          setOwnerCardNotice(null);
        }
        return;
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        void navigate({ to: "/tabs/search" });
        return;
      }

      if (event.key === ",") {
        event.preventDefault();
        void navigate({ to: "/desktop/settings" });
        return;
      }

      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        openDesktopLock();
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        void navigate({ to: "/desktop/chat-files" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLocked, navigate]);

  const shellInsetClass = nativeDesktopShell
    ? "rounded-none"
    : "m-2 rounded-[20px]";

  const handleTitleBarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !desktopWindow) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target?.closest("button, a, input, textarea, select, [role='button']")
    ) {
      return;
    }

    void desktopWindow.startDragging();
  };

  const openDesktopLock = () => {
    const snapshot = setDesktopLocked(true);

    setIsLocked(true);
    setLockedAt(snapshot.lockedAt);
    setLockPasscodeLength(snapshot.passcodeLength);
    setLockMode(snapshot.passcodeDigest ? "unlock" : "setup");
    setUnlockPasscode("");
    setSetupPasscode("");
    setSetupPasscodeConfirm("");
    setLockError(null);
    setLockNotice(null);
    setIsMoreMenuOpen(false);
    setIsOwnerCardOpen(false);
    setOwnerCardNotice(null);
  };

  const closeDesktopLock = () => {
    clearDesktopLocked();
    setIsLocked(false);
    setUnlockPasscode("");
    setSetupPasscode("");
    setSetupPasscodeConfirm("");
    setLockError(null);
    setLockNotice(null);
  };

  const submitUnlock = () => {
    if (!lockPasscodeLength) {
      closeDesktopLock();
      return;
    }

    if (!verifyDesktopLockPasscode(unlockPasscode)) {
      setLockError("口令不正确，请重新输入。");
      return;
    }

    closeDesktopLock();
  };

  const submitSetupLock = () => {
    const normalizedPasscode = setupPasscode.trim();
    const normalizedConfirm = setupPasscodeConfirm.trim();

    if (!/^\d{4,6}$/.test(normalizedPasscode)) {
      setLockError("请设置 4 到 6 位数字口令。");
      return;
    }

    if (normalizedPasscode !== normalizedConfirm) {
      setLockError("两次输入的口令不一致。");
      return;
    }

    const snapshot = saveDesktopLockPasscode(normalizedPasscode);
    setLockPasscodeLength(snapshot.passcodeLength);
    setLockMode("unlock");
    setUnlockPasscode("");
    setSetupPasscode("");
    setSetupPasscodeConfirm("");
    setLockError(null);
    setLockNotice("桌面锁定口令已设置，请输入口令解锁。");
  };

  const openMomentsShortcut = () => {
    setOwnerCardNotice(null);
    setIsOwnerCardOpen(false);
    void navigate({ to: "/tabs/moments" });
  };

  const openSelfConversationShortcut = async () => {
    if (!ownerId || isOpeningSelfConversation) {
      return;
    }

    setOwnerCardNotice(null);
    setIsOpeningSelfConversation(true);

    try {
      const characters = await listCharacters(baseUrl);
      const selfCharacter = characters.find(
        (item) =>
          item.relationshipType === "self" || item.sourceKey?.trim() === "self",
      );

      if (!selfCharacter) {
        throw new Error("当前世界还没有“我自己”角色。");
      }

      const conversation = await getOrCreateConversation(
        { characterId: selfCharacter.id },
        baseUrl,
      );

      setIsOwnerCardOpen(false);
      void navigate({
        to: buildDesktopChatThreadPath({
          conversationId: conversation.id,
        }),
      });
    } catch (error) {
      setOwnerCardNotice(
        error instanceof Error ? error.message : "打开会话失败，请稍后再试。",
      );
    } finally {
      setIsOpeningSelfConversation(false);
    }
  };

  if (nativeDesktopShell && (!lockStoreReady || !favoritesStoreReady)) {
    return null;
  }

  return (
    <div className="h-screen overflow-hidden bg-transparent text-[color:var(--text-primary)]">
      <div
        className={cn(
          nativeDesktopShell
            ? "relative flex h-screen flex-col overflow-hidden bg-[color:var(--bg-canvas)]"
            : "relative flex h-[calc(100vh-16px)] flex-col overflow-hidden border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] shadow-[var(--shadow-shell)]",
          shellInsetClass,
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[-8%] top-0 h-56 w-56 rounded-full bg-[rgba(7,193,96,0.12)] blur-3xl" />
          <div className="absolute right-[-4%] top-[10%] h-48 w-48 rounded-full bg-[rgba(56,189,248,0.08)] blur-3xl" />
          <div className="absolute bottom-[-6%] left-1/3 h-44 w-44 rounded-full bg-[rgba(148,163,184,0.08)] blur-3xl" />
        </div>

        {nativeDesktopShell && !standaloneDesktopRoute ? (
          <header className="relative z-10 flex h-14 shrink-0 items-center gap-3 border-b border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.74)] px-4 backdrop-blur-xl">
            <div
              className={cn(
                "flex min-w-0 flex-1 select-none items-center gap-3",
                nativeDesktopShell ? "cursor-grab active:cursor-grabbing" : "",
              )}
              data-tauri-drag-region={nativeDesktopShell ? "" : undefined}
              onMouseDown={handleTitleBarMouseDown}
              onDoubleClick={() => {
                if (!nativeDesktopShell || !desktopWindow) {
                  return;
                }

                void desktopWindow.toggleMaximize();
              }}
            >
              <div className="flex min-w-0 items-center gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.88)] px-3 py-1.5 shadow-[var(--shadow-soft)]">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[color:var(--brand-primary)] [background-image:var(--brand-gradient)] text-[13px] font-semibold text-[color:var(--text-on-brand)]">
                  隐
                </div>
                <div className="min-w-0 leading-none">
                  <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                    {appTitle}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[color:var(--text-muted)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-primary)]" />
                    <span className="truncate">
                      {ownerName?.trim() || "世界主人"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DesktopWindowButton
                label="Minimize"
                onClick={() => {
                  if (!desktopWindow) {
                    return;
                  }

                  void desktopWindow.minimize();
                }}
              >
                <Minus size={15} strokeWidth={1.8} />
              </DesktopWindowButton>
              <DesktopWindowButton
                label={isMaximized ? "Restore" : "Maximize"}
                onClick={() => {
                  if (!desktopWindow) {
                    return;
                  }

                  void desktopWindow.toggleMaximize();
                }}
              >
                <Copy size={14} strokeWidth={1.8} />
              </DesktopWindowButton>
              <DesktopWindowButton
                danger
                label="Close"
                onClick={() => {
                  if (!desktopWindow) {
                    return;
                  }

                  void desktopWindow.close();
                }}
              >
                <X size={14} strokeWidth={1.9} />
              </DesktopWindowButton>
            </div>
          </header>
        ) : null}

        <div
          className={cn(
            "relative z-10 flex min-h-0 flex-1",
            standaloneDesktopRoute ? undefined : "gap-3 p-3",
            nativeDesktopShell && !standaloneDesktopRoute ? "pt-2" : undefined,
          )}
        >
          {(isMoreMenuOpen || isOwnerCardOpen) && !standaloneDesktopRoute ? (
            <button
              type="button"
              aria-label="关闭浮层"
              onClick={() => {
                setIsMoreMenuOpen(false);
                setIsOwnerCardOpen(false);
                setOwnerCardNotice(null);
              }}
              className="absolute inset-0 z-20 cursor-default appearance-none border-0 bg-transparent p-0"
            />
          ) : null}

          {standaloneDesktopRoute ? null : (
            <aside className="hidden w-[92px] shrink-0 rounded-[20px] border border-white/8 bg-[rgba(41,47,50,0.96)] p-2 text-white shadow-[0_18px_32px_rgba(15,23,42,0.18)] lg:flex lg:flex-col">
              <div className="relative mb-2.5 flex justify-center">
                <button
                  type="button"
                  className={cn(
                    "group flex justify-center rounded-[14px] border-0 bg-transparent px-1.5 py-1 appearance-none",
                    isOwnerCardOpen || profileRouteActive
                      ? "bg-white/9 shadow-[0_8px_18px_rgba(15,23,42,0.14)]"
                      : undefined,
                  )}
                  aria-label="打开世界主人快捷卡片"
                  aria-expanded={isOwnerCardOpen}
                  onClick={() => {
                    setOwnerCardNotice(null);
                    setIsMoreMenuOpen(false);
                    setIsOwnerCardOpen((current) => !current);
                  }}
                >
                  <div
                    className={cn(
                      "rounded-[14px] border p-1.5 transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                      isOwnerCardOpen || profileRouteActive
                        ? "border-[rgba(7,193,96,0.28)] bg-[rgba(7,193,96,0.14)] shadow-[0_8px_20px_rgba(7,193,96,0.10)]"
                        : "border-transparent bg-white/5 group-hover:border-white/10 group-hover:bg-white/9",
                    )}
                  >
                    <AvatarChip
                      name={ownerName ?? "世界主人"}
                      src={ownerAvatar}
                      size="wechat"
                    />
                  </div>
                </button>

                {isOwnerCardOpen ? (
                  <DesktopOwnerQuickCard
                    ownerName={ownerName}
                    ownerAvatar={ownerAvatar}
                    ownerSignature={ownerSignature}
                    appTitle={appTitle}
                    notice={ownerCardNotice}
                    isOpeningSelfConversation={isOpeningSelfConversation}
                    onOpenMoments={openMomentsShortcut}
                    onOpenSelfConversation={() => {
                      void openSelfConversationShortcut();
                    }}
                  />
                ) : null}
              </div>

              <nav className="min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex flex-col gap-1.5 pb-2">
                  {desktopPrimaryNavItems.map((item) => (
                    <DesktopNavLink
                      key={item.to}
                      active={isDesktopNavItemActive(pathname, item)}
                      item={item}
                    />
                  ))}
                </div>
              </nav>

              <div className="relative mt-2.5 border-t border-white/10 pt-2.5">
                <div className="flex flex-col gap-1.5">
                  {desktopBottomNavItems.map((item) => (
                    <DesktopActionButton
                      key={item.action}
                      active={
                        item.action === "open-more-menu"
                          ? isMoreMenuOpen ||
                            isDesktopNavItemActive(pathname, item)
                          : isDesktopNavItemActive(pathname, item)
                      }
                      item={item}
                      onClick={() => {
                        if (item.action === "open-mobile-panel") {
                          setIsOwnerCardOpen(false);
                          setOwnerCardNotice(null);
                          void navigate({ to: "/desktop/mobile" });
                          return;
                        }

                        setOwnerCardNotice(null);
                        setIsMoreMenuOpen((current) => !current);
                        setIsOwnerCardOpen(false);
                      }}
                    />
                  ))}
                </div>

                {isMoreMenuOpen ? (
                  <div className="absolute bottom-0 left-[calc(100%+0.75rem)] z-30 w-[232px] rounded-[18px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.97)] p-2 shadow-[var(--shadow-overlay)] backdrop-blur-xl">
                    <div className="px-3 pb-2 pt-2 text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                      更多功能
                    </div>
                    <div className="space-y-1">
                      {desktopMoreMenuItems.map((item) => (
                        <DesktopMoreMenuButton
                          key={item.action}
                          item={item}
                          onClick={() => {
                            handleDesktopAction(item.action);
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-2 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-2.5 text-[11px] leading-6 text-[color:var(--text-dim)]">
                      ⌘/Ctrl + K 搜索
                      <br />
                      ⌘/Ctrl + , 设置
                      <br />
                      ⌘/Ctrl + Shift + F 聊天文件
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>
          )}

          <main
            className={cn(
              "min-w-0 flex-1 overflow-hidden",
              standaloneDesktopRoute
                ? "bg-transparent"
                : "rounded-[20px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.86)] shadow-[var(--shadow-section)] backdrop-blur-xl",
            )}
          >
            {children}
          </main>
        </div>

        {isLocked ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(17,24,39,0.34)] p-6 backdrop-blur-md">
            <div className="w-full max-w-md rounded-[24px] border border-white/30 bg-[rgba(255,255,255,0.94)] p-8 shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(7,193,96,0.10)]">
                  <AvatarChip
                    name={ownerName ?? "世界主人"}
                    src={ownerAvatar}
                    size="wechat"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-semibold text-[color:var(--text-primary)]">
                    {lockMode === "setup" ? "设置桌面锁定口令" : "桌面已锁定"}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                    {ownerName ?? "世界主人"}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
                  {lockMode === "setup" ? (
                    <ShieldCheck
                      size={16}
                      className="text-[color:var(--brand-primary)]"
                    />
                  ) : (
                    <LockKeyhole
                      size={16}
                      className="text-[color:var(--brand-primary)]"
                    />
                  )}
                  <span>
                    {lockMode === "setup"
                      ? "首次锁定需要先设置本机口令"
                      : "输入本机口令后恢复桌面访问"}
                  </span>
                </div>
                <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
                  {lockMode === "setup"
                    ? "口令仅保存在当前浏览器或桌面客户端本地，用来阻止离开座位时工作区继续暴露。"
                    : lockPasscodeLength
                      ? `当前已启用 ${lockPasscodeLength} 位本地锁定口令。`
                      : "当前设备尚未保存锁定口令。"}
                </div>
                {lockedAt ? (
                  <div className="mt-3 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
                    <Clock3 size={14} />
                    <span>锁定时间 {formatTimestamp(lockedAt)}</span>
                  </div>
                ) : null}
              </div>

              {lockNotice ? (
                <div className="mt-4 rounded-[14px] bg-[rgba(7,193,96,0.10)] px-4 py-3 text-sm text-[#0b7a3b]">
                  {lockNotice}
                </div>
              ) : null}
              {lockError ? (
                <div className="mt-4 rounded-[14px] bg-[rgba(239,68,68,0.10)] px-4 py-3 text-sm text-[color:var(--state-danger-text)]">
                  {lockError}
                </div>
              ) : null}

              {lockMode === "setup" ? (
                <div className="mt-5 space-y-3">
                  <TextField
                    value={setupPasscode}
                    onChange={(event) => {
                      setSetupPasscode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      );
                      setLockError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitSetupLock();
                      }
                    }}
                    type="password"
                    inputMode="numeric"
                    placeholder="设置 4 到 6 位数字口令"
                    className="h-12 rounded-[14px] border-[color:var(--border-faint)] bg-white px-4 shadow-none"
                  />
                  <TextField
                    value={setupPasscodeConfirm}
                    onChange={(event) => {
                      setSetupPasscodeConfirm(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      );
                      setLockError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitSetupLock();
                      }
                    }}
                    type="password"
                    inputMode="numeric"
                    placeholder="再次输入口令确认"
                    className="h-12 rounded-[14px] border-[color:var(--border-faint)] bg-white px-4 shadow-none"
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={submitSetupLock}
                      className="rounded-[14px]"
                    >
                      设置口令并锁定
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeDesktopLock}
                      className="rounded-[14px]"
                    >
                      取消锁定
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <TextField
                    value={unlockPasscode}
                    onChange={(event) => {
                      setUnlockPasscode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      );
                      setLockError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitUnlock();
                      }
                    }}
                    type="password"
                    inputMode="numeric"
                    placeholder="输入桌面锁定口令"
                    className="h-12 rounded-[14px] border-[color:var(--border-faint)] bg-white px-4 shadow-none"
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={submitUnlock}
                      className="rounded-[14px]"
                    >
                      解锁继续使用
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  function handleDesktopAction(action: DesktopNavActionItem["action"]) {
    setIsMoreMenuOpen(false);
    setIsOwnerCardOpen(false);
    setOwnerCardNotice(null);

    if (action === "open-live-companion") {
      void navigate({ to: "/desktop/channels/live-companion" });
      return;
    }

    if (action === "open-chat-files") {
      void navigate({ to: "/desktop/chat-files" });
      return;
    }

    if (action === "open-chat-history") {
      void navigate({ to: "/desktop/chat-history" });
      return;
    }

    if (action === "open-feedback") {
      void navigate({ to: "/desktop/feedback" });
      return;
    }

    if (action === "open-settings") {
      void navigate({ to: "/desktop/settings" });
      return;
    }

    if (action === "lock") {
      openDesktopLock();
    }
  }
}

function isStandaloneDesktopRoute(pathname: string) {
  return (
    pathname === "/desktop/chat-image-viewer" ||
    pathname === "/desktop/chat-window" ||
    pathname === "/desktop/official-article-window" ||
    pathname === "/desktop/note-window"
  );
}

function isDesktopProfileRoute(pathname: string) {
  return (
    pathname.startsWith("/tabs/profile") ||
    pathname.startsWith("/desktop/settings") ||
    pathname.startsWith("/profile/settings") ||
    pathname.startsWith("/legal/")
  );
}

function DesktopOwnerQuickCard({
  ownerName,
  ownerAvatar,
  ownerSignature,
  appTitle,
  notice,
  isOpeningSelfConversation,
  onOpenMoments,
  onOpenSelfConversation,
}: {
  ownerName: string | null;
  ownerAvatar: string;
  ownerSignature: string;
  appTitle: string;
  notice: string | null;
  isOpeningSelfConversation: boolean;
  onOpenMoments: () => void;
  onOpenSelfConversation: () => void;
}) {
  return (
    <div className="absolute left-[calc(100%+0.75rem)] top-0 z-30 w-[286px] rounded-[22px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.98)] p-3 shadow-[var(--shadow-overlay)] backdrop-blur-xl">
      <div className="rounded-[18px] bg-[linear-gradient(180deg,rgba(7,193,96,0.12),rgba(255,255,255,0.92))] p-3.5">
        <div className="flex items-start gap-3">
          <AvatarChip
            name={ownerName ?? "世界主人"}
            src={ownerAvatar}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-[17px] font-semibold text-[color:var(--text-primary)]">
                {ownerName?.trim() || "世界主人"}
              </div>
              <div className="rounded-full bg-[rgba(7,193,96,0.12)] px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-[#15803d]">
                世界主人
              </div>
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-secondary)]">
              {appTitle}
            </div>
            <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
              {ownerSignature.trim() || "在现实之外，进入另一片世界。"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <DesktopOwnerShortcutButton
          icon={Camera}
          label="朋友圈"
          description="看看我最近发了什么"
          onClick={onOpenMoments}
        />
        <DesktopOwnerShortcutButton
          icon={MessageSquareText}
          label={isOpeningSelfConversation ? "打开中..." : "给自己发消息"}
          description="回到“我自己”单聊"
          onClick={onOpenSelfConversation}
          disabled={isOpeningSelfConversation}
        />
      </div>

      {notice ? (
        <div className="mt-3 rounded-[14px] border border-[rgba(255,159,10,0.24)] bg-[rgba(255,244,223,0.92)] px-3 py-2 text-[12px] leading-5 text-[#9a6700]">
          {notice}
        </div>
      ) : null}
    </div>
  );
}

function DesktopOwnerShortcutButton({
  icon: Icon,
  label,
  description,
  onClick,
  disabled = false,
}: {
  icon: typeof Camera;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[92px] flex-col items-start rounded-[16px] border bg-transparent px-3 py-3 text-left appearance-none transition-[transform,background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        disabled
          ? "cursor-wait border-[color:var(--border-faint)] bg-[rgba(148,163,184,0.08)] text-[color:var(--text-muted)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)] hover:-translate-y-[1px] hover:border-[rgba(7,193,96,0.2)] hover:bg-[rgba(7,193,96,0.08)] hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)]",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-[12px]",
          disabled
            ? "bg-[rgba(148,163,184,0.16)]"
            : "bg-[rgba(7,193,96,0.12)] text-[#15803d]",
        )}
      >
        <Icon size={18} />
      </div>
      <div className="mt-3 text-[14px] font-medium">{label}</div>
      <div className="mt-1 text-[12px] leading-5 text-[color:var(--text-secondary)]">
        {description}
      </div>
    </button>
  );
}

function DesktopWindowButton({
  children,
  danger = false,
  label,
  onClick,
}: PropsWithChildren<{
  danger?: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-[10px] border bg-transparent text-[color:var(--text-muted)] appearance-none transition-[background-color,color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        danger
          ? "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[color:var(--border-danger)] hover:bg-[color:var(--state-danger-bg)] hover:text-[color:var(--state-danger-text)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[rgba(7,193,96,0.16)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]",
      )}
    >
      {children}
    </button>
  );
}

function DesktopNavLink({
  active,
  item,
}: {
  active: boolean;
  item: (typeof desktopPrimaryNavItems)[number];
}) {
  const Icon = item.icon;

  return (
    <Link
      key={item.to}
      to={item.to as never}
      className={cn(
        "group flex flex-col items-center gap-1 rounded-[12px] px-1.5 py-2 text-[10px] leading-none transition-[background-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "bg-white/9 text-white shadow-[0_8px_20px_rgba(15,23,42,0.14)]"
          : "text-white/68 hover:bg-white/8 hover:text-white",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[10px] border transition-[background-color,border-color,color]",
          active
            ? "border-[rgba(7,193,96,0.28)] bg-[rgba(7,193,96,0.14)] text-[#dbffe8]"
            : "border-transparent bg-white/5 text-white/80 group-hover:border-white/10 group-hover:bg-white/9",
        )}
      >
        <Icon size={16} />
      </div>
      <span className="hidden xl:block">{item.label}</span>
      <span className="xl:hidden">{item.shortLabel}</span>
    </Link>
  );
}

function DesktopActionButton({
  active,
  item,
  onClick,
}: {
  active: boolean;
  item: (typeof desktopBottomNavItems)[number];
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col items-center gap-1 rounded-[12px] border-0 bg-transparent px-1.5 py-2 text-[10px] leading-none appearance-none transition-[background-color,color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "bg-white/9 text-white shadow-[0_8px_20px_rgba(15,23,42,0.14)]"
          : "text-white/68 hover:bg-white/8 hover:text-white",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[10px] border transition-[background-color,border-color,color]",
          active
            ? "border-[rgba(7,193,96,0.28)] bg-[rgba(7,193,96,0.14)] text-[#dbffe8]"
            : "border-transparent bg-white/5 text-white/80 group-hover:border-white/10 group-hover:bg-white/9",
        )}
      >
        <Icon size={16} />
      </div>
      <span className="hidden xl:block">{item.label}</span>
      <span className="xl:hidden">{item.shortLabel}</span>
    </button>
  );
}

function DesktopMoreMenuButton({
  item,
  onClick,
}: {
  item: (typeof desktopMoreMenuItems)[number];
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[12px] border-0 bg-transparent px-3 py-2.5 text-left text-sm text-[color:var(--text-primary)] appearance-none transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-console)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.08)] text-[color:var(--brand-primary)]">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.label}</div>
      </div>
    </button>
  );
}
