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
  syncLocaleFromExternal: (locale: string) => void;
};

type AppLocaleProviderProps = {
  children: ReactNode;
  fallback?: ReactNode;
  initialLocale?: string | null;
  onLocaleChange?: (locale: SupportedLocale) => unknown | Promise<unknown>;
  preferredLocales?: readonly string[];
  surface: I18nAppSurface;
  /**
   * 渲染策略：
   * - false（默认）：catalog 加载完之前显示 fallback，children 不渲染。
   *   适合 admin / cloud-console / wiki 这种内部端，对首屏字数没要求。
   * - true：立即渲染 children；catalog 还没到位时 lingui 会回落到源文 ID
   *   （隐界 app 源文是 zh-CN 中文，所以 zh-CN 用户视觉上无差别；en/ja/ko
   *   用户首屏会看到 0.3-1s 的中文 flash 然后切换到目标语言）。
   *   好处是公网隧道下首屏不再被 100KB+ catalog 下载阻塞。
   *   appI18n 在 i18n-instance.ts 已经做过 setupI18n + activate(DEFAULT_LOCALE,
   *   {})，所以 i18n._() 在 catalog 到位前调用是安全的（返回源 ID）。
   */
  renderBeforeReady?: boolean;
  /**
   * 是否在 idle 时把"其它 locale 的 catalog"预下载下来，为日后语言切换提速。
   * 默认 true。在 /welcome / /splash / /setup 这类未登录入口页 consumer 可以
   * 把它设成 false，避免给那些下一秒就关页或还在打字的用户灌 ~6MB+ 的预下载
   * 流量（zh + en + ja + ko 三个未激活 catalog 在 dev 下加起来 ~8MB raw .po，
   * prod 下 ~330KB gzipped 也不算白菜）。
   */
  prefetchOtherLocales?: boolean;
};

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function AppLocaleProvider({
  children,
  fallback = null,
  initialLocale: preferredInitialLocale = null,
  onLocaleChange,
  preferredLocales,
  surface,
  renderBeforeReady = false,
  prefetchOtherLocales = true,
}: AppLocaleProviderProps) {
  const initialLocale = useMemo(() => {
    const queryLocale = readQueryLocale();
    const resolvedLocale = resolveInitialLocale(
      surface,
      preferredLocales,
      preferredInitialLocale,
    );
    if (queryLocale) {
      persistPreferredLocale(surface, queryLocale);
    }
    return resolvedLocale;
  }, [preferredInitialLocale, preferredLocales, surface]);
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

  const applyLocale = useCallback(
    (nextLocale: string, options: { notifyNative: boolean }) => {
      const resolvedLocale =
        resolveSupportedLocale(nextLocale) ?? DEFAULT_LOCALE;
      persistPreferredLocale(surface, resolvedLocale);
      if (requestedLocale === resolvedLocale) {
        return;
      }

      if (options.notifyNative && onLocaleChange) {
        try {
          void Promise.resolve(onLocaleChange(resolvedLocale)).catch(() => {
            // Native locale sync is best-effort; the web preference remains active.
          });
        } catch {
          // Native locale sync is best-effort; the web preference remains active.
        }
      }

      startTransition(() => {
        setRequestedLocale(resolvedLocale);
      });
    },
    [onLocaleChange, requestedLocale, surface],
  );

  const setLocale = useCallback(
    (nextLocale: string) => {
      applyLocale(nextLocale, { notifyNative: true });
    },
    [applyLocale],
  );

  const syncLocaleFromExternal = useCallback(
    (nextLocale: string) => {
      applyLocale(nextLocale, { notifyNative: false });
    },
    [applyLocale],
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
    if (!prefetchOtherLocales) {
      // consumer 主动关掉了（典型场景：未登录入口页 /welcome /splash /setup
      // 这种"用户随时可能关页"的页面，避免给他们灌 ~6MB+ 的预下载）。
      return;
    }

    // 其它 locale catalog 主要用于即时语言切换。这一发预下载在公网慢网环境
    // 下有 ~330KB gzipped 的额外带宽（zh-CN / en-US / ja-JP / ko-KR 三个），
    // 直接跟用户首屏后立刻发起的交互请求抢带宽。多重防线：
    //   1) Network Information API 报 slow-2g/2g/3g 或 saveData=true → 完全跳过
    //   2) 否则 requestIdleCallback({ timeout: 30s }) 等浏览器空闲再发
    //   3) 都没有就 fallback 5s 后开始
    type ConnectionInfo = {
      effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
      saveData?: boolean;
    };
    type NavigatorWithConnection = Navigator & { connection?: ConnectionInfo };
    if (typeof navigator !== "undefined") {
      const conn = (navigator as NavigatorWithConnection).connection;
      if (conn?.saveData === true) {
        return; // Save-Data 用户明确要省流量
      }
      if (
        conn?.effectiveType === "slow-2g" ||
        conn?.effectiveType === "2g" ||
        conn?.effectiveType === "3g"
      ) {
        return; // 慢网下不预热
      }
    }

    type IdleScheduler = {
      requestIdleCallback: (
        cb: () => void,
        opts?: { timeout: number },
      ) => number;
      cancelIdleCallback: (handle: number) => void;
    };
    const idle = globalThis as Partial<IdleScheduler>;
    const fire = () =>
      prefetchMessagesForSurface(
        surface,
        SUPPORTED_LOCALES.filter(
          (availableLocale) => availableLocale !== locale,
        ),
      );

    if (
      typeof idle.requestIdleCallback === "function" &&
      typeof idle.cancelIdleCallback === "function"
    ) {
      const handle = idle.requestIdleCallback(fire, { timeout: 30_000 });
      return () => idle.cancelIdleCallback?.(handle);
    }

    const timeoutId = window.setTimeout(fire, 5_000);
    return () => window.clearTimeout(timeoutId);
  }, [isReady, locale, surface, prefetchOtherLocales]);

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
      syncLocaleFromExternal,
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
      syncLocaleFromExternal,
    ],
  );

  // renderBeforeReady=true 时让 children 立即出来；catalog 到位后 React 会
  // 因为 activationVersion 增加 + locale state 更新自动重渲染，把源 ID 替换
  // 成目标 locale。textDictionary 此时是空 Map，DomTextLocalizer 在空表上
  // 是 no-op，安全。
  const shouldRenderChildren = isReady || renderBeforeReady;

  return (
    <AppLocaleContext.Provider value={contextValue}>
      <I18nProvider i18n={appI18n}>
        {shouldRenderChildren ? (
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
