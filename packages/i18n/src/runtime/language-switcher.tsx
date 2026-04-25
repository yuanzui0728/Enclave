import { useId, type ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { SUPPORTED_LOCALE_LABELS } from "../locales";
import { useAppLocale } from "./app-locale-provider";

type LanguageSwitcherVariant = "panel" | "compact";

type LanguageSwitcherProps = {
  className?: string;
  description?: ReactNode | null;
  variant?: LanguageSwitcherVariant;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function LanguageSwitcher({
  className,
  description,
  variant = "panel",
}: LanguageSwitcherProps) {
  const selectId = useId();
  const { availableLocales, isSwitchingLocale, requestedLocale, setLocale } =
    useAppLocale();
  const compact = variant === "compact";
  const resolvedDescription =
    description === undefined ? (
      <Trans>
        默认使用简体中文；切换后只影响当前页面会话，并立即应用到已接入的界面文案和格式化规则。
      </Trans>
    ) : (
      description
    );

  return (
    <div
      data-i18n-skip="true"
      className={cx(
        compact
          ? "inline-flex max-w-full flex-wrap items-center rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)] px-2.5 py-1"
          : "rounded-[16px] border border-[color:var(--border-faint)] bg-white px-3.5 py-3 shadow-none",
        className,
      )}
    >
      <label
        htmlFor={selectId}
        className={cx(
          "flex items-center",
          compact ? "gap-2 text-xs" : "justify-between gap-3",
        )}
      >
        <span
          className={cx(
            compact
              ? "text-[color:var(--text-muted)]"
              : "text-[13px] font-medium text-[color:var(--text-primary)]",
          )}
        >
          <Trans>界面语言</Trans>
        </span>
        <select
          id={selectId}
          value={requestedLocale}
          aria-busy={isSwitchingLocale}
          onChange={(event) => setLocale(event.currentTarget.value)}
          className={cx(
            "rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)]",
            compact
              ? "max-w-full px-2 py-1 text-xs"
              : "min-w-[8.5rem] px-3 py-2 text-[12px]",
          )}
        >
          {availableLocales.map((availableLocale) => (
            <option key={availableLocale} value={availableLocale}>
              {SUPPORTED_LOCALE_LABELS[availableLocale]}
            </option>
          ))}
        </select>
      </label>
      {!compact && resolvedDescription ? (
        <p className="mt-2 text-[11px] leading-[1.35rem] text-[color:var(--text-muted)]">
          {resolvedDescription}
        </p>
      ) : null}
      {!compact && isSwitchingLocale ? (
        <p className="mt-1 text-[11px] leading-[1.35rem] text-[color:var(--text-muted)]">
          <Trans>正在切换语言...</Trans>
        </p>
      ) : null}
    </div>
  );
}
