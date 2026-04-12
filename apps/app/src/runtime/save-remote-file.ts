import { isDesktopRuntimeAvailable } from "@yinjie/ui";

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
