import {
  isNativeMobileBridgeAvailable,
  openFileWithNativeShell,
  shareFileWithNativeShell,
} from "./mobile-bridge";
import { openExternalUrl } from "./external-url";

export type OpenRemoteFileInput = {
  url: string;
  fileName: string;
  mimeType?: string;
  dialogTitle?: string;
};

export type OpenRemoteFileResult = {
  opened: boolean;
  message: string;
};

function normalizeFileName(fileName: string) {
  const normalized = fileName.trim();
  return normalized || "file";
}

export async function openRemoteFile(
  input: OpenRemoteFileInput,
): Promise<OpenRemoteFileResult> {
  const normalizedUrl = input.url.trim();
  if (!normalizedUrl) {
    return {
      opened: false,
      message: "文件打开失败，请稍后再试。",
    };
  }

  const fileName = normalizeFileName(input.fileName);

  if (isNativeMobileBridgeAvailable()) {
    try {
      const response = await fetch(normalizedUrl, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("failed to fetch file");
      }

      const blob = await response.blob();
      const result = await openFileWithNativeShell({
        blob,
        fileName,
        mimeType: blob.type || input.mimeType?.trim() || undefined,
        title: input.dialogTitle,
      });

      if (result.opened) {
        return {
          opened: true,
          message: "已打开文件。",
        };
      }

      const shareResult = await shareFileWithNativeShell({
        blob,
        fileName,
        mimeType: blob.type || input.mimeType?.trim() || undefined,
        title: input.dialogTitle,
      });

      if (shareResult.shared) {
        return {
          opened: true,
          message: "当前设备未直接预览，已打开系统面板，可继续在其他应用中打开。",
        };
      }

      throw new Error(
        shareResult.error || result.error || "failed to open file",
      );
    } catch {
      return {
        opened: false,
        message: "文件打开失败，请稍后再试。",
      };
    }
  }

  const opened = await openExternalUrl(normalizedUrl);
  return {
    opened,
    message: opened ? "已打开文件。" : "文件打开失败，请稍后再试。",
  };
}
