import {
  isNativeMobileBridgeAvailable,
  openFileWithNativeShell,
  shareFileWithNativeShell,
} from "./mobile-bridge";
import { openExternalUrl } from "./external-url";
import {
  getFileFallbackOpenMessage,
  getFileOpenedMessage,
  getFileOpenFailedMessage,
  translateKnownFileDialogTitle,
} from "./file-runtime-i18n";

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
      message: getFileOpenFailedMessage(),
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
        title: translateKnownFileDialogTitle(input.dialogTitle),
      });

      if (result.opened) {
        return {
          opened: true,
          message: getFileOpenedMessage(),
        };
      }

      const shareResult = await shareFileWithNativeShell({
        blob,
        fileName,
        mimeType: blob.type || input.mimeType?.trim() || undefined,
        title: translateKnownFileDialogTitle(input.dialogTitle),
      });

      if (shareResult.shared) {
        return {
          opened: true,
          message: getFileFallbackOpenMessage(),
        };
      }

      throw new Error(
        shareResult.error || result.error || "failed to open file",
      );
    } catch {
      return {
        opened: false,
        message: getFileOpenFailedMessage(),
      };
    }
  }

  const opened = await openExternalUrl(normalizedUrl);
  return {
    opened,
    message: opened ? getFileOpenedMessage() : getFileOpenFailedMessage(),
  };
}
