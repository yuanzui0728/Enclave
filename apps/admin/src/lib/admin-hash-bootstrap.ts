// 云控制台一键进后台：URL 形如 #yinjie-bootstrap=<base64url-json>。
// 在 main.tsx 最早期解析并写入 localStorage，让 AdminBootstrapGate 直接放行。
// Hash 不会发到 server，比 query 安全一点。读完立刻 replaceState 清掉。
//
// 注意：必须经 setAdminRuntime / setAdminSecret 同步内存 store，不能只写 localStorage。
// store 在模块加载时一次性 readPersisted() 进入内存；如果只更新 storage，
// AdminBootstrapGate 的 useAdminRuntime() 还会拿到旧的空对象，从而错误地弹出登录页。
import { setAdminSecret } from "./admin-api";
import { setAdminRuntime } from "../runtime/admin-runtime-store";

const HASH_TOKEN = "yinjie-bootstrap";

type BootstrapPayload = {
  apiBaseUrl: string;
  adminSecret: string;
  cloudApiBaseUrl?: string;
  cloudEmail?: string | null;
  cloudWorldId?: string | null;
};

function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  // atob 返回的是按字节解释的 Latin-1 字符串；payload 是 UTF-8 编码的 JSON，
  // 要走 TextDecoder 才能拿回原始 Unicode（否则中文/emoji 会变成乱码）。
  const binary = atob(padded + padding);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function applyAdminHashBootstrap(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const rawHash = window.location.hash;
  if (!rawHash || !rawHash.includes(HASH_TOKEN)) {
    return false;
  }

  const fragment = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  const params = new URLSearchParams(fragment);
  const encoded = params.get(HASH_TOKEN);
  if (!encoded) {
    return false;
  }

  let payload: BootstrapPayload;
  try {
    const json = decodeBase64Url(encoded);
    const parsed = JSON.parse(json) as BootstrapPayload;
    if (!parsed.apiBaseUrl || !parsed.adminSecret) {
      throw new Error("missing apiBaseUrl or adminSecret");
    }
    payload = parsed;
  } catch (error) {
    console.warn("[admin] failed to decode bootstrap payload", error);
    return false;
  }

  try {
    setAdminSecret(payload.adminSecret);
    setAdminRuntime({
      apiBaseUrl: payload.apiBaseUrl,
      cloudApiBaseUrl: payload.cloudApiBaseUrl,
      cloudEmail: payload.cloudEmail ?? undefined,
      cloudWorldId: payload.cloudWorldId ?? undefined,
    });
  } catch (error) {
    console.warn("[admin] failed to persist bootstrap payload", error);
    return false;
  }

  // 把 bootstrap 段从 URL 抹掉，避免 hash 残留 / 分享时泄露 admin secret。
  params.delete(HASH_TOKEN);
  const remaining = params.toString();
  const newHash = remaining ? `#${remaining}` : "";
  try {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${newHash}`,
    );
  } catch {
    // history.replaceState 失败不致命，最坏 hash 留着，刷新一次就好
  }

  return true;
}
