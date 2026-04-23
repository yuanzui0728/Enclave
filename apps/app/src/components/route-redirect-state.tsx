import type { ReactNode } from "react";
import { AppPage, LoadingBlock } from "@yinjie/ui";

type RouteRedirectStateProps = {
  title: ReactNode;
  description: ReactNode;
  loadingLabel: ReactNode;
};

export function RouteRedirectState({
  description,
  loadingLabel,
  title,
}: RouteRedirectStateProps) {
  return (
    <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)] px-5">
      <div className="w-full max-w-md rounded-[22px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
        <div className="text-lg font-semibold text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          {description}
        </div>
        <div className="mt-6">
          <LoadingBlock label={loadingLabel} />
        </div>
      </div>
    </AppPage>
  );
}
