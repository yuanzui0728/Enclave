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

const surfaceCatalogLoaders: Record<I18nAppSurface, CatalogLoaderMap> = {
  app: appCatalogLoaders,
  admin: adminCatalogLoaders,
  "cloud-console": cloudConsoleCatalogLoaders,
};

export async function loadMessagesForSurface(
  surface: I18nAppSurface,
  locale: SupportedLocale,
) {
  const [sharedCatalog, surfaceCatalog] = await Promise.all([
    sharedCatalogLoaders[locale](),
    surfaceCatalogLoaders[surface][locale](),
  ]);

  return {
    ...sharedCatalog.messages,
    ...surfaceCatalog.messages,
  } satisfies Messages;
}
