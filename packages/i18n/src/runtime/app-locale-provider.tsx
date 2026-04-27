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
  persistPreferredLocale,
  readQueryLocale,
  syncDocumentLocale,
} from "../locales";
import { appI18n, setActiveLocale } from "./i18n-instance";
import {
  loadMessagesForSurface,
  loadTextDictionaryForSurface,
  prefetchMessagesForSurface,
} from "./catalog-loaders";
import { DomTextLocalizer } from "./dom-text-localizer";

type AppLocaleContextValue = {
  activationVersion: number;
  availableLocales: readonly SupportedLocale[];
  error: Error | null;
  isSwitchingLocale: boolean;
  isReady: boolean;
  locale: SupportedLocale;
  requestedLocale: SupportedLocale;
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
  const initialLocale = useMemo(() => {
    const queryLocale = readQueryLocale();
    const resolvedLocale = resolveInitialLocale(surface);
    if (queryLocale) {
      persistPreferredLocale(surface, queryLocale);
    }
    return resolvedLocale;
  }, [surface]);
  const [requestedLocale, setRequestedLocale] =
    useState<SupportedLocale>(initialLocale);
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [activationVersion, setActivationVersion] = useState(0);
  const [textDictionary, setTextDictionary] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const hasActivatedLocaleRef = useRef(false);

  const setLocale = useCallback(
    (nextLocale: string) => {
      const resolvedLocale =
        resolveSupportedLocale(nextLocale) ?? DEFAULT_LOCALE;
      persistPreferredLocale(surface, resolvedLocale);
      startTransition(() => {
        setRequestedLocale((currentLocale) =>
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
        const [messages, nextTextDictionary] = await Promise.all([
          loadMessagesForSurface(surface, requestedLocale),
          loadTextDictionaryForSurface(surface, requestedLocale),
        ]);
        if (cancelled) {
          return;
        }

        appI18n.load(requestedLocale, messages);
        appI18n.activate(requestedLocale);
        setActiveLocale(requestedLocale);
        syncDocumentLocale(requestedLocale);
        setLocaleState(requestedLocale);
        setTextDictionary(nextTextDictionary);
        hasActivatedLocaleRef.current = true;
        setIsReady(true);
        setActivationVersion((currentVersion) => currentVersion + 1);
      } catch (cause) {
        if (cancelled) {
          return;
        }

        const nextError =
          cause instanceof Error ? cause : new Error(String(cause));

        if (requestedLocale !== DEFAULT_LOCALE) {
          startTransition(() => setRequestedLocale(DEFAULT_LOCALE));
          return;
        }

        syncDocumentLocale(DEFAULT_LOCALE);
        setActiveLocale(DEFAULT_LOCALE);
        setLocaleState(DEFAULT_LOCALE);
        setTextDictionary(new Map());
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
  }, [requestedLocale, surface]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      prefetchMessagesForSurface(
        surface,
        SUPPORTED_LOCALES.filter(
          (availableLocale) => availableLocale !== locale,
        ),
      );
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [isReady, locale, surface]);

  const contextValue = useMemo<AppLocaleContextValue>(
    () => ({
      activationVersion,
      availableLocales: SUPPORTED_LOCALES,
      error,
      isSwitchingLocale: requestedLocale !== locale,
      isReady,
      locale,
      requestedLocale,
      setLocale,
      surface,
    }),
    // activationVersion forces consumers that call imperative translation
    // helpers during render to recompute after Lingui finishes activating.
    [
      activationVersion,
      error,
      isReady,
      locale,
      requestedLocale,
      setLocale,
      surface,
    ],
  );

  return (
    <AppLocaleContext.Provider value={contextValue}>
      <I18nProvider i18n={appI18n}>
        {isReady ? (
          <>
            <DomTextLocalizer
              dictionary={textDictionary}
              locale={locale}
              version={activationVersion}
            />
            {children}
          </>
        ) : (
          fallback
        )}
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
