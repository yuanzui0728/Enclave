import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TELEMETRY_UPSTREAM =
  process.env.SITE_TELEMETRY_UPSTREAM ?? "http://127.0.0.1:3001";

const LONG_CACHE = "public, max-age=31536000, immutable";
const HTML_CACHE = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  transpilePackages: ["@yinjie/i18n", "@yinjie/ui"],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    swcPlugins: [["@lingui/swc-plugin", {}]],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.po$/,
      use: ["@lingui/loader"],
    });
    return config;
  },
  async rewrites() {
    // beforeFiles 让代理在 i18n middleware 的 locale 重定向之前命中，
    // 否则 /telemetry/events/batch 会被改写成 /zh-CN/telemetry/... 308。
    return {
      beforeFiles: [
        {
          source: "/telemetry/:path*",
          destination: `${TELEMETRY_UPSTREAM}/telemetry/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: "/_next/static/:path*", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      { source: "/_next/image", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      { source: "/screenshots/:path*", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      { source: "/animations/:path*", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      { source: "/brand/:path*", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      // HTML 页面：浏览器立即重验，CDN 可缓存 10 分钟，过期后 SWR 一天
      { source: "/", headers: [{ key: "Cache-Control", value: HTML_CACHE }] },
      {
        source: "/:locale((?!_next|api|telemetry|opengraph-image).*)",
        headers: [{ key: "Cache-Control", value: HTML_CACHE }],
      },
    ];
  },
};

export default config;
