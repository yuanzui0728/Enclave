import { useEffect, useRef, useState } from "react";
import { cn } from "@yinjie/ui";

export function ContactIndexList({
  items,
  activeKey,
  className,
  compact = false,
  onSelect,
}: {
  items: Array<{ key: string; indexLabel: string }>;
  activeKey?: string | null;
  className?: string;
  compact?: boolean;
  onSelect: (key: string, behavior?: ScrollBehavior) => void;
}) {
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const gesturePointerIdRef = useRef<number | null>(null);
  const gesturePointerTypeRef = useRef<string | null>(null);
  const gestureStartYRef = useRef<number | null>(null);
  const gestureActiveRef = useRef(false);
  const lastGestureKeyRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const indicatorTimerRef = useRef<number | null>(null);
  const [indicatorLabel, setIndicatorLabel] = useState<string | null>(null);

  const showIndicator = (label: string, durationMs?: number) => {
    if (indicatorTimerRef.current !== null) {
      window.clearTimeout(indicatorTimerRef.current);
      indicatorTimerRef.current = null;
    }

    setIndicatorLabel(label);
    if (typeof durationMs !== "number") {
      return;
    }

    indicatorTimerRef.current = window.setTimeout(() => {
      setIndicatorLabel(null);
      indicatorTimerRef.current = null;
    }, durationMs);
  };

  const resolveItemFromClientY = (clientY: number) => {
    let nearestItem: { key: string; indexLabel: string } | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const item of items) {
      const element = itemRefs.current[item.key];
      if (!element) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return item;
      }

      const distance = Math.abs(clientY - (rect.top + rect.height / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestItem = item;
      }
    }

    return nearestItem;
  };

  const handleGestureSelect = (clientY: number) => {
    const nextItem = resolveItemFromClientY(clientY);
    if (!nextItem || nextItem.key === lastGestureKeyRef.current) {
      return;
    }

    lastGestureKeyRef.current = nextItem.key;
    showIndicator(nextItem.indexLabel);
    onSelect(nextItem.key, "auto");
  };

  const finishGesture = () => {
    gesturePointerIdRef.current = null;
    gesturePointerTypeRef.current = null;
    gestureStartYRef.current = null;
    gestureActiveRef.current = false;
    lastGestureKeyRef.current = null;

    if (!indicatorLabel) {
      return;
    }

    indicatorTimerRef.current = window.setTimeout(() => {
      setIndicatorLabel(null);
      indicatorTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (indicatorTimerRef.current !== null) {
        window.clearTimeout(indicatorTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn("relative", className)}
      onPointerDown={(event) => {
        gesturePointerIdRef.current = event.pointerId;
        gesturePointerTypeRef.current = event.pointerType;
        gestureStartYRef.current = event.clientY;
        gestureActiveRef.current = event.pointerType !== "mouse";

        if (gestureActiveRef.current) {
          suppressClickRef.current = true;
          handleGestureSelect(event.clientY);
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (gesturePointerIdRef.current !== event.pointerId) {
          return;
        }

        if (!gestureActiveRef.current) {
          if (
            gesturePointerTypeRef.current === "mouse" &&
            gestureStartYRef.current !== null &&
            Math.abs(event.clientY - gestureStartYRef.current) < 4
          ) {
            return;
          }

          gestureActiveRef.current = true;
          suppressClickRef.current = true;
        }

        handleGestureSelect(event.clientY);
        event.preventDefault();
      }}
      onPointerUp={(event) => {
        if (gesturePointerIdRef.current !== event.pointerId) {
          return;
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        if (!gestureActiveRef.current) {
          gesturePointerIdRef.current = null;
          gesturePointerTypeRef.current = null;
          gestureStartYRef.current = null;
          return;
        }

        finishGesture();
      }}
      onPointerCancel={(event) => {
        if (gesturePointerIdRef.current !== event.pointerId) {
          return;
        }

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }

        finishGesture();
      }}
    >
      <div
        className={cn(
          "flex flex-col items-center rounded-full bg-[rgba(255,255,255,0.84)] backdrop-blur",
          compact
            ? "gap-px px-0.5 py-1.5 text-[9px] shadow-[0_8px_24px_rgba(15,23,42,0.10)]"
            : "gap-0.5 px-1 py-2 text-[10px] shadow-[0_10px_30px_rgba(15,23,42,0.10)]",
        )}
      >
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            ref={(node) => {
              itemRefs.current[item.key] = node;
            }}
            onClick={(event) => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                event.preventDefault();
                return;
              }

              showIndicator(item.indexLabel, 280);
              onSelect(item.key, "smooth");
            }}
            aria-label={`跳转到 ${item.indexLabel}`}
            className={cn(
              "flex items-center justify-center rounded-full leading-none transition-colors",
              compact ? "h-3.5 w-3.5 text-[9px]" : "h-4 w-4 text-[10px]",
              activeKey === item.key
                ? "bg-[rgba(22,163,74,0.14)] font-semibold text-[#16a34a]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]",
            )}
          >
            {item.indexLabel}
          </button>
        ))}
      </div>

      {indicatorLabel ? (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className={cn(
              "flex items-center justify-center bg-[rgba(22,22,22,0.72)] font-medium text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] backdrop-blur",
              compact
                ? "h-20 w-20 rounded-[24px] text-[28px]"
                : "h-24 w-24 rounded-[28px] text-[34px]",
            )}
          >
            {indicatorLabel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
