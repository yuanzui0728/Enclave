import type { ReactNode } from "react";
import { AppSection } from "@yinjie/ui";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <AppSection className="border-dashed bg-[color:var(--surface-secondary)] px-5 py-8 text-center">
      <div className="text-lg font-medium text-white">{title}</div>
      <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </AppSection>
  );
}
