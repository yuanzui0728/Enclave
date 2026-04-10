import { useRef } from "react";
import { cn } from "@yinjie/ui";

export function ContactIndexList({
  items,
  activeKey,
  className,
  onSelect,
  onGestureActiveChange,
}: {
  items: Array<{ key: string; indexLabel: string }>;
  activeKey?: string | null;
  className?: string;
  onSelect: (key: string, behavior?: ScrollBehavior) => void;
  onGestureActiveChange?: (active: boolean) => void;
}) {
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const gesturePointerIdRef = useRef<number | null>(null);
  const gesturePointerTypeRef = useRef<string | null>(null);
  const gestureStartYRef = useRef<number | null>(null);
  const gestureActiveRef = useRef(false);
  const lastGestureKeyRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);

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
    onSelect(nextItem.key, "auto");
  };

  const finishGesture = () => {
    gesturePointerIdRef.current = null;
    gesturePointerTypeRef.current = null;
    gestureStartYRef.current = null;
    gestureActiveRef.current = false;
    lastGestureKeyRef.current = null;
    onGestureActiveChange?.(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-full bg-[rgba(255,255,255,0.84)] px-1 py-2 text-[10px] shadow-[0_10px_30px_rgba(15,23,42,0.10)] backdrop-blur",
        className,
      )}
      onPointerDown={(event) => {
        gesturePointerIdRef.current = event.pointerId;
        gesturePointerTypeRef.current = event.pointerType;
        gestureStartYRef.current = event.clientY;
        gestureActiveRef.current = event.pointerType !== "mouse";

        if (gestureActiveRef.current) {
          suppressClickRef.current = true;
          onGestureActiveChange?.(true);
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
          onGestureActiveChange?.(true);
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

            onSelect(item.key, "smooth");
          }}
          aria-label={`跳转到 ${item.indexLabel}`}
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none transition-colors",
            activeKey === item.key ? "bg-[rgba(22,163,74,0.14)] font-semibold text-[#16a34a]" : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]",
          )}
        >
          {item.indexLabel}
        </button>
      ))}
    </div>
  );
}
