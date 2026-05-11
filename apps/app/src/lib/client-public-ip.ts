// 花生壳 vicp.fun 是 L4 TCP 隧道，cloud-api 看到的所有请求都来自 127.0.0.1，
// 服务端拿不到真实公网 IP。这里在浏览器侧异步探一次公网 IP，作为 verify-code
// 请求体里的 clientReportedIp 上报，让 cloud-api 在服务端头全部是 loopback 时
// 用它兜底。可被伪造，仅做显示/统计用，不能作为风控/封禁的可信源。

const ENDPOINTS = [
  "https://api.ipify.org?format=json",
  "https://api64.ipify.org?format=json",
  "https://ipinfo.io/json",
];

const FETCH_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { ip: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

function isIpLiteral(value: string): boolean {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((seg) => {
      const n = Number(seg);
      return n >= 0 && n <= 255;
    });
  }
  return value.includes(":") && /^[0-9a-fA-F:.]+$/.test(value);
}

async function fetchFromEndpoint(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { ip?: unknown };
    const ip = typeof data?.ip === "string" ? data.ip.trim() : "";
    if (!ip || !isIpLiteral(ip)) return null;
    return ip;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function detectClientPublicIp(): Promise<string | null> {
  if (typeof fetch === "undefined") return null;

  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.ip;
  if (inflight) return inflight;

  inflight = (async () => {
    for (const url of ENDPOINTS) {
      const ip = await fetchFromEndpoint(url);
      if (ip) {
        cached = { ip, expiresAt: Date.now() + CACHE_TTL_MS };
        return ip;
      }
    }
    return null;
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}
