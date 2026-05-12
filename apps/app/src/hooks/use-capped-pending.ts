import { useEffect, useState } from "react";

// Returns a "displayed" version of an isPending flag that is true for at most capMs.
// If the real state finishes earlier, the returned value drops immediately.
export function useCappedPending(isPending: boolean, capMs = 500): boolean {
  const [displayed, setDisplayed] = useState(false);

  useEffect(() => {
    if (!isPending) {
      setDisplayed(false);
      return;
    }
    setDisplayed(true);
    const timer = window.setTimeout(() => {
      setDisplayed(false);
    }, capMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isPending, capMs]);

  return displayed;
}
