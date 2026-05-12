import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const TRIGGER_DISTANCE = 64;
const MAX_PULL = 120;
const RESISTANCE = 0.55;
// 兜底：onRefresh 的 promise 万一不结算（网络挂死、组件卸载、refetch 被中止），
// 也别让指示器永远卡住、把页面锁成不可滚动。
const REFRESH_SAFETY_TIMEOUT_MS = 10_000;

type UsePullToRefreshOptions = {
  /** Async refresh callback; pull indicator stays visible until it resolves. */
  onRefresh: () => Promise<unknown> | void;
  /** Disable when false (eg. while no scroll container yet). */
  enabled?: boolean;
};

type PullState = {
  pulling: boolean;
  refreshing: boolean;
  /** Vertical translation in pixels for the indicator/list. */
  offset: number;
  /** 0…1 progress to TRIGGER_DISTANCE. */
  progress: number;
};

type UsePullToRefreshResult = {
  containerRef: RefObject<HTMLDivElement | null>;
  state: PullState;
};

export function usePullToRefresh({
  onRefresh,
  enabled = true,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const activePullRef = useRef(false);
  // 用 ref 跟 state 同步 refreshing 状态——handler 是 useCallback 锁住的闭包，
  // 直接读 state 会拿到旧值，touchmove 在 refreshing 期间还会 preventDefault，
  // 导致 iOS Safari 把整段手势锁成"非滚动"，用户上滑就划不动了。
  const refreshingRef = useRef(false);
  const safetyTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<PullState>({
    pulling: false,
    refreshing: false,
    offset: 0,
    progress: 0,
  });

  const finishRefresh = useCallback(() => {
    refreshingRef.current = false;
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      pulling: false,
      refreshing: false,
      offset: 0,
      progress: 0,
    }));
  }, []);

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      // 每次手势开始都先清掉上一轮残留的 startY/activePull——
      // 上一段手势如果被 touchcancel/卸载意外打断，残留值会让本次 touchmove
      // 算出诡异的 dy 然后乱调 preventDefault，把滚动锁死。
      startYRef.current = null;
      activePullRef.current = false;
      if (!enabled) return;
      // 正在刷新：完全让位给原生滚动，让用户能上滑查看列表。
      if (refreshingRef.current) return;
      const node = containerRef.current;
      if (!node) return;
      // Only start tracking when scroll is at top.
      if (node.scrollTop > 0) return;
      startYRef.current = event.touches[0]?.clientY ?? null;
    },
    [enabled],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!enabled) return;
      // 刷新进行中绝不 preventDefault，否则 iOS 会把整段手势锁成"非滚动"，
      // 之后用户上滑也不会触发原生滚动。
      if (refreshingRef.current) return;
      const node = containerRef.current;
      if (!node) return;
      const startY = startYRef.current;
      if (startY === null) return;

      const currentY = event.touches[0]?.clientY ?? startY;
      const dy = currentY - startY;
      if (dy <= 0) {
        if (activePullRef.current) {
          activePullRef.current = false;
          setState((prev) => ({
            ...prev,
            pulling: false,
            offset: 0,
            progress: 0,
          }));
        }
        return;
      }

      activePullRef.current = true;
      const offset = Math.min(dy * RESISTANCE, MAX_PULL);
      const progress = Math.min(offset / TRIGGER_DISTANCE, 1);
      // Block native overscroll while pulling
      if (event.cancelable) {
        event.preventDefault();
      }
      setState((prev) =>
        prev.refreshing
          ? prev
          : { pulling: true, refreshing: false, offset, progress },
      );
    },
    [enabled],
  );

  const handleTouchEnd = useCallback(() => {
    if (!activePullRef.current) {
      startYRef.current = null;
      return;
    }
    activePullRef.current = false;
    startYRef.current = null;

    setState((prev) => {
      if (prev.refreshing) {
        // Already refreshing — pulling down again should not fire another refresh.
        return prev;
      }
      if (prev.offset >= TRIGGER_DISTANCE) {
        refreshingRef.current = true;
        const result = onRefresh();
        Promise.resolve(result).finally(() => {
          window.setTimeout(finishRefresh, 250);
        });
        if (safetyTimerRef.current !== null) {
          window.clearTimeout(safetyTimerRef.current);
        }
        safetyTimerRef.current = window.setTimeout(
          finishRefresh,
          REFRESH_SAFETY_TIMEOUT_MS,
        );
        return {
          pulling: false,
          refreshing: true,
          offset: TRIGGER_DISTANCE,
          progress: 1,
        };
      }
      return {
        pulling: false,
        refreshing: false,
        offset: 0,
        progress: 0,
      };
    });
  }, [finishRefresh, onRefresh]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !enabled) return;
    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", handleTouchEnd);
    node.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [enabled, handleTouchEnd, handleTouchMove, handleTouchStart]);

  useEffect(() => {
    return () => {
      if (safetyTimerRef.current !== null) {
        window.clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    };
  }, []);

  return { containerRef, state };
}
