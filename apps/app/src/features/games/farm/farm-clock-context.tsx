import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface FarmClock {
  nowMs: number;
  serverOffsetMs: number;
  setServerNowMs: (serverNowMs: number) => void;
}

// 拆成两个 context：一个只放每秒 tick 的 nowMs，一个放稳定的 setter。
// 之前合在一起，setter 每秒重建一次；任何把 useFarmClock() 返回值放进 useEffect 依赖
// 的地方（farm-page）都会每秒重新跑一次 setServerNowMs，把 offset 越拉越大，
// useFarmAdjustedNow() 永远停在 fetch 时刻，UI 上的成熟倒计时永远不动。
const FarmClockNowContext = createContext<number | null>(null);
const FarmClockOffsetRefContext = createContext<{
  current: number;
} | null>(null);
const FarmClockSetterContext = createContext<
  ((serverNowMs: number) => void) | null
>(null);

export function FarmClockProvider({ children }: { children: ReactNode }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const offsetRef = useRef(0);

  const setServerNowMs = useCallback((serverNowMs: number) => {
    offsetRef.current = Date.now() - serverNowMs;
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setNowMs(Date.now());
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <FarmClockSetterContext.Provider value={setServerNowMs}>
      <FarmClockOffsetRefContext.Provider value={offsetRef}>
        <FarmClockNowContext.Provider value={nowMs}>
          {children}
        </FarmClockNowContext.Provider>
      </FarmClockOffsetRefContext.Provider>
    </FarmClockSetterContext.Provider>
  );
}

function useFarmClockNow(): number {
  const ctx = useContext(FarmClockNowContext);
  if (ctx === null) {
    throw new Error("useFarmClock must be used inside FarmClockProvider"); // i18n-ignore-line
  }
  return ctx;
}

function useFarmClockOffsetRef(): { current: number } {
  const ctx = useContext(FarmClockOffsetRefContext);
  if (!ctx) {
    throw new Error("useFarmClock must be used inside FarmClockProvider"); // i18n-ignore-line
  }
  return ctx;
}

export function useFarmClock(): FarmClock {
  const nowMs = useFarmClockNow();
  const offsetRef = useFarmClockOffsetRef();
  const setServerNowMs = useSetFarmServerNow();
  return { nowMs, serverOffsetMs: offsetRef.current, setServerNowMs };
}

export function useSetFarmServerNow(): (serverNowMs: number) => void {
  const ctx = useContext(FarmClockSetterContext);
  if (!ctx) {
    throw new Error("useFarmClock must be used inside FarmClockProvider"); // i18n-ignore-line
  }
  return ctx;
}

export function useFarmAdjustedNow(): number {
  const nowMs = useFarmClockNow();
  const offsetRef = useFarmClockOffsetRef();
  return nowMs - offsetRef.current;
}
