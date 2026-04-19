import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export const DESKTOP_MAIN_WINDOW_NAVIGATE_EVENT =
  "yinjie:desktop:navigate-main-window";
export const DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT =
  "yinjie:desktop:navigate-standalone-window";
const MAIN_WINDOW_LABEL = "main";

export type DesktopMainWindowNavigatePayload = {
  targetPath?: string;
};

export type DesktopStandaloneWindowNavigatePayload = {
  targetPath: string;
};

export type DesktopStandaloneWindowOptions = {
  label: string;
  url: string;
  title: string;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
};

function normalizeWindowLabelSegment(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9\-/:_]/g, "_");
  return normalized || "window";
}

async function focusDesktopWindow(
  target: {
    isMinimized: () => Promise<boolean>;
    unminimize: () => Promise<void>;
    show: () => Promise<void>;
    setFocus: () => Promise<void>;
  },
) {
  try {
    if (await target.isMinimized()) {
      await target.unminimize();
    }
  } catch {
    // Ignore minimize state failures and keep trying to surface the window.
  }

  try {
    await target.show();
  } catch {
    // Ignore show failures.
  }

  try {
    await target.setFocus();
  } catch {
    // Ignore focus failures.
  }
}

export function buildDesktopStandaloneWindowLabel(
  prefix: string,
  identifier: string,
) {
  return `${normalizeWindowLabelSegment(prefix)}:${normalizeWindowLabelSegment(identifier)}`;
}

export async function openDesktopStandaloneWindow(
  options: DesktopStandaloneWindowOptions,
) {
  if (!isDesktopRuntimeAvailable()) {
    return false;
  }

  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const existingWindow = await WebviewWindow.getByLabel(options.label);

    if (existingWindow) {
      try {
        const { emitTo } = await import("@tauri-apps/api/event");
        await emitTo<DesktopStandaloneWindowNavigatePayload>(
          options.label,
          DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
          {
            targetPath: options.url,
          },
        );
      } catch {
        // Ignore cross-window route sync failures and keep focusing the existing window.
      }

      try {
        await existingWindow.setTitle(options.title);
      } catch {
        // Ignore title sync failures.
      }

      await focusDesktopWindow(existingWindow);
      return true;
    }

    const desktopWindow = new WebviewWindow(options.label, {
      url: options.url,
      title: options.title,
      width: options.width,
      height: options.height,
      minWidth: options.minWidth,
      minHeight: options.minHeight,
      center: true,
      focus: true,
    });

    return await new Promise<boolean>((resolve) => {
      let settled = false;

      const finish = (value: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(value);
      };

      const timeout = window.setTimeout(() => {
        finish(false);
      }, 2500);

      void desktopWindow.once("tauri://created", async () => {
        window.clearTimeout(timeout);
        await focusDesktopWindow(desktopWindow);
        finish(true);
      });

      void desktopWindow.once("tauri://error", () => {
        window.clearTimeout(timeout);
        finish(false);
      });
    });
  } catch {
    return false;
  }
}

export function getCurrentWindowTargetPath() {
  if (typeof window === "undefined") {
    return "";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function shouldNavigateCurrentWindow(targetPath: string) {
  const nextTarget = targetPath.trim();
  return Boolean(nextTarget) && getCurrentWindowTargetPath() !== nextTarget;
}

export async function focusMainDesktopWindow(targetPath?: string) {
  if (!isDesktopRuntimeAvailable()) {
    return false;
  }

  try {
    const [{ emitTo }, { WebviewWindow }] = await Promise.all([
      import("@tauri-apps/api/event"),
      import("@tauri-apps/api/webviewWindow"),
    ]);
    const mainWindow = await WebviewWindow.getByLabel(MAIN_WINDOW_LABEL);

    if (!mainWindow) {
      return false;
    }

    await emitTo<DesktopMainWindowNavigatePayload>(
      MAIN_WINDOW_LABEL,
      DESKTOP_MAIN_WINDOW_NAVIGATE_EVENT,
      {
        targetPath: targetPath?.trim() || undefined,
      },
    );
    await focusDesktopWindow(mainWindow);
    return true;
  } catch {
    return false;
  }
}

export async function focusStandaloneDesktopWindow(
  label: string,
  targetPath?: string,
) {
  if (!isDesktopRuntimeAvailable()) {
    return false;
  }

  try {
    const [{ emitTo }, { WebviewWindow }] = await Promise.all([
      import("@tauri-apps/api/event"),
      import("@tauri-apps/api/webviewWindow"),
    ]);
    const targetWindow = await WebviewWindow.getByLabel(label);

    if (!targetWindow) {
      return false;
    }

    if (targetPath?.trim()) {
      await emitTo<DesktopStandaloneWindowNavigatePayload>(
        label,
        DESKTOP_STANDALONE_WINDOW_NAVIGATE_EVENT,
        {
          targetPath: targetPath.trim(),
        },
      );
    }

    await focusDesktopWindow(targetWindow);
    return true;
  } catch {
    return false;
  }
}

export async function closeCurrentDesktopWindow() {
  if (!isDesktopRuntimeAvailable()) {
    return false;
  }

  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
    return true;
  } catch {
    return false;
  }
}
