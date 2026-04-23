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
    },
  },
});
