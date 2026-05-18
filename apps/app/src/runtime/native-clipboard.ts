import {
  isNativeMobileBridgeAvailable,
  readNativeClipboardText,
  writeNativeClipboardImage,
  writeNativeClipboardText,
} from "./mobile-bridge";

/**
 * 写入系统剪贴板。优先级：原生壳 (iOS UIPasteboard / Android) → Clipboard API → execCommand 兜底。
 * 始终返回 boolean，不抛异常，便于业务页用 if/else 决定 toast 文案。
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof text !== "string") {
    return false;
  }

  if (await writeNativeClipboardText(text)) {
    return true;
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 继续走 execCommand 兜底
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function readClipboardText(): Promise<string | null> {
  if (isNativeMobileBridgeAvailable()) {
    const native = await readNativeClipboardText();
    if (native !== null) {
      return native;
    }
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.readText === "function"
  ) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }

  return null;
}

export async function writeClipboardImage(
  base64Data: string,
  mimeType = "image/png",
): Promise<boolean> {
  if (await writeNativeClipboardImage(base64Data, mimeType)) {
    return true;
  }

  // Web 端兜底：尝试 ClipboardItem（仅 Chromium 系支持），否则失败
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === "function" &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      await navigator.clipboard.write([
        new ClipboardItem({ [mimeType]: blob }),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
