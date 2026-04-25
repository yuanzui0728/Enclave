import { useCallback } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { useAppLocale } from "./app-locale-provider";
import { translateRuntimeMessage } from "./formatters";

export function useRuntimeTranslator() {
  const { activationVersion, locale } = useAppLocale();

  return useCallback(
    (message: MessageDescriptor) => translateRuntimeMessage(message),
    [activationVersion, locale],
  );
}
