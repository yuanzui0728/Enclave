import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { SITE_BASE_URL, pageUrl } from "@/lib/seo-metadata";
import { siteLinks } from "@/lib/site-links";
import { CAPABILITIES, SCREENSHOT_KEYS } from "@/lib/capabilities-data";
import { JsonLd } from "./json-ld";

// 首次上线日；后续大版本变更时手动 bump dateModified。
const DATE_PUBLISHED = "2026-05-07";
const DATE_MODIFIED = "2026-05-28";
const SOFTWARE_VERSION = process.env.NEXT_PUBLIC_SITE_VERSION ?? "0.1.0";

export async function HomeJsonLd({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const name = i18n._("隐界 Enclave");
  const description = i18n._(
    "各行各业的 AI 专家 + 你的分身，记得你、主动帮你——浏览器即开即用，免费开始你的隐界世界。",
  );

  const featureList = CAPABILITIES.map((c) => i18n._(c.title));

  const screenshot = SCREENSHOT_KEYS.map((s) => ({
    "@type": "ImageObject",
    url: `${SITE_BASE_URL}/screenshots/${locale}/${s.key}.png`,
    caption: i18n._(s.title),
  }));

  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    alternateName: ["Enclave", "隐界"],
    applicationCategory: "SocialNetworkingApplication",
    applicationSubCategory: "ChatApplication",
    operatingSystem: "Web, Windows, macOS, Linux, iOS, Android",
    softwareRequirements: i18n._(
      "现代浏览器（Chrome 90+ / Edge 90+ / Safari 14+ / Firefox 88+）",
    ),
    url: pageUrl(locale, ""),
    description,
    image: `${SITE_BASE_URL}/${locale}/opengraph-image`,
    screenshot,
    featureList,
    softwareVersion: SOFTWARE_VERSION,
    datePublished: DATE_PUBLISHED,
    dateModified: DATE_MODIFIED,
    inLanguage: locale,
    downloadUrl: pageUrl(locale, "download"),
    releaseNotes: siteLinks.releases,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: siteLinks.app,
    },
    softwareHelp: { "@type": "CreativeWork", url: siteLinks.github },
    author: { "@id": `${SITE_BASE_URL}/#organization` },
    publisher: { "@id": `${SITE_BASE_URL}/#organization` },
  };

  return <JsonLd data={data} />;
}
