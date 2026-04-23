import type { HTMLAttributes, ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { cn } from "../cn";

type LoadingBlockProps = HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
};

export function LoadingBlock({
  className,
  label,
  ...props
}: LoadingBlockProps) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-black/6 bg-white px-5 py-8 text-center text-sm text-[color:var(--text-secondary)] shadow-[0_14px_36px_rgba(15,23,42,0.05)]",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-black/18 animate-pulse" />
          <span className="h-2.5 w-2.5 rounded-full bg-black/28 animate-pulse [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#8ecf9d] animate-pulse [animation-delay:240ms]" />
        </div>
        <div>{label ?? <Trans>加载中...</Trans>}</div>
      </div>
    </div>
  );
}
