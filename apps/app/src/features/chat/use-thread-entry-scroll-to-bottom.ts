import { useEffect, useRef } from "react";

type ScrollToBottom = (behavior?: "auto" | "smooth") => void;

type UseThreadEntryScrollToBottomInput = {
  threadKey: string;
  ready: boolean;
  disabled?: boolean;
  scrollToBottom: ScrollToBottom;
};

export function useThreadEntryScrollToBottom({
  threadKey,
  ready,
  disabled = false,
  scrollToBottom,
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
    let firstFrame = 0;
    let secondFrame = 0;

    // Run after the first stable paint so unread dividers and header notices
    // have already affected layout before we pin the viewport to the tail.
    firstFrame = window.requestAnimationFrame(() => {
      scrollToBottom("auto");
      secondFrame = window.requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [disabled, ready, scrollToBottom, threadKey]);
}
