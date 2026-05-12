import type { Messages } from "@lingui/core";
import type { I18nAppSurface, SupportedLocale } from "../locales";
import { getSurfaceTextDictionary } from "./surface-text-dictionaries";

type CatalogModule = {
  messages: Messages;
};

type CatalogLoaderMap = Record<SupportedLocale, () => Promise<CatalogModule>>;

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

const wikiCatalogLoaders: CatalogLoaderMap = {
  "zh-CN": () => import("../../catalogs/wiki/zh-CN.po"),
  "en-US": () => import("../../catalogs/wiki/en-US.po"),
  "ja-JP": () => import("../../catalogs/wiki/ja-JP.po"),
  "ko-KR": () => import("../../catalogs/wiki/ko-KR.po"),
};

const surfaceCatalogLoaders: Record<I18nAppSurface, CatalogLoaderMap> = {
  app: appCatalogLoaders,
  admin: adminCatalogLoaders,
  "cloud-console": cloudConsoleCatalogLoaders,
  site: siteCatalogLoaders,
  wiki: wikiCatalogLoaders,
};

const messageCache = new Map<string, Promise<Messages>>();
const textDictionaryCache = new Map<
  string,
  Promise<ReadonlyMap<string, string>>
>();

const CJK_PATTERN = /[㐀-䶿一-鿿豈-﫿]/;

export async function loadMessagesForSurface(
  surface: I18nAppSurface,
  locale: SupportedLocale,
) {
  const cacheKey = `${surface}:${locale}`;
  const cachedMessages = messageCache.get(cacheKey);
  if (cachedMessages) {
    return cachedMessages;
  }

  // 历史上 ja-JP / ko-KR 会额外并行拉一份 en-US catalog 作 runtime fallback：
  // 启发式 (isLikelyMissingLocaleMessage) 判定"翻译里还是简体中文"，命中就
  // 替换成 en-US 译文。公网隧道 ~430ms RTT 下这等于每个 ja/ko 用户首屏多拉
  // 2 个 chunk ~280KB + 占用 2 个并发槽 + 全表 heuristic 扫描。
  // 实测当前所有 ja/ko 未译键的 en-US 值也是同样的中文 (en-US 也没翻完)，
  // runtime fallback 一个键都救不回来。i18n:compile 后挂的
  // merge-locale-fallback.mjs 在构建期发现 en-US 比 target locale 有更好
  // 翻译时直接写入 target catalog，所以 runtime 只拉本地化 catalog 一份即可。
  const messagesPromise = Promise.all([
    sharedCatalogLoaders[locale](),
    surfaceCatalogLoaders[surface][locale](),
  ]).then(
    ([sharedCatalog, surfaceCatalog]) =>
      ({
        ...sharedCatalog.messages,
        ...surfaceCatalog.messages,
      }) satisfies Messages,
  );

  messageCache.set(cacheKey, messagesPromise);
  return messagesPromise;
}

export async function loadTextDictionaryForSurface(
  surface: I18nAppSurface,
  locale: SupportedLocale,
) {
  const cacheKey = `${surface}:${locale}`;
  const cachedDictionary = textDictionaryCache.get(cacheKey);
  if (cachedDictionary) {
    return cachedDictionary;
  }

  const dictionaryPromise =
    locale === "zh-CN"
      ? Promise.resolve(mergeTextDictionaries(new Map(), surface, locale))
      : Promise.all([
          sharedCatalogLoaders["zh-CN"](),
          surfaceCatalogLoaders[surface]["zh-CN"](),
          loadMessagesForSurface(surface, locale),
        ]).then(([sourceSharedCatalog, sourceSurfaceCatalog, targetMessages]) =>
          mergeTextDictionaries(
            createTextDictionary(
              {
                ...sourceSharedCatalog.messages,
                ...sourceSurfaceCatalog.messages,
              },
              targetMessages,
            ),
            surface,
            locale,
          ),
        );

  textDictionaryCache.set(cacheKey, dictionaryPromise);
  return dictionaryPromise;
}

function mergeTextDictionaries(
  dictionary: ReadonlyMap<string, string>,
  surface: I18nAppSurface,
  locale: SupportedLocale,
) {
  const mergedDictionary = new Map(dictionary);
  getSurfaceTextDictionary(surface, locale).forEach((value, key) => {
    mergedDictionary.set(key, value);
  });
  return mergedDictionary;
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

function createTextDictionary(
  sourceMessages: Messages,
  targetMessages: Messages,
) {
  const dictionary = new Map<string, string>();

  for (const [key, sourceValue] of Object.entries(sourceMessages)) {
    const sourceText = getSimpleMessageText(sourceValue);
    if (!sourceText || !CJK_PATTERN.test(sourceText)) {
      continue;
    }

    const targetText = getSimpleMessageText(targetMessages[key]);
    if (!targetText || targetText === sourceText) {
      continue;
    }

    dictionary.set(sourceText, targetText);
  }

  return dictionary;
}

function getSimpleMessageText(value: Messages[string] | undefined) {
  if (typeof value === "string") {
    return value;
  }

  if (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string"
  ) {
    return value[0];
  }

  return null;
}
