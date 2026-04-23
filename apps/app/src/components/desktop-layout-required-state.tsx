import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AppPage, Button } from "@yinjie/ui";

type DesktopLayoutRequiredStateProps = {
  title: ReactNode;
  description: ReactNode;
  actionLabel: ReactNode;
  fallbackTo: string;
};

export function DesktopLayoutRequiredState({
  actionLabel,
  description,
  fallbackTo,
  title,
}: DesktopLayoutRequiredStateProps) {
  const navigate = useNavigate();

  return (
    <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)] px-5">
      <div className="w-full max-w-md rounded-[22px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
        <div className="text-xl font-semibold text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          {description}
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            void navigate({ to: fallbackTo as never });
          }}
          className="mt-6 w-full rounded-xl bg-[color:var(--brand-primary)] text-white hover:opacity-95"
        >
          {actionLabel}
        </Button>
      </div>
    </AppPage>
  );
}
