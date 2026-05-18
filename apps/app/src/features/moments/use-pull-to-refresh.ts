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

// 朋友圈页 / Moments 页 / 角色 Profile 朋友圈页 都把 ref 挂在
// `<div className="flex-1 overflow-y-auto">` 上，但这个 div 的父级（AppPage）
// 不是 flex 容器，`flex-1 overflow-y-auto` 完全失效——真正在滚的是 MobileShell
// 的 MobileViewportPane（absolute inset-0 overflow-y-auto）。
// 直接读 ref 的 scrollTop 永远是 0 → handleTouchStart 的「我在不在顶」判定恒真
// → 用户在列表中段下拉想上滑回顶时，pull-to-refresh 误判成「下拉刷新」，
// touchmove preventDefault 把整段滚动锁死。
// 这里向上找最近一个真正可滚动的祖先，scrollTop 读它的就对了；监听仍挂在
// containerRef 上，把生效范围限制在朋友圈内容区——避免 TabPageTopBar 上
// 的轻微下拽手势误触发下拉动画（passive:false 的 touchmove 即使挂在
// containerRef 上，preventDefault 一样会阻止祖先 scroller 的原生滚动）。
function resolveScrollContainer(node: HTMLElement): HTMLElement {
  let candidate: HTMLElement | null = node.parentElement;
  while (candidate) {
    const overflowY = window.getComputedStyle(candidate).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return candidate;
    }
    candidate = candidate.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export function usePullToRefresh({
  onRefresh,
  enabled = true,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const activePullRef = useRef(false);
  // 用 ref 跟 state 同步 refreshing 状态——handler 是 useCallback 锁住的闭包，
  // 直接读 state 会拿到旧值，touchmove 在 refreshing 期间还会 preventDefault，
  // 导致 iOS Safari 把整段手势锁成"非滚动"，用户上滑就划不动了。
  const refreshingRef = useRef(false);
  // 走查 R3：handleTouchEnd 用 ref 读最新 offset，免得依赖 state.offset 触发
  // useEffect 重挂监听器；handleTouchMove 已经在算 offset，顺手同步到 ref。
  const offsetRef = useRef(0);
  const safetyTimerRef = useRef<number | null>(null);
  // onRefresh 在调用方多数是 inline 箭头（() => Promise.all([...refetch()])），
  // 每次父组件 re-render 引用都新——若 handleTouchEnd 直接依赖它，useEffect
  // 会在每次重渲都先 removeEventListener×4 再 addEventListener×4，输入评论
  // 草稿那种高频 setState 下白白来回拆装监听。把 onRefresh 兜到 ref 里，
  // handler 闭包稳定就能让 useEffect 只在 enabled / 真正的内部 handler 切换
  // 时才动监听。
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);
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
      const scroller = scrollerRef.current;
      if (!scroller) return;
      // Only start tracking when scroll is at top.
      if (scroller.scrollTop > 0) return;
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
      const scroller = scrollerRef.current;
      if (!scroller) return;
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
      offsetRef.current = offset;
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

    // 走查 R3：触发刷新的副作用（onRefresh / setTimeout 注册）必须在 setState
    // updater **外**。React 18 StrictMode 在 dev 会把 updater 跑两遍来检测
    // 不纯实现——如果 onRefreshRef.current() 写在 updater 里，pull-to-refresh
    // 一次就会触发两次 refresh 请求（/api/moments + /api/social/blocks 各 2 次
    // = 4 个 RTT），CDP 走查实测重现。把 trigger 判定基于 refreshingRef +
    // 当前 offset state 在 updater 外做，updater 只是纯状态切换。
    if (refreshingRef.current) {
      return;
    }
    const finalOffset = offsetRef.current;
    offsetRef.current = 0;
    if (finalOffset >= TRIGGER_DISTANCE) {
      refreshingRef.current = true;
      const result = onRefreshRef.current();
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
      setState({
        pulling: false,
        refreshing: true,
        offset: TRIGGER_DISTANCE,
        progress: 1,
      });
      return;
    }
    setState({
      pulling: false,
      refreshing: false,
      offset: 0,
      progress: 0,
    });
  }, [finishRefresh]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !enabled) return;
    scrollerRef.current = resolveScrollContainer(node);
    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", handleTouchEnd);
    node.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchEnd);
      scrollerRef.current = null;
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
