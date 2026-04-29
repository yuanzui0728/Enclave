import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

type RemoteFileKind = "image" | "file";

const KNOWN_FILE_DIALOG_TITLES = {
  openFile: "\u6253\u5f00\u6587\u4ef6",
  saveImage: "\u4fdd\u5b58\u56fe\u7247",
  saveFile: "\u4fdd\u5b58\u6587\u4ef6",
  saveAttachment: "\u4fdd\u5b58\u9644\u4ef6",
} as const;

export function resolveFileKindLabel(kindLabel: string | undefined) {
  return kindLabel?.trim() || translateRuntimeMessage(msg`文件`);
}

export function resolveRemoteFileKindLabel(kind: RemoteFileKind) {
  return kind === "image"
    ? translateRuntimeMessage(msg`图片`)
    : translateRuntimeMessage(msg`文件`);
}

export function translateKnownFileDialogTitle(value?: string) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return undefined;
  }

  switch (normalizedValue) {
    case KNOWN_FILE_DIALOG_TITLES.openFile:
      return translateRuntimeMessage(msg`打开文件`);
    case KNOWN_FILE_DIALOG_TITLES.saveImage:
      return translateRuntimeMessage(msg`保存图片`);
    case KNOWN_FILE_DIALOG_TITLES.saveFile:
      return translateRuntimeMessage(msg`保存文件`);
    case KNOWN_FILE_DIALOG_TITLES.saveAttachment:
      return translateRuntimeMessage(msg`保存附件`);
    default:
      return normalizedValue;
  }
}

export function formatFileSaveFailedMessage(kindLabel: string) {
  return translateRuntimeMessage(msg`${kindLabel}保存失败，请稍后再试。`);
}

export function formatFileDownloadStartedMessage(kindLabel: string) {
  return translateRuntimeMessage(msg`${kindLabel}开始下载。`);
}

export function formatFileSharePanelMessage(kindLabel: string) {
  return translateRuntimeMessage(
    msg`${kindLabel}已打开系统分享面板，可继续保存到文件或转发给其他应用。`,
  );
}

export function getFileSaveCancelledMessage() {
  return translateRuntimeMessage(msg`已取消保存。`);
}

export function getFileOpenedMessage() {
  return translateRuntimeMessage(msg`已打开文件。`);
}

export function getFileOpenFailedMessage() {
  return translateRuntimeMessage(msg`文件打开失败，请稍后再试。`);
}

export function getFileFallbackOpenMessage() {
  return translateRuntimeMessage(
    msg`当前设备未直接预览，已打开系统面板，可继续在其他应用中打开。`,
  );
}
