import type { HTMLAttributes } from "react";
import { cn } from "../cn";

type PanelEmptyProps = HTMLAttributes<HTMLDivElement> & {
  message: string;
};

export function PanelEmpty({ className, message, ...props }: PanelEmptyProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-[color:var(--text-secondary)]",
        className,
      )}
      {...props}
    >
      {message}
    </div>
  );
}
