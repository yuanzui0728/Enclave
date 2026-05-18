import {
  shareWithNativeShell,
  type MobileBridgeSharePayload,
} from "./mobile-bridge";
import { writeClipboardText } from "./native-clipboard";

export type ShareTextOrUrlResult =
  | { ok: true; via: "native" | "webshare" | "clipboard" }
  | { ok: false; reason: "empty" | "cancelled" | "unsupported" };

/**
 * 文本/链接分享统一入口。优先走原生壳的 UIActivityViewController（iOS）
 * 或 Android 系统分享；其次 Web Share API；最后兜底复制到剪贴板。
 *
 * 业务页可根据 result.via 决定 toast：native/webshare 已弹原生面板不必再 toast；
 * clipboard 模式应提示"已复制链接"。
 */
export async function shareTextOrUrl(
  payload: MobileBridgeSharePayload,
): Promise<ShareTextOrUrlResult> {
  const title = payload.title?.trim() ?? "";
  const text = payload.text?.trim() ?? "";
  const url = payload.url?.trim() ?? "";

  if (!title && !text && !url) {
    return { ok: false, reason: "empty" };
  }

  if (await shareWithNativeShell({ title, text, url })) {
    return { ok: true, via: "native" };
  }

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({
        title: title || undefined,
        text: text || undefined,
        url: url || undefined,
      });
      return { ok: true, via: "webshare" };
    } catch (error) {
      // 用户取消（DOMException name === "AbortError"）算 cancelled，其他降级到剪贴板
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, reason: "cancelled" };
      }
    }
  }

  // 兜底：把 url + text 拼起来复制
  const fallback = [text, url].filter(Boolean).join("\n");
  if (fallback && (await writeClipboardText(fallback))) {
    return { ok: true, via: "clipboard" };
  }

  return { ok: false, reason: "unsupported" };
}
