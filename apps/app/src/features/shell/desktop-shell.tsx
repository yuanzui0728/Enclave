import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PropsWithChildren,
} from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Clock3, Copy, LockKeyhole, Minus, ShieldCheck, X } from "lucide-react";
import { Button, TextField, cn } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";
import { formatTimestamp } from "../../lib/format";
import {
  desktopBottomNavItems,
  desktopMoreMenuItems,
  desktopPrimaryNavItems,
  isDesktopNavItemActive,
  type DesktopNavActionItem,
} from "./desktop-nav-config";
import {
  clearDesktopLocked,
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
  const standaloneDesktopRoute = isStandaloneDesktopRoute(pathname);
  const runtimeConfig = useAppRuntimeConfig();
  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const nativeDesktopShell = runtimeConfig.appPlatform === "desktop";
  const [desktopWindow, setDesktopWindow] =
    useState<DesktopWindowHandle | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
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
  const [lockPasscodeLength, setLockPasscodeLength] = useState<number | null>(
    () => readDesktopLockSnapshot().passcodeLength,
  );
  const [unlockPasscode, setUnlockPasscode] = useState("");
  const [setupPasscode, setSetupPasscode] = useState("");
  const [setupPasscodeConfirm, setSetupPasscodeConfirm] = useState("");
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockNotice, setLockNotice] = useState<string | null>(null);

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
    setIsMoreMenuOpen(false);
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
    : "m-2 rounded-[30px]";

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

  return (
    <div className="h-screen overflow-hidden bg-transparent text-[color:var(--text-primary)]">
      <div
        className={cn(
          nativeDesktopShell
            ? "relative flex h-screen flex-col overflow-hidden bg-[linear-gradient(180deg,#fffdf7,#fff8ee)]"
            : "relative flex h-[calc(100vh-16px)] flex-col overflow-hidden border border-[rgba(249,115,22,0.12)] bg-[linear-gradient(180deg,#fffdf7,#fff8ee)] shadow-[var(--shadow-shell)]",
          shellInsetClass,
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-[rgba(251,191,36,0.18)] blur-3xl" />
          <div className="absolute right-0 top-20 h-52 w-52 rounded-full bg-[rgba(249,115,22,0.12)] blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-52 w-52 rounded-full bg-[rgba(16,185,129,0.09)] blur-3xl" />
        </div>

        {nativeDesktopShell && !standaloneDesktopRoute ? (
          <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-[rgba(249,115,22,0.10)] bg-[rgba(255,253,248,0.86)] px-5 backdrop-blur-2xl">
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
              <div className="flex h-10 items-center gap-3 rounded-full border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.92)] px-3 shadow-[var(--shadow-soft)]">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-gradient)] text-[11px] font-semibold text-[color:var(--text-on-brand)] shadow-[0_10px_24px_rgba(255,138,61,0.24)]">
                  YJ
                </div>
                <div className="leading-none">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    Yinjie
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.22em] text-[color:var(--text-dim)]">
                    DESKTOP WORLD
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
            standaloneDesktopRoute ? undefined : "gap-4 p-4",
            nativeDesktopShell && !standaloneDesktopRoute ? "pt-3" : undefined,
          )}
        >
          {isMoreMenuOpen && !standaloneDesktopRoute ? (
            <button
              type="button"
              aria-label="关闭更多菜单"
              onClick={() => setIsMoreMenuOpen(false)}
              className="absolute inset-0 z-20 cursor-default"
            />
          ) : null}

          {standaloneDesktopRoute ? null : (
            <aside className="hidden w-[104px] shrink-0 rounded-[30px] border border-[rgba(249,115,22,0.10)] bg-[linear-gradient(180deg,rgba(255,254,250,0.95),rgba(255,249,238,0.90))] p-3 shadow-[var(--shadow-section)] backdrop-blur-2xl lg:flex lg:flex-col">
              <Link
                to="/tabs/profile"
                className="group mb-3 flex justify-center rounded-[22px] px-2 py-1.5"
                aria-label="打开我的资料"
              >
                <div className="rounded-[22px] border border-transparent p-1.5 transition-[background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] group-hover:border-[color:var(--border-faint)] group-hover:bg-white/88 group-hover:shadow-[var(--shadow-card)]">
                  <AvatarChip
                    name={ownerName ?? "世界主人"}
                    src={ownerAvatar}
                    size="wechat"
                  />
                </div>
              </Link>

              <nav className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="flex flex-col gap-2 pb-3">
                  {desktopPrimaryNavItems.map((item) => (
                    <DesktopNavLink
                      key={item.to}
                      active={isDesktopNavItemActive(pathname, item)}
                      item={item}
                    />
                  ))}
                </div>
              </nav>

              <div className="relative mt-3 border-t border-[rgba(249,115,22,0.10)] pt-3">
                <div className="flex flex-col gap-2">
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
                          void navigate({ to: "/desktop/mobile" });
                          return;
                        }

                        setIsMoreMenuOpen((current) => !current);
                      }}
                    />
                  ))}
                </div>

                {isMoreMenuOpen ? (
                  <div className="absolute bottom-0 left-[calc(100%+0.75rem)] z-30 w-[248px] rounded-[26px] border border-[rgba(255,255,255,0.7)] bg-[rgba(255,252,246,0.98)] p-2 shadow-[0_24px_48px_rgba(135,78,24,0.18)] backdrop-blur-2xl">
                    <div className="px-3 pb-2 pt-2 text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-dim)]">
                      更多
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
                    <div className="mt-2 rounded-[18px] bg-[rgba(255,248,240,0.88)] px-3 py-3 text-[11px] leading-5 text-[color:var(--text-dim)]">
                      `Ctrl/⌘ + K` 搜一搜
                      <br />
                      `Ctrl/⌘ + ,` 设置
                      <br />
                      `Ctrl/⌘ + Shift + F` 聊天文件
                      <br />
                      `Ctrl/⌘ + L` 锁定
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
                : "rounded-[32px] border border-[rgba(249,115,22,0.10)] bg-[rgba(255,253,248,0.92)] shadow-[var(--shadow-section)] backdrop-blur-2xl",
            )}
          >
            {children}
          </main>
        </div>

        {isLocked ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(22,18,14,0.48)] p-6 backdrop-blur-md">
            <div className="w-full max-w-md rounded-[32px] border border-[rgba(255,255,255,0.28)] bg-[rgba(255,252,247,0.94)] p-8 shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(249,115,22,0.10)]">
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

              <div className="mt-5 rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,249,242,0.88)] p-4">
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
                <div className="mt-4 rounded-[18px] bg-[rgba(34,197,94,0.10)] px-4 py-3 text-sm text-[#15803d]">
                  {lockNotice}
                </div>
              ) : null}
              {lockError ? (
                <div className="mt-4 rounded-[18px] bg-[rgba(239,68,68,0.10)] px-4 py-3 text-sm text-[color:var(--state-danger-text)]">
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
                    className="h-12 rounded-[18px] border-[color:var(--border-faint)] bg-white px-4 shadow-none"
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
                    className="h-12 rounded-[18px] border-[color:var(--border-faint)] bg-white px-4 shadow-none"
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={submitSetupLock}
                      className="rounded-2xl"
                    >
                      设置口令并锁定
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeDesktopLock}
                      className="rounded-2xl"
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
                    className="h-12 rounded-[18px] border-[color:var(--border-faint)] bg-white px-4 shadow-none"
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      onClick={submitUnlock}
                      className="rounded-2xl"
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

    if (action === "open-live-companion") {
      void navigate({ to: "/desktop/channels/live-companion" });
      return;
    }

    if (action === "open-chat-files") {
      void navigate({ to: "/desktop/chat-files" });
      return;
    }

    if (action === "open-chat-history" || action === "load-history") {
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
    pathname === "/desktop/chat-window"
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
        "flex h-9 w-9 items-center justify-center rounded-full border text-[color:var(--text-muted)] transition-[background-color,color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5",
        danger
          ? "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[color:var(--border-danger)] hover:bg-[color:var(--state-danger-bg)] hover:text-[color:var(--state-danger-text)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--text-primary)]",
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
        "group flex flex-col items-center gap-2 rounded-[22px] px-3 py-3 text-[11px] transition-[background-color,color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "bg-white/92 text-[color:var(--brand-primary)] shadow-[var(--shadow-card)]"
          : "text-[color:var(--text-secondary)] hover:bg-white/88 hover:text-[color:var(--text-primary)]",
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-[18px] border transition-[background-color,border-color,filter]",
          active
            ? "border-[color:var(--border-brand)] bg-[rgba(249,115,22,0.12)] [filter:drop-shadow(0_0_8px_rgba(249,115,22,0.35))]"
            : "border-transparent bg-[rgba(255,255,255,0.82)] group-hover:border-[color:var(--border-faint)] group-hover:bg-white",
        )}
      >
        <Icon size={18} />
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
        "group flex w-full flex-col items-center gap-2 rounded-[22px] px-3 py-3 text-[11px] transition-[background-color,color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        active
          ? "bg-white/92 text-[color:var(--brand-primary)] shadow-[var(--shadow-card)]"
          : "text-[color:var(--text-secondary)] hover:bg-white/88 hover:text-[color:var(--text-primary)]",
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-[18px] border transition-[background-color,border-color,filter]",
          active
            ? "border-[color:var(--border-brand)] bg-[rgba(249,115,22,0.12)] [filter:drop-shadow(0_0_8px_rgba(249,115,22,0.35))]"
            : "border-transparent bg-[rgba(255,255,255,0.82)] group-hover:border-[color:var(--border-faint)] group-hover:bg-white",
        )}
      >
        <Icon size={18} />
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
      className="flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[rgba(255,138,61,0.08)]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(255,255,255,0.88)] text-[color:var(--brand-primary)]">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.label}</div>
      </div>
    </button>
  );
}
