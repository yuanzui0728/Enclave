import type { Messages } from "@lingui/core";
import type { I18nAppSurface, SupportedLocale } from "../locales";

type CatalogModule = {
  messages: Messages;
};

type CatalogLoaderMap = Record<
  SupportedLocale,
  () => Promise<CatalogModule>
>;

const sharedCatalogLoaders: CatalogLoaderMap = {
  "zh-CN": () => import("../../catalogs/shared/zh-CN.po"),
  "en-US": () => import("../../catalogs/shared/en-US.po"),
  "ja-JP": () => import("../../catalogs/shared/ja-JP.po"),
  "ko-KR": () => import("../../catalogs/shared/ko-KR.po"),
};

const appCatalogLoaders: CatalogLoaderMap = {
  "zh-CN": () => import("../../catalogs/app/zh-CN.po"),
  "en-US": () => import("../../catalogs/app/en-US.po"),
  "ja-JP": () => import("../../catalogs/app/ja-JP.po"),
  "ko-KR": () => import("../../catalogs/app/ko-KR.po"),
};

const adminCatalogLoaders: CatalogLoaderMap = {
  "zh-CN": () => import("../../catalogs/admin/zh-CN.po"),
  "en-US": () => import("../../catalogs/admin/en-US.po"),
  "ja-JP": () => import("../../catalogs/admin/ja-JP.po"),
  "ko-KR": () => import("../../catalogs/admin/ko-KR.po"),
};

const cloudConsoleCatalogLoaders: CatalogLoaderMap = {
  "zh-CN": () => import("../../catalogs/cloud-console/zh-CN.po"),
  "en-US": () => import("../../catalogs/cloud-console/en-US.po"),
  "ja-JP": () => import("../../catalogs/cloud-console/ja-JP.po"),
  "ko-KR": () => import("../../catalogs/cloud-console/ko-KR.po"),
};

const siteCatalogLoaders: CatalogLoaderMap = {
  "zh-CN": () => import("../../catalogs/site/zh-CN.po"),
  "en-US": () => import("../../catalogs/site/en-US.po"),
  "ja-JP": () => import("../../catalogs/site/ja-JP.po"),
  "ko-KR": () => import("../../catalogs/site/ko-KR.po"),
};

const surfaceCatalogLoaders: Record<I18nAppSurface, CatalogLoaderMap> = {
  app: appCatalogLoaders,
  admin: adminCatalogLoaders,
  "cloud-console": cloudConsoleCatalogLoaders,
  site: siteCatalogLoaders,
};

const messageCache = new Map<string, Promise<Messages>>();

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const JAPANESE_KANA_PATTERN = /[\u3040-\u30ff]/;
const KOREAN_HANGUL_PATTERN = /[\uac00-\ud7af]/;
const SIMPLIFIED_CHINESE_MARKER_PATTERN =
  /[个条项进运这为时对队关务续联调实测门复义状数读写优级险备错页启线]/;

export async function loadMessagesForSurface(
  surface: I18nAppSurface,
  locale: SupportedLocale,
) {
  const cacheKey = `${surface}:${locale}`;
  const cachedMessages = messageCache.get(cacheKey);
  if (cachedMessages) {
    return cachedMessages;
  }

  const messagesPromise =
    locale === "ja-JP" || locale === "ko-KR"
      ? Promise.all([
          sharedCatalogLoaders["en-US"](),
          surfaceCatalogLoaders[surface]["en-US"](),
          sharedCatalogLoaders[locale](),
          surfaceCatalogLoaders[surface][locale](),
        ]).then(
          ([
            fallbackSharedCatalog,
            fallbackSurfaceCatalog,
            sharedCatalog,
            surfaceCatalog,
          ]) =>
            mergeMessagesWithLocaleFallback(
              {
                ...sharedCatalog.messages,
                ...surfaceCatalog.messages,
              },
              {
                ...fallbackSharedCatalog.messages,
                ...fallbackSurfaceCatalog.messages,
              },
              locale,
            ),
        )
      : Promise.all([
          sharedCatalogLoaders[locale](),
          surfaceCatalogLoaders[surface][locale](),
        ]).then(([sharedCatalog, surfaceCatalog]) => ({
          ...sharedCatalog.messages,
          ...surfaceCatalog.messages,
        }) satisfies Messages);

  messageCache.set(cacheKey, messagesPromise);
  return messagesPromise;
}

export function prefetchMessagesForSurface(
  surface: I18nAppSurface,
  locales: readonly SupportedLocale[],
) {
  locales.forEach((locale) => {
    void loadMessagesForSurface(surface, locale).catch(() => {
      messageCache.delete(`${surface}:${locale}`);
    });
  });
}

function mergeMessagesWithLocaleFallback(
  primaryMessages: Messages,
  fallbackMessages: Messages,
  locale: SupportedLocale,
) {
  const mergedMessages: Messages = { ...fallbackMessages };

  for (const [key, value] of Object.entries(primaryMessages)) {
    mergedMessages[key] = isLikelyMissingLocaleMessage(value, locale)
      ? fallbackMessages[key] ?? value
      : value;
  }

  return mergedMessages;
}

function isLikelyMissingLocaleMessage(
  value: Messages[string],
  locale: SupportedLocale,
) {
  if (typeof value !== "string" && !Array.isArray(value)) {
    return false;
  }

  const serializedValue = Array.isArray(value) ? value.join("") : value;
  if (!CJK_PATTERN.test(serializedValue)) {
    return false;
  }

  if (locale === "ja-JP") {
    return (
      !JAPANESE_KANA_PATTERN.test(serializedValue) &&
      SIMPLIFIED_CHINESE_MARKER_PATTERN.test(serializedValue)
    );
  }

  if (locale === "ko-KR") {
    return !KOREAN_HANGUL_PATTERN.test(serializedValue);
  }

  return false;
}
