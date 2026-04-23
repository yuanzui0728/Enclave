import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import {
  DEFAULT_LOCALE,
  resolveSupportedLocale,
  type SupportedLocale,
} from "../locales";
import { appI18n, getActiveLocale } from "./i18n-instance";

type LocaleOverride = string | SupportedLocale | null | undefined;

function resolveRuntimeLocale(locale?: LocaleOverride) {
  return (
    resolveSupportedLocale(locale ?? null) ??
    getActiveLocale() ??
    DEFAULT_LOCALE
  );
}

export function formatDateTime(
  value: Date | number,
  options: Intl.DateTimeFormatOptions,
  locale?: LocaleOverride,
) {
  return new Intl.DateTimeFormat(resolveRuntimeLocale(locale), options).format(
    value,
  );
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale?: LocaleOverride,
) {
  return new Intl.NumberFormat(resolveRuntimeLocale(locale), options).format(
    value,
  );
}

export function compareByLocale(
  left: string,
  right: string,
  options?: Intl.CollatorOptions,
  locale?: LocaleOverride,
) {
  return new Intl.Collator(resolveRuntimeLocale(locale), options).compare(
    left,
    right,
  );
}

export function resolveSpeechRecognitionLocale(locale?: LocaleOverride) {
  return resolveRuntimeLocale(locale);
}

export function translateRuntimeMessage(message: MessageDescriptor) {
  return appI18n._(message);
}

export function getJustNowLabel() {
  return translateRuntimeMessage(msg`刚刚`);
}

export function getYesterdayLabel() {
  return translateRuntimeMessage(msg`昨天`);
}
