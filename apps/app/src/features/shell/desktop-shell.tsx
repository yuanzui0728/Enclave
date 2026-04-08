import { useEffect, useState, type PropsWithChildren } from "react";
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

function isTauriDesktop() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function DesktopShell({ children }: PropsWithChildren) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
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
    if (!isTauriDesktop()) {
      return;
    }

    let cancelled = false;
    let unlistenResize: (() => void) | null = null;

    async function bindDesktopWindow() {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const currentWindow = getCurrentWindow() as DesktopWindowHandle;

      if (cancelled) {
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
  }, []);

  const shellInsetClass = isMaximized ? "rounded-none" : "m-2 rounded-[30px]";

  return (
    <div className="h-screen overflow-hidden bg-transparent text-[color:var(--text-primary)]">
      <div
        className={cn(
          "relative flex h-[calc(100vh-16px)] flex-col overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(7,11,18,0.9),rgba(9,14,22,0.92))] shadow-[0_30px_90px_rgba(2,6,23,0.46)] backdrop-blur-[36px]",
          shellInsetClass,
        )}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage: "var(--bg-grid)",
            backgroundSize: "26px 26px",
            maskImage: "linear-gradient(180deg, rgba(0,0,0,0.8), transparent 92%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[-8%] top-[-16%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.16),transparent_68%)] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-20%] right-[-10%] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.12),transparent_72%)] blur-3xl"
        />

        <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
          <div
            className="flex min-w-0 flex-1 items-center gap-3"
            data-tauri-drag-region
            onDoubleClick={() => {
              if (!desktopWindow) {
                return;
              }

              void desktopWindow.toggleMaximize();
            }}
          >
            <div className="flex h-10 items-center gap-3 rounded-full border border-white/10 bg-white/6 px-3 shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(249,115,22,0.95),rgba(251,191,36,0.86))] text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(249,115,22,0.28)]">
                YJ
              </div>
              <div className="leading-none">
                <div className="text-sm font-medium text-white">Yinjie</div>
                <div className="mt-1 text-[11px] tracking-[0.22em] text-white/45">DESKTOP WORLD</div>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-2 rounded-full border border-white/8 bg-black/12 px-3 py-2 text-xs text-white/55 xl:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" />
              <span className="truncate">Soft shell desktop frame</span>
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

        <div className="relative z-10 flex min-h-0 flex-1 gap-4 p-4 pt-3">
          <aside className="hidden w-[94px] shrink-0 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(8,13,20,0.84),rgba(10,16,24,0.76))] p-3 shadow-[0_22px_60px_rgba(15,23,42,0.24)] lg:flex lg:flex-col">
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
                        ? "bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(249,115,22,0.18))] text-white shadow-[0_18px_35px_rgba(15,23,42,0.22)]"
                        : "text-[color:var(--text-muted)] hover:bg-white/6 hover:text-white",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-[18px] border transition-colors",
                        active
                          ? "border-white/10 bg-white/8"
                          : "border-transparent bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] group-hover:border-white/8 group-hover:bg-white/6",
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

          <main className="min-w-0 flex-1 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,17,27,0.86),rgba(10,16,26,0.82))] shadow-[0_24px_70px_rgba(2,6,23,0.28)] backdrop-blur-[28px]">
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
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border text-white/78 transition-[background-color,color,border-color,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:-translate-y-0.5",
        danger
          ? "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] hover:border-red-400/45 hover:bg-[linear-gradient(180deg,rgba(248,113,113,0.28),rgba(239,68,68,0.22))] hover:text-white"
          : "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] hover:border-white/14 hover:bg-white/8 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
