import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
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

type ChatReminderCollapseLabelProps = {
  collapsed: boolean;
  className?: string;
};

type ChatReminderMetaPillProps = {
  children: ReactNode;
  className?: string;
};

type ChatReminderControlButtonProps = ComponentPropsWithoutRef<"button">;

type ChatReminderToggleButtonProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "children"
> & {
  collapsed: boolean;
  count: number;
  iconSize?: number;
  countClassName?: string;
  labelClassName?: string;
  iconClassName?: string;
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

export function ChatReminderCollapseLabel({
  collapsed,
  className,
}: ChatReminderCollapseLabelProps) {
  return (
    <ChatReminderFadeText
      text={collapsed ? "展开" : "收起"}
      className={cn("min-w-[2em] justify-end opacity-70", className)}
    />
  );
}

export function ChatReminderMetaPill({
  children,
  className,
}: ChatReminderMetaPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 px-2 py-1 text-inherit",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ChatReminderControlButton({
  type = "button",
  className,
  children,
  ...props
}: ChatReminderControlButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 px-2 py-1 text-inherit transition-[background-color,border-color,color] hover:border-white hover:bg-white",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ChatReminderToggleButton({
  collapsed,
  count,
  iconSize = 12,
  className,
  countClassName,
  labelClassName,
  iconClassName,
  ...props
}: ChatReminderToggleButtonProps) {
  return (
    <ChatReminderControlButton className={className} {...props}>
      <ChatReminderCountText count={count} className={countClassName} />
      <ChatReminderCollapseLabel
        collapsed={collapsed}
        className={labelClassName}
      />
      <ChatReminderCollapseIcon
        collapsed={collapsed}
        size={iconSize}
        className={iconClassName}
      />
    </ChatReminderControlButton>
  );
}
