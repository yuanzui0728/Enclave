import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppPage, Button } from "@yinjie/ui";
import { navigateBackOrFallback } from "../lib/history-back";
import { TabPageTopBar } from "./tab-page-top-bar";

type MobileDocumentShellProps = {
  title: string;
  eyebrow: string;
  summary: string;
  sections: Array<{
    title: string;
    paragraphs: string[];
  }>;
};

export function MobileDocumentShell({
  title,
  eyebrow,
  summary,
  sections,
}: MobileDocumentShellProps) {
  const navigate = useNavigate();

  return (
    <AppPage className="space-y-0 bg-[#f5f5f5] px-0 py-0">
      <TabPageTopBar
        title={title}
        titleAlign="center"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                void navigate({ to: "/profile/settings" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none hover:bg-black/4"
            aria-label="返回设置"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <div className="space-y-2 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-3">
        <section className="border-y border-[color:var(--border-faint)] bg-white px-4 py-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#15803d]">
            {eyebrow}
          </div>
          <div className="mt-2 text-[16px] font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          <p className="mt-2 text-[13px] leading-6 text-[color:var(--text-secondary)]">
            {summary}
          </p>
        </section>

        {sections.map((section) => (
          <section
            key={section.title}
            className="border-y border-[color:var(--border-faint)] bg-white px-4 py-4"
          >
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              {section.title}
            </div>
            <div className="mt-3 space-y-3">
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className="text-[14px] leading-7 text-[color:var(--text-secondary)]"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppPage>
  );
}
