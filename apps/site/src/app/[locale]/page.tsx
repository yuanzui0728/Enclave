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
import { TheShiftSection } from "@/components/the-shift-section";
import { ExpertResidentsSection } from "@/components/expert-residents-section";
import { CyberAvatarSection } from "@/components/cyber-avatar-section";
import { MemoryProactiveSection } from "@/components/memory-proactive-section";
import { RealOutputSection } from "@/components/real-output-section";
import { SocialWorldSection } from "@/components/social-world-section";
import { MoreFeaturesStrip } from "@/components/more-features-strip";
import { OnePersonWorld } from "@/components/one-person-world";
import { CrossPlatformSection } from "@/components/cross-platform-section";
import { BYOKAndCloudSection } from "@/components/byok-and-cloud-section";
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
  const title = i18n._("隐界 · 一个属于你的私人助手世界");
  const description = i18n._(
    "各行各业的 AI 专家 + 你的分身，记得你、主动帮你——浏览器即开即用，免费开始你的隐界世界。",
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
      {/* 叙事弧：钩子 → 是什么 → 谁住在这 → 分身 → 会记得/主动 → 出活 →
          社交世界 → 长尾 → 属于你 → 跨端 → 开源定价 → CTA → FAQ */}
      <HeroSection locale={safeLocale} />
      <TheShiftSection locale={safeLocale} />
      <ExpertResidentsSection locale={safeLocale} />
      <Suspense fallback={null}>
        <CyberAvatarSection locale={safeLocale} />
        <MemoryProactiveSection locale={safeLocale} />
        <RealOutputSection locale={safeLocale} />
        <SocialWorldSection locale={safeLocale} />
        <MoreFeaturesStrip locale={safeLocale} />
        <OnePersonWorld locale={safeLocale} />
        <CrossPlatformSection locale={safeLocale} />
        <BYOKAndCloudSection locale={safeLocale} />
        <GetStartedCta locale={safeLocale} />
        <FaqAccordion locale={safeLocale} />
      </Suspense>
    </>
  );
}
