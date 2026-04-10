import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
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

type ChatReminderCollapseIconProps = {
  collapsed: boolean;
  size?: number;
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

export function ChatReminderCollapseIcon({
  collapsed,
  size = 12,
  className,
}: ChatReminderCollapseIconProps) {
  return (
    <ChevronRight
      size={size}
      className={cn(
        "transition-transform duration-200 ease-out",
        collapsed ? "rotate-0" : "rotate-90",
        className,
      )}
    />
  );
}
