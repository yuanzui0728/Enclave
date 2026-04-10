import { useEffect, useRef, useState } from "react";
import { cn } from "@yinjie/ui";

type ChatReminderFadeTextProps = {
  text: string;
  className?: string;
};

type ChatReminderSummaryTextProps = {
  summary: string;
  className?: string;
};

type ChatReminderCountTextProps = {
  count: number;
  className?: string;
};

const SUMMARY_FADE_OUT_MS = 120;

export function ChatReminderFadeText({
  text,
  className,
}: ChatReminderFadeTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [visible, setVisible] = useState(true);
  const latestTextRef = useRef(text);

  useEffect(() => {
    if (text === latestTextRef.current) {
      return;
    }

    latestTextRef.current = text;
    setVisible(false);

    const timer = window.setTimeout(() => {
      setDisplayText(text);
      setVisible(true);
    }, SUMMARY_FADE_OUT_MS);

    return () => window.clearTimeout(timer);
  }, [text]);

  return (
    <span
      className={cn(
        "inline-flex transition-opacity duration-150 ease-out",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {displayText}
    </span>
  );
}

export function ChatReminderSummaryText({
  summary,
  className,
}: ChatReminderSummaryTextProps) {
  return <ChatReminderFadeText text={summary} className={className} />;
}

export function ChatReminderCountText({
  count,
  className,
}: ChatReminderCountTextProps) {
  return <ChatReminderFadeText text={`${count} 条`} className={className} />;
}
