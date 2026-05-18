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
      "@yinjie/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
      "@yinjie/i18n/runtime/surface-text-dictionaries-cloud-console": fileURLToPath(new URL("../../packages/i18n/src/runtime/surface-text-dictionaries-cloud-console.ts", import.meta.url)),
      "@yinjie/i18n": fileURLToPath(new URL("../../packages/i18n/src/index.ts", import.meta.url)),
      "@yinjie/ui": fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5182,
    // 端口被占直接报错，避免悄悄 +1 后 "进入后台" 等跳转 URL 落到错的服务上。
    strictPort: true,
  },
});
