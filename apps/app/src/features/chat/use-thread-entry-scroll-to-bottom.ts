import { useEffect, useRef, type RefObject } from "react";

type UseThreadEntryScrollToBottomInput = {
  threadKey: string;
  ready: boolean;
  disabled?: boolean;
  containerRef: RefObject<HTMLElement | null>;
};

export function useThreadEntryScrollToBottom({
  threadKey,
  ready,
  disabled = false,
  containerRef,
}: UseThreadEntryScrollToBottomInput) {
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
  }, [threadKey]);

  useEffect(() => {
    if (completedRef.current || disabled || !ready) {
      return;
    }

    completedRef.current = true;
    let frame = 0;
    let stopped = false;
    const stopLock = () => {
      stopped = true;
    };
    const pinToBottom = () => {
      const element = containerRef.current;
      if (!element) {
        return;
      }

      element.scrollTop = element.scrollHeight;
    };
    const runFrame = (startedAt: number) => {
      if (stopped) {
        return;
      }

      pinToBottom();
      if (performance.now() - startedAt >= ENTRY_SCROLL_LOCK_MS) {
        return;
      }

      frame = window.requestAnimationFrame(() => runFrame(startedAt));
    };

    // Keep the viewport pinned to the tail for a short window so late layout
    // changes such as media sizing or divider insertion do not pull the user
    // back above the latest message.
    frame = window.requestAnimationFrame(() => runFrame(performance.now()));

    const element = containerRef.current;
    element?.addEventListener("wheel", stopLock, { passive: true });
    element?.addEventListener("touchstart", stopLock, { passive: true });
    element?.addEventListener("pointerdown", stopLock, { passive: true });

    return () => {
      stopLock();
      window.cancelAnimationFrame(frame);
      element?.removeEventListener("wheel", stopLock);
      element?.removeEventListener("touchstart", stopLock);
      element?.removeEventListener("pointerdown", stopLock);
    };
  }, [containerRef, disabled, ready, threadKey]);
}

const ENTRY_SCROLL_LOCK_MS = 1200;
