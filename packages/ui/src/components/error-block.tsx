import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

type ErrorBlockProps = HTMLAttributes<HTMLDivElement> & {
  message: string;
  children?: ReactNode;
};

export function ErrorBlock({
  children,
  className,
  message,
  ...props
}: ErrorBlockProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,226,226,0.94))] px-5 py-4 text-sm leading-6 text-[color:var(--state-danger-text)] shadow-[var(--shadow-soft)]",
        className,
      )}
      {...props}
    >
      <div>{message}</div>
      {children}
    </div>
  );
}
