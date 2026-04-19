type AppBrowserHistoryState = {
  __TSR_index?: number;
};

export function canNavigateBackWithinAppHistory() {
  if (typeof window === "undefined") {
    return false;
  }

  const historyState = window.history.state as AppBrowserHistoryState | null;
  return (
    typeof historyState?.__TSR_index === "number" &&
    Number.isFinite(historyState.__TSR_index) &&
    historyState.__TSR_index > 0
  );
}

export function navigateBackOrFallback(onFallback: () => void) {
  if (canNavigateBackWithinAppHistory()) {
    window.history.back();
    return;
  }

  onFallback();
}
