import { fileURLToPath, URL } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
    lingui(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@yinjie/ui/tokens.css": fileURLToPath(new URL("../../packages/ui/src/tokens.css", import.meta.url)),
      "@yinjie/config": fileURLToPath(new URL("../../packages/config/src/index.ts", import.meta.url)),
      "@yinjie/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
      "@yinjie/i18n": fileURLToPath(new URL("../../packages/i18n/src/index.ts", import.meta.url)),
      "@yinjie/ui": fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5181,
    // strictPort: 端口被占时直接报错退出，而不是悄悄 +1。历史上一次 nginx-app-web
    // 抢了 5180 → app vite 漂到 5181 → admin 漂到 5182 → cloud-console 漂到 5183，
    // "进入后台" 按钮的 fallback URL http://127.0.0.1:5181 反而打到了 app vite。
    strictPort: true,
    // Admin 后台所有真实接口都走 main-api（3000）和 cloud-api（3001）。
    // 没有代理时 /api/admin/* 会被 vite SPA fallback 吞掉返回 index.html，
    // 浏览器侧表现为 "Failed to fetch" / JSON 解析失败。
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "ws://127.0.0.1:3000",
        changeOrigin: true,
        ws: true,
      },
      // cloud-console / cloud-api 入口（admin 仪表盘里有跨实例查询的链路）。
      "/cloud": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/admin/cloud": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/telemetry": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
