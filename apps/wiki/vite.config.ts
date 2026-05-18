import { fileURLToPath, URL } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// preview-only: 老 tab 残留的是 vite dev URL，会去拉 /src/...tsx，
// 默认 SPA 兜底 200 + index.html 让浏览器把 HTML 解成 ESM 失败，
// 报 "Failed to fetch dynamically imported module" 不直观。
// 直接 404 掉 /src/ 路径，前端 lazyWithReload 拿到错误后会自动 reload。
const blockDevSourceFallback = {
  name: "wiki-block-dev-source-fallback",
  configurePreviewServer(server: {
    middlewares: {
      use: (
        fn: (
          req: { url?: string },
          res: {
            statusCode: number;
            setHeader: (k: string, v: string) => void;
            end: (body?: string) => void;
          },
          next: () => void,
        ) => void,
      ) => void;
    };
  }) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? "";
      if (url.startsWith("/src/") || url.startsWith("/@")) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("Not Found");
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
    lingui(),
    tailwindcss(),
    blockDevSourceFallback,
  ],
  resolve: {
    alias: {
      "@yinjie/ui/tokens.css": fileURLToPath(
        new URL("../../packages/ui/src/tokens.css", import.meta.url),
      ),
      "@yinjie/ui": fileURLToPath(
        new URL("../../packages/ui/src/index.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5184,
    strictPort: true,
    allowedHosts: ["yinjieai.top", "1gw06751dd053.vicp.fun"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3045",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3045",
        changeOrigin: true,
      },
      "/telemetry": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  // vite preview 不读 server.*，必须单独配；否则 yinjieai.top 直接被 Vite 拒成
  // "Blocked request: Host not in allowedHosts"。`pnpm wiki:prod` 走的就是这块。
  preview: {
    host: "127.0.0.1",
    port: 5184,
    strictPort: true,
    allowedHosts: ["yinjieai.top", "1gw06751dd053.vicp.fun"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3045",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3045",
        changeOrigin: true,
      },
      "/telemetry": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
