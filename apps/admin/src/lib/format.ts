import { msg } from "@lingui/macro";
import {
  compareByLocale,
  formatDateTime as formatRuntimeDateTime,
  formatNumber,
  translateRuntimeMessage,
} from "@yinjie/i18n";

type RuntimeMessage = Parameters<typeof translateRuntimeMessage>[0];

const FALLBACK_MESSAGES = {
  none: msg`暂无`,
  notSet: msg`未设置`,
  notRecorded: msg`未记录`,
  notExecuted: msg`未执行`,
  notOccurred: msg`未发生`,
  unconfigured: msg`未配置`,
} as const satisfies Record<string, RuntimeMessage>;

export type AdminFallbackKey = keyof typeof FALLBACK_MESSAGES;

type AdminFallback = AdminFallbackKey | RuntimeMessage | string;

function isFallbackKey(value: string): value is AdminFallbackKey {
  return value in FALLBACK_MESSAGES;
}

export function resolveAdminFallbackLabel(fallback: AdminFallback = "none") {
  if (typeof fallback === "string") {
    return isFallbackKey(fallback)
      ? translateRuntimeMessage(FALLBACK_MESSAGES[fallback])
      : fallback;
  }

  return translateRuntimeMessage(fallback);
}

export function formatAdminDateTime(
  value: Date | number | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
  fallback: AdminFallback = "none",
) {
  if (value == null || value === "") {
    return resolveAdminFallbackLabel(fallback);
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" && value.trim()
      ? value
      : resolveAdminFallbackLabel(fallback);
  }

  return formatRuntimeDateTime(date, options);
}

export function formatAdminInteger(value: number) {
  return formatNumber(value, {
    maximumFractionDigits: 0,
  });
}

export function formatAdminCompactInteger(value: number) {
  return formatNumber(value, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export function formatAdminCurrency(
  value: number,
  currency: "CNY" | "USD",
  maximumFractionDigits = currency === "USD" ? 4 : 2,
) {
  return formatNumber(value || 0, {
    style: "currency",
    currency,
    maximumFractionDigits,
  });
}

export function formatAdminPercent(
  value: number,
  maximumFractionDigits = value > 0 && value < 0.1 ? 1 : 0,
) {
  return formatNumber(value, {
    style: "percent",
    maximumFractionDigits,
  });
}

export function formatAdminFixedNumber(value: number, fractionDigits = 2) {
  return formatNumber(value, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function compareAdminText(
  left: string,
  right: string,
  options?: Intl.CollatorOptions,
) {
  return compareByLocale(left, right, options);
}
