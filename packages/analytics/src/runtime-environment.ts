// 判断一个 hostname 是否属于"本地/内网"（localhost / 127.x / RFC1918 私网 /
// .local/.lan/.internal 等）。telemetry SDK 用它把开发态噪声（开发者机器跑
// dev 服务器、内网测试、Tauri/Capacitor 用 localhost-shell 等）从生产信号
// 里剥掉，避免开发者本机的 HMR/资源 404 把真实生产错误淹没。
//
// 同样的判断在 apps/app/src/lib/runtime-config.ts 里也存在，是 cloud-api
// baseUrl 回落决策的依据。两边定义必须严格一致，所以共享放在这里、由 app
// 端 import 复用。
export function isLocalLikeHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "::1") return true;
  if (lower.startsWith("127.")) return true;
  if (lower.startsWith("10.") || lower.startsWith("192.168.")) return true;
  const m172 = /^172\.(\d+)\./.exec(lower);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/\.(local|lan|internal)$/i.test(lower)) return true;
  return false;
}

// 给一个完整 URL（或裸 hostname），返回它是否在本地/内网上。URL 解析失败
// 退化成 false（不丢事件，让上游别误杀正常事件）。
export function isLocalLikeUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return isLocalLikeHostname(parsed.hostname);
  } catch {
    return false;
  }
}

// 从 stack 字符串里提一个最可信的 URL（首个 http(s):// 出现的位置），
// 用于判断报错代码来自本地 dev origin 还是生产 bundle。提不出来则返回 null。
export function extractFirstUrlFromStack(stack: string | null | undefined): string | null {
  if (!stack) return null;
  const match = /https?:\/\/[^\s)'"`]+/.exec(stack);
  return match ? match[0] : null;
}

// 当前 window 是否运行在本地/内网 origin 上。SSR / Node 测试环境下没有 window
// → 返回 false（按生产处理，免得 Node 单测被默认丢弃）。
export function isCurrentOriginLocalLike(): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  return isLocalLikeHostname(window.location.hostname);
}
