import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  isNativeMobileBridgeAvailable,
  shareFileWithNativeShell,
} from "./mobile-bridge";
import {
  formatFileDownloadStartedMessage,
  formatFileSaveFailedMessage,
  formatFileSharePanelMessage,
  getFileSaveCancelledMessage,
  resolveFileKindLabel,
  translateKnownFileDialogTitle,
} from "./file-runtime-i18n";

export type SaveGeneratedFileInput = {
  contents: string;
  fileName: string;
  mimeType?: string;
  dialogTitle?: string;
  kindLabel?: string;
};

export type SaveGeneratedFileResult = {
  status: "saved" | "started" | "cancelled" | "failed";
  message: string;
  savedPath?: string;
};

type DesktopGeneratedFileSavePayload = {
  success: boolean;
  cancelled: boolean;
  savedPath?: string | null;
  message: string;
};

function normalizeGeneratedFileName(fileName: string) {
  const normalized = fileName.trim();
  return normalized || "download";
}

function saveGeneratedFileWithBrowser(
  input: SaveGeneratedFileInput,
): SaveGeneratedFileResult {
  const kindLabel = resolveFileKindLabel(input.kindLabel);

  if (typeof document === "undefined") {
    return {
      status: "failed",
      message: formatFileSaveFailedMessage(kindLabel),
    };
  }

  const blob = new Blob([input.contents], {
    type: input.mimeType?.trim() || "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = normalizeGeneratedFileName(input.fileName);
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return {
    status: "started",
    message: formatFileDownloadStartedMessage(kindLabel),
  };
}

async function saveGeneratedFileWithNativeShell(
  input: SaveGeneratedFileInput,
): Promise<SaveGeneratedFileResult> {
  const kindLabel = resolveFileKindLabel(input.kindLabel);
  const mimeType = input.mimeType?.trim() || "application/octet-stream";
  const result = await shareFileWithNativeShell({
    blob: new Blob([input.contents], {
      type: mimeType,
    }),
    fileName: normalizeGeneratedFileName(input.fileName),
    mimeType,
    title: translateKnownFileDialogTitle(input.dialogTitle),
  });

  if (!result.shared) {
    return {
      status: "failed",
      message: formatFileSaveFailedMessage(kindLabel),
    };
  }

  return {
    status: "started",
    message: formatFileSharePanelMessage(kindLabel),
  };
}

export async function saveGeneratedFile(
  input: SaveGeneratedFileInput,
): Promise<SaveGeneratedFileResult> {
  const fileName = normalizeGeneratedFileName(input.fileName);
  if (isNativeMobileBridgeAvailable()) {
    return saveGeneratedFileWithNativeShell({
      ...input,
      fileName,
    });
  }

  if (!isDesktopRuntimeAvailable()) {
    return saveGeneratedFileWithBrowser({
      ...input,
      fileName,
    });
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<DesktopGeneratedFileSavePayload>(
      "desktop_save_text_file",
      {
        input: {
          contents: input.contents,
          fileName,
          dialogTitle: translateKnownFileDialogTitle(input.dialogTitle),
        },
      },
    );

    if (result.success) {
      return {
        status: "saved",
        message: result.message,
        savedPath: result.savedPath ?? undefined,
      };
    }

    if (result.cancelled) {
      return {
        status: "cancelled",
        message: result.message || getFileSaveCancelledMessage(),
      };
    }

    const kindLabel = resolveFileKindLabel(input.kindLabel);

    return {
      status: "failed",
      message: result.message || formatFileSaveFailedMessage(kindLabel),
    };
  } catch {
    return saveGeneratedFileWithBrowser({
      ...input,
      fileName,
    });
  }
}
