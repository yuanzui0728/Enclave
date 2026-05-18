import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type ScrollBehaviorMode = "auto" | "smooth";

export function useScrollAnchor<T extends HTMLElement>(itemCount: number) {
  const ref = useRef<T | null>(null);
  const previousItemCountRef = useRef(itemCount);
  const initializedRef = useRef(false);
  const suppressNextPendingCountRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const lastUserGestureAtRef = useRef(0);
  const pinFrameRef = useRef(0);
  const pinUntilRef = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const cancelPinToBottom = useEffectEvent(() => {
    if (pinFrameRef.current !== 0 && typeof window !== "undefined") {
      window.cancelAnimationFrame(pinFrameRef.current);
    }
    pinFrameRef.current = 0;
    pinUntilRef.current = 0;
  });

  const startPinToBottomWindow = useEffectEvent((durationMs: number) => {
    if (typeof window === "undefined") {
      return;
    }
    pinUntilRef.current = Math.max(
      pinUntilRef.current,
      performance.now() + durationMs,
    );
    if (pinFrameRef.current !== 0) {
      return;
    }
    const tick = () => {
      const current = ref.current;
      if (!current) {
        pinFrameRef.current = 0;
        pinUntilRef.current = 0;
        return;
      }
      // 把 scrollTop 顶到 scrollHeight，遇到乐观消息晚一帧上屏 / 图片加载完
      // 撑高气泡 / 键盘收起后容器变高这些「scrollHeight 在 send 之后才长大」
      // 的情况，会在窗口期内被持续重新对齐到底部。
      current.scrollTop = current.scrollHeight;
      if (performance.now() < pinUntilRef.current) {
        pinFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        pinFrameRef.current = 0;
      }
    };
    pinFrameRef.current = window.requestAnimationFrame(tick);
  });

  const syncBottomStateFromDom = useEffectEvent(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const nextIsAtBottom = isScrolledNearBottom(element);
    isAtBottomRef.current = nextIsAtBottom;
    setIsAtBottom(nextIsAtBottom);
    if (nextIsAtBottom) {
      setPendingCount(0);
    }
  });

  const scrollToBottom = useEffectEvent(
    (behavior: ScrollBehaviorMode = "smooth") => {
      const element = ref.current;
      if (!element) {
        return;
      }

      if (behavior === "auto") {
        element.scrollTop = element.scrollHeight;
      } else {
        element.scrollTo({
          top: element.scrollHeight,
          behavior,
        });
      }

      isAtBottomRef.current = true;
      setIsAtBottom(true);
      setPendingCount(0);
      // Treat the upcoming scroll events as ours, not user-driven.
      lastUserGestureAtRef.current = 0;

      // 移动端按发送时，乐观消息上屏 / 图片完成布局 / 键盘收起重排都可能在
      // 单帧之后才发生，scrollHeight 在那之后才长到「真正的最底」。开一段
      // 窗口逐帧重新贴底，覆盖这些迟到的布局变化，避免「发了但页面没动 / 看不
      // 到自己刚发的消息和后续回复」。用户真正的 touchmove/wheel 会立刻取消。
      startPinToBottomWindow(POST_SCROLL_PIN_WINDOW_MS);
    },
  );

  const suppressNextPendingCount = useEffectEvent(() => {
    suppressNextPendingCountRef.current = true;
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const markUserGesture = () => {
      lastUserGestureAtRef.current = performance.now();
    };

    // 真正的拖动 / 滚轮表明用户想自己控制滚动位置，需要立刻退出贴底窗口。
    // touchstart 不算 —— 用户可能只是点一下消息气泡，不应取消贴底。
    const markUserDrag = () => {
      lastUserGestureAtRef.current = performance.now();
      cancelPinToBottom();
    };

    const handleScroll = () => {
      const now = performance.now();
      // Only treat scroll events as authoritative when a user gesture happened
      // recently (within USER_SCROLL_WINDOW_MS). Layout-only or programmatic
      // scrolls do not have an associated gesture and should not flip the
      // "at bottom" ref. Ongoing scrolls keep refreshing the window.
      if (now - lastUserGestureAtRef.current >= USER_SCROLL_WINDOW_MS) {
        return;
      }
      lastUserGestureAtRef.current = now;
      syncBottomStateFromDom();
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    element.addEventListener("wheel", markUserDrag, { passive: true });
    element.addEventListener("touchmove", markUserDrag, { passive: true });
    element.addEventListener("touchstart", markUserGesture, { passive: true });
    element.addEventListener("mousedown", markUserGesture, { passive: true });
    element.addEventListener("keydown", markUserGesture);
    return () => {
      element.removeEventListener("scroll", handleScroll);
      element.removeEventListener("wheel", markUserDrag);
      element.removeEventListener("touchmove", markUserDrag);
      element.removeEventListener("touchstart", markUserGesture);
      element.removeEventListener("mousedown", markUserGesture);
      element.removeEventListener("keydown", markUserGesture);
    };
  }, [cancelPinToBottom, syncBottomStateFromDom]);

  useEffect(() => {
    return () => {
      cancelPinToBottom();
    };
  }, [cancelPinToBottom]);

  // 键盘弹起 / 折叠、附件 preview 出现等都会让 scroll container 的 clientHeight
  // 突然变化（不会触发 scroll 事件，但贴底位置实质性丢失）。如果用户原本在底
  // 部，clientHeight 缩小后 scrollTop 不变 → 视觉上「滑离了底部」，最新消息掉
  // 到 composer / 键盘后面看不到了。ResizeObserver 监听容器尺寸变化，仅当
  // 上一次记录处于贴底状态时再次贴底，不打断用户已经向上翻看历史的滚动位置。
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const element = ref.current;
    if (!element) {
      return;
    }
    let previousClientHeight = element.clientHeight;
    const observer = new ResizeObserver(() => {
      const current = ref.current;
      if (!current) {
        return;
      }
      const nextClientHeight = current.clientHeight;
      const shrank = nextClientHeight < previousClientHeight;
      previousClientHeight = nextClientHeight;
      if (!shrank) {
        return;
      }
      if (!isAtBottomRef.current) {
        return;
      }
      current.scrollTop = current.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const previousItemCount = previousItemCountRef.current;
    previousItemCountRef.current = itemCount;

    if (!initializedRef.current) {
      if (itemCount === 0) {
        return;
      }

      initializedRef.current = true;
      scrollToBottom("auto");
      return;
    }

    if (itemCount <= previousItemCount) {
      return;
    }

    const addedCount = itemCount - previousItemCount;
    const element = ref.current;
    if (!element || isAtBottomRef.current) {
      scrollToBottom("auto");
      return;
    }

    if (suppressNextPendingCountRef.current) {
      suppressNextPendingCountRef.current = false;
      return;
    }

    setPendingCount((current) => current + addedCount);
    setIsAtBottom(false);
  }, [itemCount, scrollToBottom]);

  return {
    ref,
    isAtBottom,
    isAtBottomRef,
    pendingCount,
    suppressNextPendingCount,
    scrollToBottom,
  };
}

function isScrolledNearBottom(element: HTMLElement) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    SCROLL_BOTTOM_THRESHOLD
  );
}

const SCROLL_BOTTOM_THRESHOLD = 72;
const USER_SCROLL_WINDOW_MS = 500;
const POST_SCROLL_PIN_WINDOW_MS = 900;
