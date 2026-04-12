import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function resolveManualChunk(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.includes("/node_modules/")) {
    if (
      normalizedId.includes("/react/") ||
      normalizedId.includes("/react-dom/") ||
      normalizedId.includes("/scheduler/")
    ) {
      return "vendor-react";
    }

    if (normalizedId.includes("/@tanstack/")) {
      return "vendor-tanstack";
    }

    if (normalizedId.includes("/lucide-react/")) {
      return "vendor-icons";
    }

    if (
      normalizedId.includes("/socket.io-client/") ||
      normalizedId.includes("/engine.io-client/") ||
      normalizedId.includes("/socket.io-parser/")
    ) {
      return "vendor-socket";
    }

    if (
      normalizedId.includes("/react-hook-form/") ||
      normalizedId.includes("/@hookform/resolvers/")
    ) {
      return "vendor-forms";
    }

    if (normalizedId.includes("/zustand/")) {
      return "vendor-state";
    }

    if (
      normalizedId.includes("/@tauri-apps/api/") ||
      normalizedId.includes("/@capacitor/core/")
    ) {
      return "vendor-shell";
    }

    return "vendor-misc";
  }

  if (normalizedId.includes("/packages/ui/src/")) {
    return "workspace-ui";
  }

  if (normalizedId.includes("/packages/contracts/src/")) {
    return "workspace-contracts";
  }

  if (normalizedId.includes("/packages/config/src/")) {
    return "workspace-config";
  }

  return undefined;
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "./" : "/",
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
  resolve: {
    alias: {
      "@yinjie/ui/tokens.css": fileURLToPath(new URL("../../packages/ui/src/tokens.css", import.meta.url)),
      "@yinjie/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
      "@yinjie/config": fileURLToPath(new URL("../../packages/config/src/index.ts", import.meta.url)),
      "@yinjie/ui": fileURLToPath(new URL("../../packages/ui/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    allowedHosts: ["1gw06751dd053.vicp.fun"],
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
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
}));
