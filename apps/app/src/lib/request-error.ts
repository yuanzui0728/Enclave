const NETWORK_ERROR_MESSAGES = new Set([
  "Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "Load failed",
  "fetch failed",
]);

export function describeRequestError(error: unknown, fallback = "请求失败，请稍后重试。") {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (error.name === "AbortError") {
      return "请求已中断，请稍后重试。";
    }

    if (NETWORK_ERROR_MESSAGES.has(message)) {
      return "当前无法连接到隐界实例，请先检查世界地址和网络连接。";
    }

    return message || fallback;
  }

  return fallback;
}
