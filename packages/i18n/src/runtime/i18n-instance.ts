import { setupI18n } from "@lingui/core";
import { DEFAULT_LOCALE, type SupportedLocale } from "../locales";

export const appI18n = setupI18n();

let activeLocale: SupportedLocale = DEFAULT_LOCALE;

appI18n.activate(DEFAULT_LOCALE);

export function getActiveLocale() {
  return activeLocale;
}

export function setActiveLocale(locale: SupportedLocale) {
  activeLocale = locale;
}
