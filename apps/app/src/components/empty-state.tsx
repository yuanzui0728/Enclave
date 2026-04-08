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
    <AppSection className="px-5 py-9 text-center">
      <div className="text-lg font-medium text-[color:var(--text-primary)]">{title}</div>
      <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </AppSection>
  );
}
