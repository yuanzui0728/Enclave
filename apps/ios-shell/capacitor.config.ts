import type { CapacitorConfig } from "@capacitor/cli";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ShellConfig = {
  appId: string;
  appName: string;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const shellConfig = JSON.parse(
  readFileSync(path.join(here, "ios-shell.config.json"), "utf8"),
) as ShellConfig;

const config: CapacitorConfig = {
  appId: shellConfig.appId,
  appName: shellConfig.appName,
  webDir: "../app/dist-mobile",
  ios: {
    scheme: "capacitor",
    contentInset: "always",
    preferredContentMode: "mobile",
    limitsNavigationsToAppBoundDomains: false,
    // WKWebView 默认背景白色。LaunchScreen.storyboard 跟 SplashScreen plugin
    // 都已经用 #070c14 深蓝（Round 14 修过 LaunchScreen），但 splash 隐藏
    // 之后到 HTML/CSS 真正画上之前那一帧，WKWebView 本体显出来仍然是白底。
    // 真机冷启 / 慢网 / 老机型上 web bundle 解析需要 1-2s，正好夹在 splash
    // launchShowDuration=1000 自动隐和 React 首屏渲染之间，用户看到「深蓝
    // splash → 白闪一下 → 深蓝内容」。设 ios.backgroundColor=#070c14 让
    // WebView 自己的底色也跟 splash / 首屏 CSS 对齐，整条路径深蓝到底。
    backgroundColor: "#070c14",
    // 关掉 WKWebView 默认的 Peek-and-Pop 链接预览。聊天消息 / 朋友圈正文里
    // 经常带 URL，长按打开我们自己的上下文菜单（转发 / 复制 / 删除）；如果
    // 留着 allowsLinkPreview=true（Capacitor 默认值），长按链接本身会被
    // iOS 抢去弹一个 mini-Safari 预览，把我们的菜单直接挡住，用户也会
    // 困惑「这是从哪儿冒出来的浏览器」。
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1000,
      backgroundColor: "#070c14",
      splashFullScreen: true,
      splashImmersive: true,
      showSpinner: false,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#070c14",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
