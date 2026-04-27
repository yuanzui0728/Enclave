import { useEffect, useRef } from "react";
import { useAppLocale } from "@yinjie/i18n";
import {
  readNativeLocalePreference,
  syncDesktopLocalePreference,
} from "./native-locale";

export function NativeLocaleSync() {
  const { locale, syncLocaleFromExternal } = useAppLocale();
  const localeRef = useRef(locale);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    void syncDesktopLocalePreference(locale);
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let disposed = false;

    const syncFromNative = () => {
      void readNativeLocalePreference().then((preference) => {
        if (
          disposed ||
          !preference ||
          preference.locale === localeRef.current
        ) {
          return;
        }

        syncLocaleFromExternal(preference.locale);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncFromNative();
      }
    };

    syncFromNative();
    window.addEventListener("focus", syncFromNative);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      window.removeEventListener("focus", syncFromNative);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncLocaleFromExternal]);

  return null;
}
