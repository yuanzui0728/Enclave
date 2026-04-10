import { useEffect, useEffectEvent, useRef, useState } from "react";

type ScrollBehaviorMode = "auto" | "smooth";

export function useScrollAnchor<T extends HTMLElement>(itemCount: number) {
  const ref = useRef<T | null>(null);
  const previousItemCountRef = useRef(itemCount);
  const initializedRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  const syncBottomState = useEffectEvent(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const nextIsAtBottom = isScrolledNearBottom(element);
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

      setIsAtBottom(true);
      setPendingCount(0);
    },
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    syncBottomState();

    const handleScroll = () => {
      syncBottomState();
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, [syncBottomState]);

  useEffect(() => {
    const previousItemCount = previousItemCountRef.current;
    previousItemCountRef.current = itemCount;

    if (!initializedRef.current) {
      initializedRef.current = true;
      window.requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
      return;
    }

    if (itemCount <= previousItemCount) {
      return;
    }

    const addedCount = itemCount - previousItemCount;
    const element = ref.current;
    if (!element || isScrolledNearBottom(element)) {
      window.requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
      return;
    }

    setPendingCount((current) => current + addedCount);
    setIsAtBottom(false);
  }, [itemCount, scrollToBottom]);

  return {
    ref,
    isAtBottom,
    pendingCount,
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
