export const SUPPORTED_LOCALE_CODES = [
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
] as const;

export type SupportedLocaleCode = (typeof SUPPORTED_LOCALE_CODES)[number];

export const DEFAULT_LOCALE_CODE: SupportedLocaleCode = "zh-CN";

const LOCALE_ALIASES: Record<string, SupportedLocaleCode> = {
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

export function resolveSupportedLocaleCode(
  value?: string | null,
): SupportedLocaleCode | null {
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

  const exactMatch = SUPPORTED_LOCALE_CODES.find(
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

export function resolveLocaleCodeFromAcceptLanguage(
  value?: string | null,
): SupportedLocaleCode | null {
  if (!value) {
    return null;
  }

  return value
    .split(",")
    .map((entry, index) => {
      const [rawLocale, ...params] = entry.trim().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.split("=")[1] ?? "") : 1;
      return {
        index,
        locale: resolveSupportedLocaleCode(rawLocale),
        q: Number.isFinite(q) ? q : 1,
      };
    })
    .filter(
      (entry): entry is { index: number; locale: SupportedLocaleCode; q: number } =>
        Boolean(entry.locale),
    )
    .sort((left, right) => right.q - left.q || left.index - right.index)[0]
    ?.locale ?? null;
}
