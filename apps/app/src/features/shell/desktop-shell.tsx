import { useEffect, useState, type MouseEvent as ReactMouseEvent, type PropsWithChildren } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BellDot,
  Compass,
  Copy,
  MessageCircleMore,
  Minus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "@yinjie/ui";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

const navItems = [
  { to: "/tabs/chat", label: "Messages", icon: MessageCircleMore, shortLabel: "Chat" },
  { to: "/tabs/contacts", label: "Contacts", icon: UsersRound, shortLabel: "People" },
  { to: "/tabs/moments", label: "Moments", icon: BellDot, shortLabel: "Feed" },
  { to: "/tabs/discover", label: "Discover", icon: Compass, shortLabel: "Find" },
  { to: "/tabs/profile", label: "Profile", icon: UserRound, shortLabel: "Me" },
];

type DesktopWindowHandle = {
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  minimize: () => Promise<void>;
  onResized: (handler: () => void) => Promise<() => void>;
  startDragging: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
};

function isActive(pathname: string, to: string) {
  if (to === "/tabs/chat") {
    return pathname.startsWith("/tabs/chat") || pathname.startsWith("/chat/");
  }

  if (to === "/tabs/contacts") {
    return (
      pathname.startsWith("/tabs/contacts") ||
      pathname.startsWith("/character/") ||
      pathname.startsWith("/friend-requests") ||
      pathname.startsWith("/group/")
    );
  }

  return pathname.startsWith(to);
}

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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopShell = runtimeConfig.appPlatform === "desktop";
  const [desktopWindow, setDesktopWindow] = useState<DesktopWindowHandle | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

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

  const shellInsetClass = nativeDesktopShell && isMaximized ? "rounded-none" : "m-2 rounded-[30px]";

  const handleTitleBarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !desktopWindow) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select, [role='button']")) {
      return;
    }

    void desktopWindow.startDragging();
  };

  return (
    <div className="h-screen overflow-hidden bg-transparent text-[color:var(--text-primary)]">
      <div
        className={cn(
          "relative flex h-[calc(100vh-16px)] flex-col overflow-hidden border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] shadow-[var(--shadow-shell)]",
          shellInsetClass,
        )}
      >

        <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-[color:var(--border-faint)] px-5">
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
            <div className="flex h-10 items-center gap-3 rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 shadow-[var(--shadow-soft)]">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(249,115,22,0.95),rgba(251,191,36,0.86))] text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(249,115,22,0.28)]">
                YJ
              </div>
              <div className="leading-none">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">Yinjie</div>
                <div className="mt-1 text-[11px] tracking-[0.22em] text-[color:var(--text-dim)]">DESKTOP WORLD</div>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-2 rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2 text-xs text-[color:var(--text-muted)] xl:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" />
              <span className="truncate">Soft shell desktop frame</span>
            </div>
          </div>

          {nativeDesktopShell ? (
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
          ) : (
            <div className="hidden items-center gap-2 xl:flex">
              <div className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
                Browser desktop layout
              </div>
            </div>
          )}
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 gap-4 p-4 pt-3">
          <aside className="hidden w-[94px] shrink-0 rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3 shadow-[var(--shadow-soft)] lg:flex lg:flex-col">
            <nav className="flex flex-1 flex-col gap-2">
              {navItems.map(({ to, label, icon: Icon, shortLabel }) => {
                const active = isActive(pathname, to);

                return (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      "group flex flex-col items-center gap-2 rounded-[22px] px-3 py-3 text-[11px] transition-[background-color,color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                      active
                        ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)] shadow-[var(--shadow-soft)]"
                        : "text-[color:var(--text-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-[18px] border transition-colors",
                        active
                          ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)]"
                          : "border-transparent bg-[color:var(--surface-soft)] group-hover:border-[color:var(--border-faint)] group-hover:bg-[color:var(--surface-secondary)]",
                      )}
                    >
                      <Icon size={18} />
                    </div>
                    <span className="hidden xl:block">{label}</span>
                    <span className="xl:hidden">{shortLabel}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0 flex-1 overflow-hidden rounded-[30px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] shadow-[var(--shadow-card)]">
            {children}
          </main>
        </div>
      </div>
    </div>
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
