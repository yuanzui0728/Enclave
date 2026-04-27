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
  resolveRemoteFileKindLabel,
  translateKnownFileDialogTitle,
} from "./file-runtime-i18n";

export type SaveRemoteFileInput = {
  url: string;
  fileName: string;
  kind: "image" | "file";
  dialogTitle?: string;
};

export type SaveRemoteFileResult = {
  status: "saved" | "started" | "cancelled" | "failed";
  message: string;
  savedPath?: string;
};

type DesktopRemoteFileSavePayload = {
  success: boolean;
  cancelled: boolean;
  savedPath?: string | null;
  message: string;
};

function normalizeDownloadFileName(
  fileName: string,
  kind: SaveRemoteFileInput["kind"],
) {
  const normalized = fileName.trim();
  if (normalized) {
    return normalized;
  }

  return kind === "image" ? "image" : "file";
}

function saveRemoteFileWithBrowser(input: SaveRemoteFileInput): SaveRemoteFileResult {
  const kindLabel = resolveRemoteFileKindLabel(input.kind);

  if (typeof document === "undefined") {
    return {
      status: "failed",
      message: formatFileSaveFailedMessage(kindLabel),
    };
  }

  const anchor = document.createElement("a");
  anchor.href = input.url;
  anchor.download = normalizeDownloadFileName(input.fileName, input.kind);
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  return {
    status: "started",
    message: formatFileDownloadStartedMessage(kindLabel),
  };
}

async function saveRemoteFileWithNativeShell(
  input: SaveRemoteFileInput,
): Promise<SaveRemoteFileResult> {
  const kindLabel = resolveRemoteFileKindLabel(input.kind);

  try {
    const response = await fetch(input.url, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("failed to fetch file");
    }

    const blob = await response.blob();
    const result = await shareFileWithNativeShell({
      blob,
      fileName: normalizeDownloadFileName(input.fileName, input.kind),
      mimeType: blob.type || undefined,
      title: translateKnownFileDialogTitle(input.dialogTitle),
    });

    if (!result.shared) {
      throw new Error(result.error ?? "failed to share file");
    }

    return {
      status: "started",
      message: formatFileSharePanelMessage(kindLabel),
    };
  } catch {
    return {
      status: "failed",
      message: formatFileSaveFailedMessage(kindLabel),
    };
  }
}

export async function saveRemoteFile(
  input: SaveRemoteFileInput,
): Promise<SaveRemoteFileResult> {
  const normalizedUrl = input.url.trim();
  if (!normalizedUrl) {
    const kindLabel = resolveRemoteFileKindLabel(input.kind);

    return {
      status: "failed",
      message: formatFileSaveFailedMessage(kindLabel),
    };
  }

  const fileName = normalizeDownloadFileName(input.fileName, input.kind);
  if (isNativeMobileBridgeAvailable()) {
    return saveRemoteFileWithNativeShell({
      ...input,
      fileName,
      url: normalizedUrl,
    });
  }

  if (!isDesktopRuntimeAvailable()) {
    return saveRemoteFileWithBrowser({
      ...input,
      fileName,
      url: normalizedUrl,
    });
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<DesktopRemoteFileSavePayload>(
      "desktop_save_remote_file",
      {
        input: {
          url: normalizedUrl,
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

    const kindLabel = resolveRemoteFileKindLabel(input.kind);

    return {
      status: "failed",
      message: result.message || formatFileSaveFailedMessage(kindLabel),
    };
  } catch {
    return saveRemoteFileWithBrowser({
      ...input,
      fileName,
      url: normalizedUrl,
    });
  }
}
