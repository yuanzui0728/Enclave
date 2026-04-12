import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  isNativeMobileBridgeAvailable,
  shareFileWithNativeShell,
} from "./mobile-bridge";

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

function fallbackDownloadLabel(kind: SaveRemoteFileInput["kind"]) {
  return kind === "image" ? "图片" : "文件";
}

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
  if (typeof document === "undefined") {
    return {
      status: "failed",
      message: `${fallbackDownloadLabel(input.kind)}保存失败，请稍后再试。`,
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
    message: `${fallbackDownloadLabel(input.kind)}开始下载。`,
  };
}

async function saveRemoteFileWithNativeShell(
  input: SaveRemoteFileInput,
): Promise<SaveRemoteFileResult> {
  const kindLabel = fallbackDownloadLabel(input.kind);

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
      title: input.dialogTitle,
    });

    if (!result.shared) {
      throw new Error(result.error ?? "failed to share file");
    }

    return {
      status: "started",
      message: `${kindLabel}已打开系统分享面板，可继续保存到文件或转发给其他应用。`,
    };
  } catch {
    return {
      status: "failed",
      message: `${kindLabel}保存失败，请稍后再试。`,
    };
  }
}

export async function saveRemoteFile(
  input: SaveRemoteFileInput,
): Promise<SaveRemoteFileResult> {
  const normalizedUrl = input.url.trim();
  if (!normalizedUrl) {
    return {
      status: "failed",
      message: `${fallbackDownloadLabel(input.kind)}保存失败，请稍后再试。`,
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
          dialogTitle: input.dialogTitle?.trim() || undefined,
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
        message: result.message || "已取消保存。",
      };
    }

    return {
      status: "failed",
      message:
        result.message || `${fallbackDownloadLabel(input.kind)}保存失败，请稍后再试。`,
    };
  } catch {
    return saveRemoteFileWithBrowser({
      ...input,
      fileName,
      url: normalizedUrl,
    });
  }
}
