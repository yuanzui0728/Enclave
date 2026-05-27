import type { LinguiConfig } from "@lingui/conf";

const config: LinguiConfig = {
  locales: ["zh-CN", "en-US", "ja-JP", "ko-KR"],
  sourceLocale: "zh-CN",
  fallbackLocales: {
    default: "zh-CN",
  },
  format: "po",
  compileNamespace: "ts",
  // 按 origin (file+line) 排序，等价于原来的 orderBy 函数版本，但 @lingui/conf
  // 5.9.5 之后 schema 校验只接受 string 字面量。函数版本的等价行为是「按 origin
  // 排，messageId 作 tiebreaker」，"origin" 字符串值已包含 messageId 兜底比较。
  orderBy: "origin",
  catalogs: [
    {
      path: "<rootDir>/packages/i18n/catalogs/shared/{locale}",
      include: [
        "<rootDir>/packages/i18n/src",
        "<rootDir>/packages/ui/src",
      ],
      exclude: ["**/node_modules/**"],
    },
    {
      path: "<rootDir>/packages/i18n/catalogs/app/{locale}",
      include: ["<rootDir>/apps/app/src"],
      exclude: ["**/node_modules/**"],
    },
    {
      // 隐界后台已并入 cloud-console（apps/cloud-console/src/world-admin），admin
      // catalog 继续承载这些 msg`` 源串的译文，由 cloud-console surface 合并加载
      // （见 catalog-loaders.ts 的 cloudConsoleCatalogLoaders）。
      path: "<rootDir>/packages/i18n/catalogs/admin/{locale}",
      include: ["<rootDir>/apps/cloud-console/src/world-admin"],
      exclude: ["**/node_modules/**"],
    },
    {
      // cloud-console 自身的 msg``；world-admin 子树归 admin catalog，这里排除避免重复。
      path: "<rootDir>/packages/i18n/catalogs/cloud-console/{locale}",
      include: ["<rootDir>/apps/cloud-console/src"],
      exclude: ["**/node_modules/**", "**/world-admin/**"],
    },
    {
      path: "<rootDir>/packages/i18n/catalogs/site/{locale}",
      include: ["<rootDir>/apps/site/src"],
      exclude: ["**/node_modules/**"],
    },
    {
      path: "<rootDir>/packages/i18n/catalogs/wiki/{locale}",
      include: ["<rootDir>/apps/wiki/src"],
      exclude: ["**/node_modules/**"],
    },
  ],
};

export default config;
