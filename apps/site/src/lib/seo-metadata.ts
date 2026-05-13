import { SUPPORTED_LOCALES, type SupportedLocale } from "./locales";

export const SITE_BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://enclaveai.top"
).replace(/\/+$/, "");

export const OG_LOCALE: Record<SupportedLocale, string> = {
  "zh-CN": "zh_CN",
  "en-US": "en_US",
  "ja-JP": "ja_JP",
  "ko-KR": "ko_KR",
};

/**
 * Build per-page hreflang alternates for the Next.js Metadata API.
 * Emits a 5-entry languages map (4 locales + x-default → zh-CN) and a
 * canonical URL pinned to the supplied locale.
 */
export function buildAlternates(locale: SupportedLocale, segment: string) {
  const tail = segment ? `/${segment.replace(/^\/+/, "")}` : "";
  return {
    canonical: `${SITE_BASE_URL}/${locale}${tail}`,
    languages: {
      ...Object.fromEntries(
        SUPPORTED_LOCALES.map((l) => [l, `${SITE_BASE_URL}/${l}${tail}`]),
      ),
      "x-default": `${SITE_BASE_URL}/zh-CN${tail}`,
    },
  };
}

export function pageUrl(locale: SupportedLocale, segment: string) {
  const tail = segment ? `/${segment.replace(/^\/+/, "")}` : "";
  return `${SITE_BASE_URL}/${locale}${tail}`;
}

export function alternateLocales(current: SupportedLocale): string[] {
  return SUPPORTED_LOCALES.filter((l) => l !== current).map((l) => OG_LOCALE[l]);
}
