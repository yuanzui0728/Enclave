import { useAppLocale } from "@yinjie/i18n";
import { siteCopy } from "./site-content";

export function useSiteCopy() {
  const { locale } = useAppLocale();
  return siteCopy[locale];
}
