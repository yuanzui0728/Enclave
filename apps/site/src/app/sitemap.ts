import type { MetadataRoute } from "next";
import { SUPPORTED_LOCALES } from "@/lib/locales";
import { SITE_BASE_URL } from "@/lib/seo-metadata";
import { USE_CASE_SLUGS } from "@/lib/use-cases-data";

// Static page paths (one entry per locale).
const STATIC_PATHS = [
  "",
  "download",
  "changelog",
  "use-cases",
  "press-kit",
  "privacy",
  "terms",
] as const;

// Per-route lastmod. Bump the date when the corresponding page's content
// actually changes — using `new Date()` would reset on every build and
// signal stale-but-resaved content to crawlers (anti-pattern for SEO).
const LAST_MOD_BY_PATH: Record<(typeof STATIC_PATHS)[number], string> = {
  "": "2026-05-07",
  download: "2026-05-07",
  changelog: "2026-04-24",
  "use-cases": "2026-05-07",
  "press-kit": "2026-05-11",
  privacy: "2026-05-07",
  terms: "2026-05-07",
};

const CHANGE_FREQ: Record<(typeof STATIC_PATHS)[number], "weekly" | "monthly"> = {
  "": "weekly",
  download: "monthly",
  changelog: "weekly",
  "use-cases": "monthly",
  "press-kit": "monthly",
  privacy: "monthly",
  terms: "monthly",
};

const PRIORITY: Record<(typeof STATIC_PATHS)[number], number> = {
  "": 1,
  download: 0.7,
  changelog: 0.7,
  "use-cases": 0.7,
  "press-kit": 0.6,
  privacy: 0.5,
  terms: 0.5,
};

const USE_CASE_LAST_MOD = "2026-05-07";

function entry(
  locale: string,
  path: string,
  lastMod: string,
  changeFrequency: "weekly" | "monthly",
  priority: number,
): MetadataRoute.Sitemap[number] {
  const tail = path ? `/${path}` : "";
  return {
    url: `${SITE_BASE_URL}/${locale}${tail}`,
    lastModified: lastMod,
    changeFrequency,
    priority,
    alternates: {
      languages: Object.fromEntries(
        SUPPORTED_LOCALES.map((l) => [l, `${SITE_BASE_URL}/${l}${tail}`]),
      ),
    },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return SUPPORTED_LOCALES.flatMap((locale) => {
    const staticEntries = STATIC_PATHS.map((p) =>
      entry(locale, p, LAST_MOD_BY_PATH[p], CHANGE_FREQ[p], PRIORITY[p]),
    );
    const useCaseEntries = USE_CASE_SLUGS.map((slug) =>
      entry(locale, `use-cases/${slug}`, USE_CASE_LAST_MOD, "monthly", 0.6),
    );
    return [...staticEntries, ...useCaseEntries];
  });
}
