import { isDesktopRuntimeAvailable } from "@yinjie/ui";
import {
  isNativeMobileBridgeAvailable,
  shareFileWithNativeShell,
} from "./mobile-bridge";

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

function resolveKindLabel(kindLabel: string | undefined) {
  return kindLabel?.trim() || "文件";
}

function normalizeFileName(fileName: string) {
  const normalized = fileName.trim();
  return normalized || "download";
}

function saveLocalFileWithBrowser(
  input: SaveLocalFileInput,
): SaveLocalFileResult {
  if (typeof document === "undefined") {
    return {
      status: "failed",
      message: `${resolveKindLabel(input.kindLabel)}保存失败，请稍后再试。`,
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
    message: `${resolveKindLabel(input.kindLabel)}开始下载。`,
  };
}

async function saveLocalFileWithNativeShell(
  input: SaveLocalFileInput,
): Promise<SaveLocalFileResult> {
  const kindLabel = resolveKindLabel(input.kindLabel);
  const result = await shareFileWithNativeShell({
    blob: input.blob,
    fileName: normalizeFileName(input.fileName),
    mimeType: input.blob.type || undefined,
    title: input.dialogTitle,
  });

  if (!result.shared) {
    return {
      status: "failed",
      message: `${kindLabel}保存失败，请稍后再试。`,
    };
  }

  return {
    status: "started",
    message: `${kindLabel}已打开系统分享面板，可继续保存到文件或转发给其他应用。`,
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
        result.message ||
        `${resolveKindLabel(input.kindLabel)}保存失败，请稍后再试。`,
    };
  } catch {
    return saveLocalFileWithBrowser({
      ...input,
      fileName,
    });
  }
}
