import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type I18nAppSurface,
  type SupportedLocale,
  persistPreferredLocale,
  resolveInitialLocale,
  resolveSupportedLocale,
  syncDocumentLocale,
} from "../locales";
import { loadMessagesForSurface } from "./catalog-loaders";

type AppLocaleContextValue = {
  availableLocales: readonly SupportedLocale[];
  error: Error | null;
  isReady: boolean;
  locale: SupportedLocale;
  setLocale: (locale: string) => void;
  surface: I18nAppSurface;
};

type AppLocaleProviderProps = {
  children: ReactNode;
  fallback?: ReactNode;
  surface: I18nAppSurface;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function AppLocaleProvider({
  children,
  fallback = null,
  surface,
}: AppLocaleProviderProps) {
  const i18n = useMemo(() => {
    const instance = setupI18n();
    instance.activate(DEFAULT_LOCALE);
    syncDocumentLocale(DEFAULT_LOCALE);
    return instance;
  }, []);
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    resolveInitialLocale(surface),
  );
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const setLocale = useCallback(
    (nextLocale: string) => {
      const resolvedLocale =
        resolveSupportedLocale(nextLocale) ?? DEFAULT_LOCALE;
      persistPreferredLocale(surface, resolvedLocale);
      setLocaleState((currentLocale) =>
        currentLocale === resolvedLocale ? currentLocale : resolvedLocale,
      );
    },
    [surface],
  );

  useEffect(() => {
    let cancelled = false;

    async function activateLocale() {
      setIsReady(false);
      setError(null);

      try {
        const messages = await loadMessagesForSurface(surface, locale);
        if (cancelled) {
          return;
        }

        i18n.load(locale, messages);
        i18n.activate(locale);
        syncDocumentLocale(locale);
        setIsReady(true);
      } catch (cause) {
        if (cancelled) {
          return;
        }

        const nextError =
          cause instanceof Error ? cause : new Error(String(cause));

        if (locale !== DEFAULT_LOCALE) {
          persistPreferredLocale(surface, DEFAULT_LOCALE);
          setLocaleState(DEFAULT_LOCALE);
          return;
        }

        syncDocumentLocale(DEFAULT_LOCALE);
        setError(nextError);
        setIsReady(true);
      }
    }

    void activateLocale();

    return () => {
      cancelled = true;
    };
  }, [i18n, locale, surface]);

  const contextValue = useMemo<AppLocaleContextValue>(
    () => ({
      availableLocales: SUPPORTED_LOCALES,
      error,
      isReady,
      locale,
      setLocale,
      surface,
    }),
    [error, isReady, locale, setLocale, surface],
  );

  return (
    <AppLocaleContext.Provider value={contextValue}>
      <I18nProvider i18n={i18n}>
        {isReady ? children : fallback}
      </I18nProvider>
    </AppLocaleContext.Provider>
  );
}

export function useAppLocale() {
  const context = useContext(AppLocaleContext);
  if (!context) {
    throw new Error("useAppLocale must be used inside AppLocaleProvider.");
  }

  return context;
}
