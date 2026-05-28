import type { MetadataRoute } from "next";
import { resolveLocaleFromRequest } from "@/lib/locale-from-request";
import { getServerI18n } from "@/i18n/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await resolveLocaleFromRequest();
  const i18n = await getServerI18n(locale);

  return {
    // id 固定，避免 start_url 改动时被浏览器识别为"新 PWA" 导致重复安装。
    id: "/?source=pwa",
    name: i18n._("隐界 Enclave"),
    short_name: "Enclave",
    description: i18n._(
      "一个属于你的私人助手世界。各行各业的 AI 专家 + 你的分身，记得你、主动帮你——浏览器即开即用。",
    ),
    start_url: `/${locale}`,
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fffcf5",
    theme_color: "#f97316",
    lang: locale,
    categories: ["social", "entertainment", "lifestyle"],
    icons: [
      { src: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { src: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // 安装弹窗里展示的应用预览。390x844 是 iPhone 13 mini 实拍尺寸，
    // form_factor: "narrow" 让 Chrome / Edge 在移动端弹窗优先用这组图。
    screenshots: [
      {
        src: `/screenshots/${locale}/experts.png`,
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: i18n._("专家居民"),
      },
      {
        src: `/screenshots/${locale}/chat.png`,
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: i18n._("AI 私聊"),
      },
      {
        src: `/screenshots/${locale}/group.png`,
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: i18n._("AI 群聊"),
      },
      {
        src: `/screenshots/${locale}/moments.png`,
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: i18n._("朋友圈"),
      },
    ],
    // 长按桌面图标显示的快捷入口（Android Chrome / Edge 支持，iOS 暂忽略）。
    // 注意：url 必须在 manifest scope 内（同源同前缀），跨源链接会被浏览器静默丢弃，
    // 所以这里指向站内路由而非 SaaS App 域名。
    shortcuts: [
      {
        name: i18n._("下载 App"),
        short_name: i18n._("下载"),
        description: i18n._("查看各平台下载方式"),
        url: `/${locale}/download`,
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: i18n._("用例展示"),
        short_name: i18n._("用例"),
        description: i18n._("看看大家用 Enclave 做什么"),
        url: `/${locale}/use-cases`,
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: i18n._("更新日志"),
        short_name: i18n._("更新"),
        description: i18n._("查看产品最新更新"),
        url: `/${locale}/changelog`,
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
