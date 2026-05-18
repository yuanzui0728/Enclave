import { Suspense } from "react";
import type { Metadata } from "next";
import { isSupportedLocale, type SupportedLocale } from "@/lib/locales";
import { getServerI18n } from "@/i18n/server";
import {
  alternateLocales,
  buildAlternates,
  OG_LOCALE,
  pageUrl,
} from "@/lib/seo-metadata";
import { HeroSection } from "@/components/hero-section";
import { BYOKAndCloudSection } from "@/components/byok-and-cloud-section";
import { CapabilityGrid } from "@/components/capability-grid";
import { MultiPlatformCarousel } from "@/components/multi-platform-carousel";
import { OnePersonWorld } from "@/components/one-person-world";
import { CrossPlatformSection } from "@/components/cross-platform-section";
import { GetStartedCta } from "@/components/get-started-cta";
import { FaqAccordion } from "@/components/faq-accordion";
import { HomeJsonLd } from "@/components/seo/home-json-ld";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const i18n = await getServerI18n(locale);
  const title = i18n._("隐界 · 一个属于你的 AI 虚拟世界");
  const description = i18n._(
    "私人 AI 居民、朋友圈、群聊、电话——浏览器即开即用，免费开始你的隐界世界。",
  );
  return {
    title,
    description,
    alternates: buildAlternates(locale, ""),
    openGraph: {
      type: "website",
      url: pageUrl(locale, ""),
      title,
      description,
      siteName: "Enclave",
      locale: OG_LOCALE[locale],
      alternateLocale: alternateLocales(locale),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isSupportedLocale(locale) ? locale : "zh-CN") as SupportedLocale;

  return (
    <>
      <HomeJsonLd locale={safeLocale} />
      <HeroSection locale={safeLocale} />
      <BYOKAndCloudSection locale={safeLocale} />
      <CapabilityGrid locale={safeLocale} />
      {/* 折叠下方组件用 Suspense 让 Next.js 走 streaming HTML，首屏 Hero+Capability
          能提前 flush，后端 i18n/数据并行渲染。Suspense 完成后整页仍是完整 HTML，
          对 SEO 无影响。 */}
      <Suspense fallback={null}>
        <MultiPlatformCarousel locale={safeLocale} />
        <OnePersonWorld locale={safeLocale} />
        <CrossPlatformSection locale={safeLocale} />
        <GetStartedCta locale={safeLocale} />
        <FaqAccordion locale={safeLocale} />
      </Suspense>
    </>
  );
}
