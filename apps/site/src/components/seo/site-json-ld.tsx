import { getServerI18n } from "@/i18n/server";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";
import { SITE_BASE_URL, pageUrl } from "@/lib/seo-metadata";
import { siteLinks } from "@/lib/site-links";
import { JsonLd } from "./json-ld";

export async function SiteJsonLd({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const orgName = i18n._("隐界 Enclave");
  const orgDescription = i18n._(
    "各行各业的 AI 专家 + 你的分身，记得你、主动帮你——浏览器即开即用，免费开始你的隐界世界。",
  );

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_BASE_URL}/#organization`,
    name: orgName,
    alternateName: ["Enclave", "隐界"],
    url: SITE_BASE_URL,
    logo: `${SITE_BASE_URL}/icon-512.png`,
    description: orgDescription,
    foundingDate: "2026",
    knowsAbout: [
      i18n._("AI 私人助手"),
      i18n._("AI 角色社交"),
      i18n._("AI 朋友圈"),
      i18n._("自部署 AI 应用"),
    ],
    sameAs: [siteLinks.github],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "yuanzui0728@gmail.com",
        availableLanguage: SUPPORTED_LOCALES,
      },
    ],
  };

  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_BASE_URL}/#website`,
    url: pageUrl(locale, ""),
    name: orgName,
    description: orgDescription,
    inLanguage: SUPPORTED_LOCALES,
    publisher: { "@id": `${SITE_BASE_URL}/#organization` },
  };

  return <JsonLd data={[organization, website]} />;
}
