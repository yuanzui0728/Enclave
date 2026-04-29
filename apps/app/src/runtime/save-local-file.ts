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

export type SaveLocalFileInput = {
  blob: Blob;
  fileName: string;
  dialogTitle?: string;
  kindLabel?: string;
};

export type SaveLocalFileResult = {
  status: "saved" | "started" | "cancelled" | "failed";
  message: string;
  savedPath?: string;
};

type DesktopLocalFileSavePayload = {
  success: boolean;
  cancelled: boolean;
  savedPath?: string | null;
  message: string;
};

function normalizeFileName(fileName: string) {
  const normalized = fileName.trim();
  return normalized || "download";
}

function saveLocalFileWithBrowser(
  input: SaveLocalFileInput,
): SaveLocalFileResult {
  const kindLabel = resolveFileKindLabel(input.kindLabel);

  if (typeof document === "undefined") {
    return {
      status: "failed",
      message: formatFileSaveFailedMessage(kindLabel),
    };
  }

  const url = URL.createObjectURL(input.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = normalizeFileName(input.fileName);
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

async function saveLocalFileWithNativeShell(
  input: SaveLocalFileInput,
): Promise<SaveLocalFileResult> {
  const kindLabel = resolveFileKindLabel(input.kindLabel);
  const result = await shareFileWithNativeShell({
    blob: input.blob,
    fileName: normalizeFileName(input.fileName),
    mimeType: input.blob.type || undefined,
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

export async function saveLocalFile(
  input: SaveLocalFileInput,
): Promise<SaveLocalFileResult> {
  const fileName = normalizeFileName(input.fileName);
  if (isNativeMobileBridgeAvailable()) {
    return saveLocalFileWithNativeShell({
      ...input,
      fileName,
    });
  }

  if (!isDesktopRuntimeAvailable()) {
    return saveLocalFileWithBrowser({
      ...input,
      fileName,
    });
  }

  try {
    const bytes = Array.from(new Uint8Array(await input.blob.arrayBuffer()));
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<DesktopLocalFileSavePayload>(
      "desktop_save_binary_file",
      {
          input: {
            bytes,
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
    return saveLocalFileWithBrowser({
      ...input,
      fileName,
    });
  }
}
