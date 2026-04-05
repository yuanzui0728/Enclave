import type { HTMLAttributes } from "react";
import { cn } from "../cn";

type ErrorBlockProps = HTMLAttributes<HTMLDivElement> & {
  message: string;
};

export function ErrorBlock({ className, message, ...props }: ErrorBlockProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border border-[color:var(--border-danger)] bg-[color:var(--state-danger-bg)] px-5 py-4 text-sm leading-6 text-[color:var(--state-danger-text)]",
        className,
      )}
      {...props}
    >
      {message}
    </div>
  );
}
