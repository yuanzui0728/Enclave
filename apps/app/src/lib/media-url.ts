import {
  resolveAppCloudApiBaseUrl,
  resolveAppCoreApiBaseUrl,
} from "./runtime-config";
import {
  isCloudSessionExpired,
  useCloudSessionStore,
} from "../store/cloud-session-store";

// 把 /api/... 这类相对路径补全成完整 URL；http(s):// / blob: / data: 原样返回。
// 用于 <audio>/<video>/<img> 等媒体元素 src — 这些元素按 document.origin 解析相对路径，
// 而我们的 origin 不一定代理 /api/*（HTTPS 公网 / 原生壳），所以必须 absolutize 到 API base。
//
// 当 URL 走 cloud-api 多租户反代（路径包含 /cloud/world-api）时，把当前 cloud
// access token 附在 query string（?token=...）。理由：<video src>/<audio src>/<img src>
// 这类标签发请求时不能自定义 Authorization header，CloudClientAuthGuard 已经在
// 服务端做了 header / query 双通道兜底，与 socket.io polling 同样策略。
//
// 注意：contracts 客户端的 normalizeMomentMediaAsset 会把后端返回的相对路径
// 提前 absolutize 成 ${apiBaseUrl}${url}。所以这里收到的可能本来就是绝对 URL，
// 必须在那种形态也追加 token，不能简单依据 `/^https?:/` 直接 bail out。

// wiki 头像物理上只在 cloud-api 给 wiki-owner 账号 spawn 的 world child 的磁盘上
// （data/accounts/<wiki-owner>/wiki-avatars/）。如果还按 `/api/wiki/avatars/<file>`
// 走 /cloud/world-api 反代，cloud-api 会按当前用户的 token 路由到他自己的 world
// child，那个 child 没有这个目录 → 全量 404（实测 24h 650+ 次 resource_error）。
// cloud-api 在 /cloud/public/wiki-avatars/<file> 提供了公共静态路由直接服务
// wiki-owner 磁盘文件，不走 per-user-world 反代；这里把存量数据库里历史的
// `/api/wiki/avatars/...` 字符串透明重写到新路径，避免做存量迁移。
const WIKI_AVATAR_LEGACY_PREFIX = "/api/wiki/avatars/";
const WIKI_AVATAR_PUBLIC_PREFIX = "/cloud/public/wiki-avatars/";

function rewriteWikiAvatarPath(url: string): string {
  if (!url.startsWith(WIKI_AVATAR_LEGACY_PREFIX)) return url;
  return WIKI_AVATAR_PUBLIC_PREFIX + url.slice(WIKI_AVATAR_LEGACY_PREFIX.length);
}

export function resolveAppMediaUrl(
  maybeRelative: string | null | undefined,
): string {
  if (!maybeRelative) return "";
  const url = rewriteWikiAvatarPath(maybeRelative.trim());
  if (!url) return "";
  if (/^(?:blob:|data:)/i.test(url)) return url;

  let absolute: string;
  if (/^https?:/i.test(url)) {
    absolute = url;
  } else if (url.startsWith("/")) {
    try {
      // `/cloud/*` 走的是 cloud-api 自己（不带 /cloud/world-api 反代前缀），
      // 比如公共 wiki avatar 路由 /cloud/public/wiki-avatars/<file>。其他 `/api/*`
      // 媒体路径都走 core-api（公网部署下 = ${origin}/cloud/world-api 反代）。
      const base = url.startsWith("/cloud/")
        ? resolveAppCloudApiBaseUrl()
        : resolveAppCoreApiBaseUrl();
      absolute = `${base.replace(/\/+$/, "")}${url}`;
    } catch {
      return url;
    }
  } else {
    return url;
  }

  if (!absolute.includes("/cloud/world-api")) {
    return absolute;
  }
  // 已经显式带了 token（含 token= 或 auth_token=），不重复追加。
  if (/[?&](?:token|auth_token)=/i.test(absolute)) {
    return absolute;
  }
  const session = useCloudSessionStore.getState();
  if (!session.accessToken || isCloudSessionExpired(session.expiresAt)) {
    return absolute;
  }
  const separator = absolute.includes("?") ? "&" : "?";
  return `${absolute}${separator}token=${encodeURIComponent(session.accessToken)}`;
}
