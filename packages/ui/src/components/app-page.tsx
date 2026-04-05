import type { HTMLAttributes } from "react";
import { cn } from "../cn";

export function AppPage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-5 px-4 py-5", className)} {...props} />;
}
