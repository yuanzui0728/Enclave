import { Capacitor } from "@capacitor/core";

import {
  captureImageWithNativeShell,
  isNativeMobileBridgeAvailable,
  type MobileBridgeFileAsset,
  type MobileBridgeImageAsset,
  pickImagesWithNativeShell,
} from "./mobile-bridge";

/**
 * 在原生壳里弹原生相册选择器；否则降级到 `<input type="file">` 程序化点击。
 */
export async function pickImageFiles(options?: {
  multiple?: boolean;
  accept?: string;
  // 业务侧的多选上限。原生壳里 PHPicker / PickVisualMedia 拿到这个值会在
  // UI 上限制可勾选数量；不传时原生默认 9（apps/app 三条多选入口的
  // MAX_ALBUM_IMAGE_COUNT / MAX_IMAGE_COUNT 公值）。多选场景下务必显式传，
  // 避免用户勾远超上限的图触发原生层 N× 不必要的 disk write。
  limit?: number;
}): Promise<File[]> {
  const multiple = options?.multiple ?? false;

  if (isNativeMobileBridgeAvailable()) {
    const assets = await pickImagesWithNativeShell(multiple, {
      limit: options?.limit,
    });
    if (!assets.length) {
      return [];
    }
    const files = await Promise.all(
      assets.map((asset, index) =>
        readNativeBridgeImageAssetFile(asset, index).catch(() => null),
      ),
    );
    return files.filter((file): file is File => Boolean(file));
  }

  const files = await openHiddenFileInput({
    accept: options?.accept ?? "image/*",
    multiple,
  });
  return Array.from(files ?? []);
}

/**
 * 拍照入口：原生壳直接拉 Camera Intent；浏览器下用 capture="environment" 提示系统调相机。
 */
export async function captureImageFile(): Promise<File | null> {
  if (isNativeMobileBridgeAvailable()) {
    const result = await captureImageWithNativeShell();
    if (!result.asset) {
      return null;
    }
    try {
      return await readNativeBridgeImageAssetFile(result.asset, 0);
    } catch {
      return null;
    }
  }

  const files = await openHiddenFileInput({
    accept: "image/*",
    multiple: false,
    capture: "environment",
  });
  return files?.[0] ?? null;
}

function openHiddenFileInput(options: {
  accept: string;
  multiple: boolean;
  capture?: "environment" | "user";
}): Promise<File[] | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = options.accept;
    if (options.multiple) {
      input.multiple = true;
    }
    if (options.capture) {
      input.setAttribute("capture", options.capture);
    }
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";
    let settled = false;
    const finalize = (result: File[] | null) => {
      if (settled) {
        return;
      }
      settled = true;
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
      resolve(result);
    };
    const onChange = () => {
      const files = input.files ? Array.from(input.files) : [];
      finalize(files);
    };
    const onCancel = () => {
      finalize([]);
    };
    // 部分浏览器/WebView 不派发 cancel；用 window focus 兜底（用户取消后焦点会回来）
    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          finalize([]);
        }
      }, 400);
    };
    input.addEventListener("change", onChange);
    input.addEventListener("cancel", onCancel);
    window.addEventListener("focus", onWindowFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

async function readNativeBridgeImageAssetFile(
  asset: MobileBridgeImageAsset,
  index: number,
): Promise<File> {
  const source = resolveAssetSource(asset);
  if (!source) {
    throw new Error("native asset source unavailable");
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error("native asset fetch failed");
  }
  const blob = await response.blob();
  const mimeType =
    normalize(asset.mimeType) ||
    blob.type ||
    resolveMimeTypeFromFileName(asset.fileName) ||
    "image/jpeg";
  const fileName = resolveAssetFileName(asset.fileName, {
    fallbackBaseName: `image-${index + 1}`,
    mimeType,
  });
  return new File([blob], fileName, { type: mimeType });
}

function resolveAssetSource(asset: MobileBridgeFileAsset) {
  const webPath = normalize(asset.webPath);
  if (webPath) {
    if (
      webPath.startsWith("file://") ||
      webPath.startsWith("/") ||
      webPath.startsWith("content://")
    ) {
      return Capacitor.convertFileSrc(webPath);
    }
    return webPath;
  }
  const path = normalize(asset.path);
  if (!path) {
    return null;
  }
  if (
    path.startsWith("file://") ||
    path.startsWith("/") ||
    path.startsWith("content://")
  ) {
    return Capacitor.convertFileSrc(path);
  }
  return path;
}

function resolveAssetFileName(
  fileName: string | undefined,
  options: { fallbackBaseName: string; mimeType: string },
) {
  const normalized = normalize(fileName);
  if (normalized) {
    return normalized;
  }
  const extension = mimeToExtension(options.mimeType);
  return extension
    ? `${options.fallbackBaseName}.${extension}`
    : options.fallbackBaseName;
}

function mimeToExtension(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/heic") return "heic";
  return null;
}

function resolveMimeTypeFromFileName(name?: string): string | null {
  const n = normalize(name)?.toLowerCase();
  if (!n) return null;
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".heic")) return "image/heic";
  return null;
}

function normalize(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
