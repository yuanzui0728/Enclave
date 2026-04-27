export const SUPPORTED_LOCALES = ["zh-CN", "en-US", "ja-JP", "ko-KR"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type I18nAppSurface = "app" | "admin" | "cloud-console" | "site";
export type TextDirection = "ltr" | "rtl";

export const DEFAULT_LOCALE: SupportedLocale = "zh-CN";

export const SUPPORTED_LOCALE_LABELS: Record<SupportedLocale, string> = {
  "zh-CN": "简体中文",
  "en-US": "English",
  "ja-JP": "日本語",
  "ko-KR": "한국어",
};

const LOCALE_ALIASES: Record<string, SupportedLocale> = {
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-hans-cn": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-hant": "zh-CN",
  "zh-hant-tw": "zh-CN",
  "zh-tw": "zh-CN",
  en: "en-US",
  "en-us": "en-US",
  "en-gb": "en-US",
  "en-au": "en-US",
  "en-ca": "en-US",
  ja: "ja-JP",
  "ja-jp": "ja-JP",
  ko: "ko-KR",
  "ko-kr": "ko-KR",
};

const LOCALE_DIRECTIONS: Record<SupportedLocale, TextDirection> = {
  "zh-CN": "ltr",
  "en-US": "ltr",
  "ja-JP": "ltr",
  "ko-KR": "ltr",
};

const LOCALE_STORAGE_KEY_PREFIX = "yinjie-i18n-locale";

export function resolveSupportedLocale(
  value?: string | null,
): SupportedLocale | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized in LOCALE_ALIASES) {
    return LOCALE_ALIASES[normalized] ?? null;
  }

  const exactMatch = SUPPORTED_LOCALES.find(
    (candidate) => candidate.toLowerCase() === normalized,
  );
  if (exactMatch) {
    return exactMatch;
  }

  if (normalized.startsWith("zh-")) {
    return "zh-CN";
  }

  if (normalized.startsWith("en-")) {
    return "en-US";
  }

  if (normalized.startsWith("ja-")) {
    return "ja-JP";
  }

  if (normalized.startsWith("ko-")) {
    return "ko-KR";
  }

  return null;
}

export function resolveTextDirection(locale: SupportedLocale): TextDirection {
  return LOCALE_DIRECTIONS[locale];
}

export function getLocaleStorageKey(surface: I18nAppSurface) {
  return `${LOCALE_STORAGE_KEY_PREFIX}:${surface}`;
}

export function readPersistedLocale(
  surface: I18nAppSurface,
): SupportedLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return resolveSupportedLocale(
      window.localStorage.getItem(getLocaleStorageKey(surface)),
    );
  } catch {
    return null;
  }
}

export function persistPreferredLocale(
  surface: I18nAppSurface,
  locale: SupportedLocale,
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getLocaleStorageKey(surface), locale);
  } catch {
    // Ignore storage failures and continue with in-memory locale state.
  }
}

export function readQueryLocale() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const search = new URLSearchParams(window.location.search);
    return resolveSupportedLocale(search.get("locale"));
  } catch {
    return null;
  }
}

export function detectBrowserLocale() {
  if (typeof navigator === "undefined") {
    return null;
  }

  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ].filter(Boolean);

  return resolvePreferredLocale(candidates);
}

export function resolvePreferredLocale(
  candidates?: readonly (string | null | undefined)[] | null,
): SupportedLocale | null {
  for (const candidate of candidates ?? []) {
    const resolved = resolveSupportedLocale(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

export function resolveInitialLocale(
  surface: I18nAppSurface,
  preferredLocales?: readonly string[] | null,
  initialLocale?: string | null,
) {
  return (
    readQueryLocale() ??
    resolveSupportedLocale(initialLocale) ??
    readPersistedLocale(surface) ??
    resolvePreferredLocale(preferredLocales) ??
    DEFAULT_LOCALE
  );
}

export function syncDocumentLocale(locale: SupportedLocale) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = locale;
  document.documentElement.dir = resolveTextDirection(locale);
}
