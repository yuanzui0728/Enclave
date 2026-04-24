import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  startTransition,
} from "react";
import { I18nProvider } from "@lingui/react";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type I18nAppSurface,
  type SupportedLocale,
  resolveInitialLocale,
  resolveSupportedLocale,
  syncDocumentLocale,
} from "../locales";
import { appI18n, setActiveLocale } from "./i18n-instance";
import {
  loadMessagesForSurface,
  prefetchMessagesForSurface,
} from "./catalog-loaders";

type AppLocaleContextValue = {
  activationVersion: number;
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
  const [locale, setLocaleState] = useState<SupportedLocale>(() =>
    resolveInitialLocale(surface),
  );
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [activationVersion, setActivationVersion] = useState(0);
  const hasActivatedLocaleRef = useRef(false);

  const setLocale = useCallback(
    (nextLocale: string) => {
      const resolvedLocale =
        resolveSupportedLocale(nextLocale) ?? DEFAULT_LOCALE;
      startTransition(() => {
        setLocaleState((currentLocale) =>
          currentLocale === resolvedLocale ? currentLocale : resolvedLocale,
        );
      });
    },
    [surface],
  );

  useEffect(() => {
    let cancelled = false;

    async function activateLocale() {
      if (!hasActivatedLocaleRef.current) {
        setIsReady(false);
      }
      setError(null);

      try {
        const messages = await loadMessagesForSurface(surface, locale);
        if (cancelled) {
          return;
        }

        appI18n.load(locale, messages);
        appI18n.activate(locale);
        setActiveLocale(locale);
        syncDocumentLocale(locale);
        hasActivatedLocaleRef.current = true;
        setIsReady(true);
        setActivationVersion((currentVersion) => currentVersion + 1);
      } catch (cause) {
        if (cancelled) {
          return;
        }

        const nextError =
          cause instanceof Error ? cause : new Error(String(cause));

        if (locale !== DEFAULT_LOCALE) {
          startTransition(() => setLocaleState(DEFAULT_LOCALE));
          return;
        }

        syncDocumentLocale(DEFAULT_LOCALE);
        setActiveLocale(DEFAULT_LOCALE);
        hasActivatedLocaleRef.current = true;
        setError(nextError);
        setIsReady(true);
        setActivationVersion((currentVersion) => currentVersion + 1);
      }
    }

    void activateLocale();

    return () => {
      cancelled = true;
    };
  }, [locale, surface]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      prefetchMessagesForSurface(
        surface,
        SUPPORTED_LOCALES.filter((availableLocale) => availableLocale !== locale),
      );
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [isReady, locale, surface]);

  const contextValue = useMemo<AppLocaleContextValue>(
    () => ({
      activationVersion,
      availableLocales: SUPPORTED_LOCALES,
      error,
      isReady,
      locale,
      setLocale,
      surface,
    }),
    // activationVersion forces consumers that call imperative translation
    // helpers during render to recompute after Lingui finishes activating.
    [activationVersion, error, isReady, locale, setLocale, surface],
  );

  return (
    <AppLocaleContext.Provider value={contextValue}>
      <I18nProvider i18n={appI18n}>
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
