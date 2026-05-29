import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Noto_Sans_SC } from "next/font/google";
import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@/lib/locales";
import { SITE_BASE_URL } from "@/lib/seo-metadata";
import { siteLinks } from "@/lib/site-links";
import { SiteAnalyticsProvider } from "@/components/site-analytics-provider";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

// Self-host fonts via next/font: avoids fonts.gstatic.com round-trip,
// gets font-display: swap for free, and Next preloads the latin face.
// Noto Sans SC is heavy (CJK) — preload disabled, browser fetches on use.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-latin",
});

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans-cjk",
  preload: false,
});

// Origin for preconnect/dns-prefetch — strip path/query, keep scheme + host + port.
const SAAS_ORIGIN = (() => {
  try {
    return new URL(siteLinks.app).origin;
  } catch {
    return null;
  }
})();

// Verification codes are env-driven — set the env in production and they
// emit; leave unset and the meta tags are simply omitted.
const verificationOther: Record<string, string> = {};
if (process.env.NEXT_PUBLIC_VERIFY_BAIDU) {
  verificationOther["baidu-site-verification"] = process.env.NEXT_PUBLIC_VERIFY_BAIDU;
}
if (process.env.NEXT_PUBLIC_VERIFY_BING) {
  verificationOther["msvalidate.01"] = process.env.NEXT_PUBLIC_VERIFY_BING;
}
if (process.env.NEXT_PUBLIC_VERIFY_360) {
  verificationOther["360-site-verification"] = process.env.NEXT_PUBLIC_VERIFY_360;
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_BASE_URL),
  applicationName: "Enclave",
  appleWebApp: {
    capable: true,
    title: "Enclave",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  verification: {
    google: process.env.NEXT_PUBLIC_VERIFY_GOOGLE,
    yandex: process.env.NEXT_PUBLIC_VERIFY_YANDEX,
    other: Object.keys(verificationOther).length ? verificationOther : undefined,
  },
  other: {
    "msapplication-TileColor": "#7c5bd9",
  },
  icons: {
    // 浏览器 favicon 只用一个，多列只是徒增首屏 link 标签 + 潜在预拉。
    // PWA 模式下大尺寸 icon 仍由 manifest.webmanifest 提供，不需要在这里列。
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7c5bd9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0b1a" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Apply the persisted theme before first paint so dark mode never flashes.
// SSG HTML is locale-shared and theme-agnostic; the real theme is resolved
// here from localStorage + prefers-color-scheme and set on <html> pre-hydration.
const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem('yinjie-site-theme')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches);var t=d?'dark':'light';var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;}catch(e){}})();`;

function pickLocaleFromPath(pathname: string | null): SupportedLocale {
  if (!pathname) return DEFAULT_LOCALE;
  const seg = pathname.split("/")[1] ?? "";
  return isSupportedLocale(seg) ? seg : DEFAULT_LOCALE;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const locale = pickLocaleFromPath(h.get("x-pathname"));
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${notoSansSC.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {SAAS_ORIGIN ? (
          <>
            <link rel="preconnect" href={SAAS_ORIGIN} />
            <link rel="dns-prefetch" href={SAAS_ORIGIN} />
          </>
        ) : null}
      </head>
      <body data-locale={locale}>
        <SiteAnalyticsProvider>{children}</SiteAnalyticsProvider>
        <SwRegister />
      </body>
    </html>
  );
}
