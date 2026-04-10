import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { AppPage, Button, cn } from "@yinjie/ui";

type ChatDetailsShellProps = {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: ReactNode;
  className?: string;
};

export function ChatDetailsShell({
  title,
  subtitle,
  onBack,
  children,
  className,
}: ChatDetailsShellProps) {
  return (
    <AppPage
      className={cn(
        "min-h-full space-y-0 bg-[#f3f3f3] px-0 py-0 text-[color:var(--text-primary)]",
        className,
      )}
    >
      <header className="sticky top-0 z-20 border-b border-black/6 bg-[rgba(245,245,245,0.96)] px-3 py-2.5 backdrop-blur-xl">
        <div className="flex min-h-10 items-center gap-2">
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-[10px] border border-black/6 bg-white text-[color:var(--text-primary)] hover:bg-[#f2f2f2]"
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
              {title}
            </div>
            {subtitle ? (
              <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
                {subtitle}
              </div>
            ) : null}
          </div>
          <div className="w-9 shrink-0" aria-hidden="true" />
        </div>
      </header>

      <div className="space-y-3 px-0 pb-5 pt-2.5">{children}</div>
    </AppPage>
  );
}
