import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { AppPage, Button, cn } from "@yinjie/ui";
import { TabPageTopBar } from "./tab-page-top-bar";

type MobileDiscoverToolShellProps = {
  title: string;
  subtitle?: string;
  heroBadge?: string;
  heroTitle: string;
  heroDescription: string;
  heroVisual: ReactNode;
  heroAction?: ReactNode;
  notice?: ReactNode;
  children?: ReactNode;
  onBack: () => void;
  className?: string;
};

export function MobileDiscoverToolShell({
  title,
  subtitle,
  heroBadge = "发现工具",
  heroTitle,
  heroDescription,
  heroVisual,
  heroAction,
  notice,
  children,
  onBack,
  className,
}: MobileDiscoverToolShellProps) {
  return (
    <AppPage className={cn("space-y-0 px-0 pb-0 pt-0", className)}>
      <TabPageTopBar
        title={title}
        subtitle={subtitle}
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-black/6 bg-[rgba(247,247,247,0.92)] px-3 py-2.5 sm:mx-0 sm:px-3"
        leftActions={
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] hover:bg-black/5"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <div className="space-y-3 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        <section className="relative overflow-hidden rounded-[20px] border border-[rgba(7,193,96,0.12)] bg-[linear-gradient(180deg,rgba(248,255,250,0.98),rgba(255,255,255,0.98))] px-4 py-5">
          <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-full bg-[rgba(7,193,96,0.08)] blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="inline-flex rounded-full bg-[rgba(7,193,96,0.12)] px-3 py-1 text-[11px] font-medium text-[#07c160]">
                {heroBadge}
              </div>
              <div className="mt-3 text-[22px] font-semibold leading-tight text-[#111827]">
                {heroTitle}
              </div>
              <div className="mt-2 text-[13px] leading-6 text-[#6b7280]">
                {heroDescription}
              </div>
            </div>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-[rgba(7,193,96,0.12)] text-[#07c160]">
              {heroVisual}
            </div>
          </div>

          {heroAction ? <div className="relative mt-4">{heroAction}</div> : null}
        </section>

        {notice}
        {children}
      </div>
    </AppPage>
  );
}
