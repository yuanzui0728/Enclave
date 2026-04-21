import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ConsoleNoticeTone = "info" | "success" | "warning" | "danger";

export type ShowConsoleNoticeOptions = {
  requestId?: string | null;
};

export type ConsoleNoticeState = {
  message: string;
  tone: ConsoleNoticeTone;
  requestId?: string | null;
} | null;

export type ShowConsoleNotice = (
  message: string,
  tone?: ConsoleNoticeTone,
  options?: ShowConsoleNoticeOptions,
) => void;

type ConsoleNoticeContextValue = {
  notice: ConsoleNoticeState;
  clearNotice: () => void;
  showNotice: ShowConsoleNotice;
};

const ConsoleNoticeContext = createContext<ConsoleNoticeContextValue | null>(
  null,
);

export function ConsoleNoticeProvider({ children }: PropsWithChildren) {
  const [notice, setNotice] = useState<ConsoleNoticeState>(null);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const value = useMemo<ConsoleNoticeContextValue>(
    () => ({
      notice,
      clearNotice: () => setNotice(null),
      showNotice: (message, tone = "success", options) => {
        setNotice({
          message,
          tone,
          requestId: options?.requestId ?? null,
        });
      },
    }),
    [notice],
  );

  return (
    <ConsoleNoticeContext.Provider value={value}>
      {children}
    </ConsoleNoticeContext.Provider>
  );
}

export function useConsoleNotice() {
  const context = useContext(ConsoleNoticeContext);
  if (!context) {
    throw new Error(
      "useConsoleNotice must be used within ConsoleNoticeProvider.",
    );
  }

  return context;
}
