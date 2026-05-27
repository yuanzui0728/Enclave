import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SUPPORTED_LOCALES, isSupportedLocale, type SupportedLocale } from "@/lib/locales";
import { loadSiteMessages } from "@/i18n/catalog-loader";
import { getServerI18n } from "@/i18n/server";
import { SiteI18nClientProvider } from "@/i18n/client-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteJsonLd } from "@/components/seo/site-json-ld";
import {
  alternateLocales,
  buildAlternates,
  OG_LOCALE,
  pageUrl,
} from "@/lib/seo-metadata";

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const i18n = await getServerI18n(locale);
  const tagline = i18n._(
    "各行各业的 AI 专家 + 你的分身，记得你、主动帮你——浏览器即开即用，免费开始你的隐界世界。",
  );
  return {
    title: {
      default: i18n._("隐界 · 一个属于你的私人助手世界"),
      template: i18n._("%s · 隐界 Enclave"),
    },
    description: tagline,
    alternates: buildAlternates(locale, ""),
    openGraph: {
      type: "website",
      url: pageUrl(locale, ""),
      siteName: "Enclave",
      locale: OG_LOCALE[locale],
      alternateLocale: alternateLocales(locale),
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  const safeLocale = locale as SupportedLocale;
  const messages = await loadSiteMessages(safeLocale);

  return (
    <SiteI18nClientProvider locale={safeLocale} messages={messages}>
      {/* Hero 动画是 LCP 候选；React 19 会把 <link> 提升到 <head>，让浏览器
          解析 HTML 时就并行抓取，省 ~300-500ms。 */}
      <link
        rel="preload"
        href={`/animations/${safeLocale}.webp`}
        as="image"
        type="image/webp"
        fetchPriority="high"
      />
      <SiteJsonLd locale={safeLocale} />
      <SiteHeader locale={safeLocale} />
      {children}
      <SiteFooter locale={safeLocale} />
    </SiteI18nClientProvider>
  );
}
