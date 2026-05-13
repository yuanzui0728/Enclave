import { fileURLToPath, URL } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteCompression from "vite-plugin-compression";

function resolveManualChunk(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.includes("/node_modules/")) {
    // 公网隧道 HTTP/1.1 + RTT ~760ms，同域 6 并发上限决定首屏请求数 = 关键瓶颈。
    // 把"启动就要"的 vendor (react 链 / tanstack / zustand / tauri / capacitor /
    // 其它杂项) 合并成单个 vendor-core，让首屏 modulepreload 从 10+ 降到 ~5；
    // 单文件变大但 immutable cache 命中后只下一次，HTTP/1.1 排队收益大于体积代价。
    if (
      normalizedId.includes("/react/") ||
      normalizedId.includes("/react-dom/") ||
      normalizedId.includes("/scheduler/") ||
      normalizedId.includes("/@tanstack/") ||
      normalizedId.includes("/zustand/") ||
      normalizedId.includes("/@tauri-apps/api/") ||
      normalizedId.includes("/@capacitor/core/")
    ) {
      return "vendor-core";
    }

    if (normalizedId.includes("/lucide-react/")) {
      return "vendor-icons";
    }

    // socket.io-client (~36KB) 之前被 RootLayout 静态链上首屏；
    // ConversationStrongReminderHost 已改为 lazy() 加载后，整条 socket 链
    // 都走动态 import，本 chunk 只在 chat / desktop-chat / strong-reminder
    // 首次需要时拉。保留单独 chunk 让其它 lazy 路由共享，不被 vendor-misc 吃掉。
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

    // qrcode (~70KB) 和 html-to-image (~30KB) 只在分享/订阅二维码场景用到，
    // 但被多个动态 import 入口（share-card-modal、profile-subscription、
    // subscription-panel 各拆 dynamic import）引用 — 若不显式拆出，Rollup
    // 会把它们升级到 vendor-misc 当共享 chunk，重新挤进首屏关键路径，把
    // 动态 import 的好处吃光。这里强制单独成 chunk，只在第一次需要时拉。
    if (normalizedId.includes("/qrcode/")) {
      return "vendor-qrcode";
    }
    if (normalizedId.includes("/html-to-image/")) {
      return "vendor-html-to-image";
    }

    // @lingui runtime (~15-20KB) 拆 vendor-i18n —— catalog 自身已经按 locale
    // 单独 chunk + modulepreload，runtime 这部分原本被 vendor-misc 吃掉。
    if (normalizedId.includes("/@lingui/")) {
      return "vendor-i18n";
    }

    // @react-oauth/google (~25-35KB) 拆 vendor-oauth —— 配合 main.tsx 把
    // GoogleOAuthProvider 下沉到 welcome-page，这个 chunk 现在只在 welcome
    // 路由打开时才拉，不再吃首屏。
    if (normalizedId.includes("/@react-oauth/")) {
      return "vendor-oauth";
    }

    // 其它 node_modules 一并并入 vendor-core，进一步压缩首屏请求数。
    // 历史上 vendor-misc 容易把杂项二级依赖收成共享 chunk 反挤首屏，干脆
    // 让首屏关键的合并到 vendor-core，非首屏的 lazy chunk 在 entry 自己内联。
    return "vendor-core";
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

function resolveAppBase(command: "build" | "serve") {
  if (command !== "build") {
    return "/";
  }

  return process.env.YINJIE_APP_BUILD_BASE === "relative" ? "./" : "/";
}

function shouldEmptyOutDir(_command: "build" | "serve") {
  // 历史上为兼容已打开页签的 lazy-load 需求保留过旧 hash chunk，但实际部署
  // 现场会无限堆积（dist/assets 曾累积到 25k 文件 / 434MB）；main.tsx 已内置
  // vite:preloadError 兜底监听，旧版本页签拉不到旧 chunk 时会自动 reload，
  // 因此这里直接清空，最稳。
  return true;
}

// 公网隧道下首屏多了一个被 Vite 注入的 <link rel="stylesheet"> 阻塞渲染。
// app 的 boot screen 自带 inline critical CSS（index.html 头部），browser 完全
// 可以先把 boot screen 画出来，主 CSS 异步到位后再切到正式 UI。把 build 输出的
// stylesheet link 改成 preload + onload 切换 rel='stylesheet' 的异步加载形态，
// 省掉 1 个阻塞渲染的 RTT。<noscript> 兜底覆盖禁用 JS 的极端情况。
function asyncCssPlugin() {
  return {
    name: "yinjie-app-async-css",
    enforce: "post" as const,
    transformIndexHtml(html: string) {
      return html.replace(
        /<link\s+rel="stylesheet"([^>]*?)href="([^"]+)"([^>]*)>/g,
        (_match, before, href, after) => {
          const otherAttrs = `${before}${after}`.trim();
          return `<link rel="preload" as="style" href="${href}" ${otherAttrs} onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${href}" ${otherAttrs}></noscript>`;
        },
      );
    },
  };
}

// i18n catalog 是 dynamic import（catalog-loaders.ts: import("../../catalogs/.../*.po")），
// Vite 默认的 entry-graph modulepreload 不会覆盖 — 浏览器必须等 entry 执行后
// 才发现这个 import，再发起一次网络请求。公网隧道 RTT ~430ms 下这一跳很贵。
// 这里在 build 时注入一段 inline <script>：HTML 解析阶段就根据用户 locale
// (localStorage / navigator.language) 动态 appendChild 出对应 locale 的 catalog
// chunk 的 <link rel="modulepreload">，与 entry script 下载并行，省 1 个 RTT。
// SSR 模式无 bundle，dev 模式不需要（catalogs 直接从源拉），所以仅 build 生效。
function catalogPreloadPlugin() {
  // packages/i18n 同时为 5 个 surface (app/admin/cloud-console/site/wiki) 生成 catalog
  // 文件，dist 里会有形如 zh-CN-<hash>.js 的 30+ 个文件，但 app surface 实际只
  // 会 dynamic import shared + app 这 2 个。光按文件名前缀匹配会把其他 surface
  // 的 catalog 也预加载（白白浪费 ~150KB/locale 流量）。用 rollup chunk 的
  // facadeModuleId 精确定位源自 catalogs/shared/<locale>.po 或 catalogs/app/<locale>.po
  // 的 chunk，其他 surface 一律忽略。
  type RollupChunkLike = {
    facadeModuleId?: string | null;
    type?: string;
  };
  return {
    name: "yinjie-app-catalog-preload",
    enforce: "post" as const,
    transformIndexHtml: {
      order: "post" as const,
      handler(
        html: string,
        ctx: { bundle?: Record<string, RollupChunkLike> },
      ) {
        if (!ctx.bundle) return html;
        const catalogMap: Record<string, string[]> = {
          "zh-CN": [],
          "en-US": [],
          "ja-JP": [],
          "ko-KR": [],
        };
        const facadeMatch =
          /\/catalogs\/(shared|app)\/(zh-CN|en-US|ja-JP|ko-KR)\.po(?:[?#]|$)/;
        for (const [fileName, chunk] of Object.entries(ctx.bundle)) {
          if (!chunk || chunk.type !== "chunk") continue;
          const facadeId = chunk.facadeModuleId;
          if (!facadeId) continue;
          const match = facadeMatch.exec(facadeId);
          if (!match) continue;
          catalogMap[match[2]].push("/" + fileName);
        }
        if (Object.values(catalogMap).every((arr) => arr.length === 0)) {
          return html;
        }
        const inlineScript = `<script>(function(){try{var s=null;try{s=localStorage.getItem('yinjie-i18n-locale:app');}catch(_){}var lang=(s||navigator.language||'').toLowerCase();var locale='zh-CN';if(lang.indexOf('zh')===0)locale='zh-CN';else if(lang.indexOf('en')===0)locale='en-US';else if(lang.indexOf('ja')===0)locale='ja-JP';else if(lang.indexOf('ko')===0)locale='ko-KR';var m=${JSON.stringify(catalogMap)};var arr=m[locale]||[];for(var i=0;i<arr.length;i++){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href=arr[i];document.head.appendChild(l);}}catch(e){}})();</script>`;
        return html.replace("</head>", `    ${inlineScript}\n  </head>`);
      },
    },
  };
}

export default defineConfig(({ command }) => ({
  base: resolveAppBase(command),
  plugins: [
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
    lingui(),
    tailwindcss(),
    asyncCssPlugin(),
    catalogPreloadPlugin(),
    // 公网隧道下首屏要省字节，vite-plugin-compression 在构建期生成 *.gz 同名
    // 兄弟文件，nginx 通过 gzip_static on 直接吐，不再现压（CPU + 体积同省）。
    viteCompression({
      algorithm: "gzip",
      ext: ".gz",
      threshold: 1024,
      deleteOriginFile: false,
    }),
    // brotli 比 gzip 再小 ~15-20%，对应 nginx brotli_static on（nginx-extras）。
    // 浏览器优先用 br，没有则回落 gzip，再没有就拿原始文件。两份预压缩并存
    // 没有 CPU 代价（构建期一次生成）。
    viteCompression({
      algorithm: "brotliCompress",
      ext: ".br",
      threshold: 1024,
      deleteOriginFile: false,
    }),
    // SW 已下线（之前 vite-plugin-pwa generateSW 把所有 chunk precache + CacheFirst
    // 拦截，多次构建之间用户死活拿不到新代码）。public/sw.js 改成「自毁开关」
    // 接管历史装机，main.tsx 也不再 register，新用户根本不会装 SW。
  ],
  build: {
    emptyOutDir: shouldEmptyOutDir(command),
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
      "@yinjie/i18n": fileURLToPath(new URL("../../packages/i18n/src/index.ts", import.meta.url)),
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
      // 远程访问（花生壳/反代）时，前端 cloudApiBaseUrl 回落到浏览器同源，
      // 这里把 /cloud/* 转发到本机 cloud-api（端口 3001）。
      "/cloud": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/admin/cloud": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      // 客户端埋点 SDK 上报到 cloud-api 的 telemetry 入口。
      "/telemetry": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
}));
