import { useEffect, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { DesktopNotesWorkspace } from "../features/desktop/chat/desktop-notes-workspace";
import {
  buildDesktopNoteWindowRouteHash,
  parseDesktopNoteEditorRouteHash,
} from "../features/desktop/chat/desktop-note-window-route-state";
import {
  closeCurrentDesktopWindow,
  DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
  focusMainDesktopWindow,
  shouldNavigateCurrentWindow,
  type DesktopStandaloneWindowNavigatePayload,
} from "../runtime/desktop-windowing";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DesktopNoteWindowPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopShell = runtimeConfig.appPlatform === "desktop";
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(
    () => parseDesktopNoteEditorRouteHash(hash),
    [hash],
  );

  useEffect(() => {
    if (!routeState) {
      return;
    }

    const nextHash = buildDesktopNoteWindowRouteHash(routeState);
    const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
    if (normalizedHash === nextHash) {
      return;
    }

    void navigate({
      to: "/desktop/note-window",
      hash: nextHash,
      replace: true,
    });
  }, [hash, navigate, routeState]);

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

  if (!routeState) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[color:var(--bg-app)] p-6">
        <div className="w-full max-w-lg rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="mb-5 inline-flex rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] tracking-[0.12em] text-[color:var(--brand-primary)]">
            独立笔记窗口
          </div>
          <EmptyState
            title="这个笔记窗口缺少上下文"
            description="主窗口重新打开一次新建笔记，或者回到收藏页选择已保存笔记。"
          />
          <div className="mt-6 flex justify-center">
            <Button
              type="button"
              onClick={() => closeStandaloneWindow("/tabs/favorites")}
              className="h-9 rounded-[10px] bg-[color:var(--brand-primary)] px-4 text-white hover:opacity-95"
            >
              回到收藏
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DesktopNotesWorkspace
      selectedNoteId={routeState.noteId}
      draftId={routeState.draftId}
      standaloneWindow
      returnTo={routeState.returnTo}
      onSavedNote={(noteId, draftId) => {
        void navigate({
          to: "/desktop/note-window",
          hash: buildDesktopNoteWindowRouteHash({
            draftId,
            noteId,
            returnTo: routeState.returnTo,
          }),
          replace: true,
        });
      }}
    />
  );
}

function closeStandaloneWindow(targetPath: string) {
  if (typeof window === "undefined") {
    return;
  }

  void closeCurrentDesktopWindow().then((closed) => {
    if (closed) {
      return;
    }

    closeCurrentWindow(() => {
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
    });
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
