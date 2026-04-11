import { Button } from "@yinjie/ui";
import { AppPage } from "@yinjie/ui";
import { DesktopEntryShell } from "./desktop-entry-shell";
import { useDesktopLayout } from "../shell/use-desktop-layout";

type DesktopPlaceholderWorkspaceProps = {
  badge: string;
  title: string;
  description: string;
  spotlightTitle: string;
  spotlightBody: string;
  highlights: Array<{ label: string; value: string }>;
  ctaLabel?: string;
  onCtaClick?: () => void;
  mobileFallbackTo?: string;
};

export function DesktopPlaceholderWorkspace({
  badge,
  ctaLabel,
  description,
  highlights,
  mobileFallbackTo = "/tabs/chat",
  onCtaClick,
  spotlightBody,
  spotlightTitle,
  title,
}: DesktopPlaceholderWorkspaceProps) {
  const isDesktopLayout = useDesktopLayout();

  if (!isDesktopLayout) {
    return (
      <AppPage className="flex h-full items-center justify-center bg-[#f3f3f3]">
        <div className="w-full max-w-md rounded-[18px] border border-black/6 bg-white p-8 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">
            该入口当前仅提供桌面布局
          </div>
          <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            这项能力优先对齐微信电脑版工作区，移动端暂时不单独开放。
          </div>
          <a
            href={mobileFallbackTo}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[#07c160] px-4 text-sm font-medium text-white hover:bg-[#06ad56]"
          >
            返回继续使用
          </a>
        </div>
      </AppPage>
    );
  }

  return (
    <DesktopEntryShell
      badge={badge}
      title={title}
      description={description}
      aside={
        <div className="relative space-y-4">
          <div className="rounded-[14px] border border-black/6 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
            <div className="text-xs tracking-[0.14em] text-[color:var(--text-dim)]">
              当前重点
            </div>
            <div className="mt-3 text-xl font-semibold text-[color:var(--text-primary)]">
              {spotlightTitle}
            </div>
            <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
              {spotlightBody}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="rounded-[18px] border border-black/6 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
          <div className="text-xs tracking-[0.14em] text-[color:var(--text-dim)]">
            工作区规划
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {highlights.map((item) => (
              <div
                key={item.label}
                className="rounded-[12px] border border-black/6 bg-[#fafafa] p-4"
              >
                <div className="text-xs text-[color:var(--text-muted)]">
                  {item.label}
                </div>
                <div className="mt-2 text-sm leading-6 text-[color:var(--text-primary)]">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
          {ctaLabel && onCtaClick ? (
            <Button
              variant="primary"
              size="lg"
              onClick={onCtaClick}
              className="mt-5 rounded-[10px] bg-[#07c160] text-white hover:bg-[#06ad56]"
            >
              {ctaLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </DesktopEntryShell>
  );
}
