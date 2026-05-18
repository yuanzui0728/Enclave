// 对外分享链接统一走官网域名 1gw06751dd053.vicp.fun（当前唯一上线的公网入口，
// 由 nginx 反代到 site 5185）。enclaveai.top 还没上线，不能拿出去给朋友点。
// 不能用 window.location.origin — 用户实际访问 app 的 host 可能是 localhost /
// 内网 IP / 临时 NAT 反代，把这些 host 拼进 share URL 发出去给朋友，朋友点开
// 就是 404 / 拒绝连接。
//
// 只用于"share to others"语义的链接（系统分享、复制链接、QR 邀请、二维码扫码等）。
// "在浏览器打开"、"移动端 handoff"这类指向当前用户自身设备的链接仍然用
// window.location.origin — 那些场景的目标本来就是用户自己的 host。
export const PUBLIC_SHARE_ORIGIN = "https://1gw06751dd053.vicp.fun";

export function buildPublicShareUrl(path: string): string {
  if (!path) return PUBLIC_SHARE_ORIGIN;
  if (/^https?:\/\//i.test(path)) return path;
  return `${PUBLIC_SHARE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
