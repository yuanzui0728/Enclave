import { useEffect, useRef, useState } from "react";
import { cn } from "@yinjie/ui";

type ChatReminderSummaryTextProps = {
  summary: string;
  className?: string;
};

const SUMMARY_FADE_OUT_MS = 120;

export function ChatReminderSummaryText({
  summary,
  className,
}: ChatReminderSummaryTextProps) {
  const [displaySummary, setDisplaySummary] = useState(summary);
  const [visible, setVisible] = useState(true);
  const latestSummaryRef = useRef(summary);

  useEffect(() => {
    if (summary === latestSummaryRef.current) {
      return;
    }

    latestSummaryRef.current = summary;
    setVisible(false);

    const timer = window.setTimeout(() => {
      setDisplaySummary(summary);
      setVisible(true);
    }, SUMMARY_FADE_OUT_MS);

    return () => window.clearTimeout(timer);
  }, [summary]);

  return (
    <span
      className={cn(
        "inline-flex transition-opacity duration-150 ease-out",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {displaySummary}
    </span>
  );
}
