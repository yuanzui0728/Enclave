import { useEffect, useEffectEvent, useRef } from "react";

export function useScrollAnchor<T extends HTMLElement>(trigger: unknown) {
  const ref = useRef<T | null>(null);
  const scrollToBottom = useEffectEvent(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  });

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom, trigger]);

  return ref;
}
