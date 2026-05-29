import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";

const t = translateRuntimeMessage;

type ExpandableTextProps = {
  text: string;
  className?: string;
  textClassName?: string;
  toggleClassName?: string;
  collapsedLineClampClass?: string;
  expandLabel?: string;
  collapseLabel?: string;
};

export function ExpandableText({
  text,
  className,
  textClassName,
  toggleClassName,
  collapsedLineClampClass = "line-clamp-2",
  expandLabel,
  collapseLabel,
}: ExpandableTextProps) {
  const resolvedExpandLabel = expandLabel ?? t(msg`展开`);
  const resolvedCollapseLabel = collapseLabel ?? t(msg`收起`);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => {
      const target = ref.current;
      if (!target) return;
      setOverflowing(target.scrollHeight - target.clientHeight > 1);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className={className}>
      <div
        ref={ref}
        className={cn(
          "whitespace-pre-wrap break-words",
          !expanded ? collapsedLineClampClass : undefined,
          textClassName,
        )}
      >
        {text}
      </div>
      {overflowing || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className={cn(
            "mt-1 text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)] transition active:opacity-70",
            toggleClassName,
          )}
        >
          {expanded ? resolvedCollapseLabel : resolvedExpandLabel}
        </button>
      ) : null}
    </div>
  );
}
