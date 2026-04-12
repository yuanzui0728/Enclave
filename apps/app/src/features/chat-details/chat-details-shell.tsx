import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { AppPage, Button, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../../components/tab-page-top-bar";

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
        "min-h-full space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0 text-[color:var(--text-primary)]",
        className,
      )}
    >
      <TabPageTopBar
        title={title}
        subtitle={subtitle}
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-3 py-2.5 backdrop-blur-xl sm:mx-0 sm:px-3"
        leftActions={
          <Button
            onClick={onBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] hover:bg-[color:var(--surface-console)]"
            aria-label="返回"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <div className="space-y-2.5 px-0 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-2">
        {children}
      </div>
    </AppPage>
  );
}
