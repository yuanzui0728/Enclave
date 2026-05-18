// 把「前端上报的 appPlatform + server-side User-Agent」归一为 'mobile' / 'desktop'。
// 写入 cloud_users.lastLoginDeviceType，供管理端列表 + 设备分布饼图聚合用。
//
// 策略：
// 1. 前端 clientPlatform 是 ios/android → mobile；desktop → desktop。
// 2. clientPlatform === 'web' 或缺省（老客户端、curl 调试）→ 用 User-Agent 兜底：
//    含 iPhone / iPod / Android / Mobile / Windows Phone / BlackBerry / Opera Mini → mobile。
// 3. iPad / Tablet 归 desktop（业务方原话只分手机和电脑，平板使用横屏 UI 更接近电脑端）。
// 4. 完全没 UA 也没 platform → null（不知道，不假设）。

export type DeviceType = "mobile" | "desktop";

const MOBILE_UA = /(iphone|ipod|android|mobile|windows phone|blackberry|opera mini)/i;
const TABLET_UA = /(ipad|tablet)/i;

export function classifyDeviceType(
  clientPlatform: string | null | undefined,
  userAgent: string | null | undefined,
): DeviceType | null {
  const cp = (clientPlatform ?? "").trim().toLowerCase();
  if (cp === "ios" || cp === "android") return "mobile";
  if (cp === "desktop") return "desktop";

  const ua = (userAgent ?? "").trim();
  if (!ua) return null;
  if (MOBILE_UA.test(ua)) return "mobile";
  if (TABLET_UA.test(ua)) return "desktop";
  return "desktop";
}
