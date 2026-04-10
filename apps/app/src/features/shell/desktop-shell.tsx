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
  { to: "/tabs/chat", label: "消息", icon: MessageCircleMore, shortLabel: "消息" },
  { to: "/tabs/contacts", label: "通讯录", icon: UsersRound, shortLabel: "联系人" },
  { to: "/tabs/moments", label: "朋友圈", icon: BellDot, shortLabel: "动态" },
  { to: "/tabs/discover", label: "发现", icon: Compass, shortLabel: "发现" },
  { to: "/tabs/profile", label: "我", icon: UserRound, shortLabel: "我" },
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

  const shellInsetClass = nativeDesktopShell ? "rounded-none" : "m-2 rounded-[30px]";

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
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-gradient)] text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(255,138,61,0.24)]">
                YJ
              </div>
              <div className="leading-none">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">Yinjie</div>
                <div className="mt-1 text-[11px] tracking-[0.22em] text-[color:var(--text-dim)]">DESKTOP WORLD</div>
              </div>
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
          ) : null}
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 gap-4 p-4 pt-3">
          <aside className="hidden w-[104px] shrink-0 rounded-[30px] border border-[rgba(249,115,22,0.10)] bg-[linear-gradient(180deg,rgba(255,254,250,0.95),rgba(255,249,238,0.90))] p-3 shadow-[var(--shadow-section)] backdrop-blur-2xl lg:flex lg:flex-col">
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
                    <span className="hidden xl:block">{label}</span>
                    <span className="xl:hidden">{shortLabel}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0 flex-1 overflow-hidden rounded-[32px] border border-[rgba(249,115,22,0.10)] bg-[rgba(255,253,248,0.92)] shadow-[var(--shadow-section)] backdrop-blur-2xl">
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
