import type { LinguiConfig } from "@lingui/conf";

const config: LinguiConfig = {
  locales: ["zh-CN", "en-US", "ja-JP", "ko-KR"],
  sourceLocale: "zh-CN",
  fallbackLocales: {
    default: "zh-CN",
  },
  format: "po",
  compileNamespace: "ts",
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
      path: "<rootDir>/packages/i18n/catalogs/admin/{locale}",
      include: ["<rootDir>/apps/admin/src"],
      exclude: ["**/node_modules/**"],
    },
    {
      path: "<rootDir>/packages/i18n/catalogs/cloud-console/{locale}",
      include: ["<rootDir>/apps/cloud-console/src"],
      exclude: ["**/node_modules/**"],
    },
  ],
};

export default config;
