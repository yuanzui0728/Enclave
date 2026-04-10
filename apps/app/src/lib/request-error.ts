const NETWORK_ERROR_MESSAGES = new Set([
  "Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "Load failed",
  "fetch failed",
]);
const SERVICE_UNAVAILABLE_PATTERNS = [
  /^Request failed: 5\d\d$/,
  /^Internal Server Error$/i,
  /^Service Unavailable$/i,
];

export function describeRequestError(error: unknown, fallback = "请求失败，请稍后重试。") {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (error.name === "AbortError") {
      return "请求已中断，请稍后重试。";
    }

    if (NETWORK_ERROR_MESSAGES.has(message)) {
      return "当前无法连接到隐界实例，请先检查世界地址和网络连接。";
    }

    if (SERVICE_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message))) {
      return "当前隐界实例暂时不可用，请确认世界服务已经启动后重试。";
    }

    return message || fallback;
  }

  return fallback;
}
