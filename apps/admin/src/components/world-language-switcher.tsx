import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  WORLD_LANGUAGE_OPTIONS,
  type WorldLanguageCode,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function WorldLanguageSwitcher() {
  const t = translateRuntimeMessage;
  const queryClient = useQueryClient();
  const baseUrl = resolveAdminCoreApiBaseUrl();

  const worldLanguageQuery = useQuery({
    queryKey: ["admin-world-language", baseUrl],
    queryFn: () => adminApi.getWorldLanguage(),
    retry: false,
  });
  const worldLanguageMutation = useMutation({
    mutationFn: (language: WorldLanguageCode) =>
      adminApi.setWorldLanguage({ language }),
    onSuccess: (result) => {
      queryClient.setQueryData(["admin-world-language", baseUrl], result);
      void queryClient.invalidateQueries({
        queryKey: ["admin-world-language"],
      });
    },
  });

  const activeLanguage = worldLanguageQuery.data?.language ?? "zh-CN";
  const options = worldLanguageQuery.data?.options ?? WORLD_LANGUAGE_OPTIONS;
  const isBusy =
    worldLanguageQuery.isLoading || worldLanguageMutation.isPending;

  return (
    <div
      data-i18n-skip="true"
      className={cx(
        "inline-flex max-w-full flex-wrap items-center rounded-full border px-2.5 py-1",
        worldLanguageMutation.isError || worldLanguageQuery.isError
          ? "border-amber-200 bg-amber-50"
          : "border-[color:var(--border-subtle)] bg-[color:var(--surface-primary)]",
      )}
      title={
        worldLanguageMutation.isError
          ? t(msg`世界语言保存失败`)
          : t(msg`切换聊天、朋友圈和世界内容生成语言`)
      }
    >
      <label className="flex items-center gap-2 text-xs">
        <span
          className={
            worldLanguageMutation.isError || worldLanguageQuery.isError
              ? "text-amber-700"
              : "text-[color:var(--text-muted)]"
          }
        >
          {t(msg`世界语言`)}
        </span>
        <select
          aria-label={t(msg`世界语言`)}
          value={activeLanguage}
          disabled={isBusy}
          onChange={(event) =>
            worldLanguageMutation.mutate(
              event.currentTarget.value as WorldLanguageCode,
            )
          }
          className="max-w-full rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-2 py-1 text-xs text-[color:var(--text-primary)] outline-none transition focus:border-[color:var(--border-brand)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.nativeLabel}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
