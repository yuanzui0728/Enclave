import { Button } from "@yinjie/ui";
import { AppPage } from "@yinjie/ui";
import { DesktopUtilityShell } from "./desktop-utility-shell";
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
      <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)]">
        <div className="w-full max-w-md rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">
            该入口当前仅提供桌面布局
          </div>
          <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            这项能力优先对齐微信电脑版工作区，移动端暂时不单独开放。
          </div>
          <a
            href={mobileFallbackTo}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[color:var(--brand-primary)] px-4 text-sm font-medium text-white hover:opacity-95"
          >
            返回继续使用
          </a>
        </div>
      </AppPage>
    );
  }

  return (
    <DesktopUtilityShell
      title={title}
      subtitle={description}
      toolbar={
        <div className="rounded-full border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] px-3 py-1 text-[11px] font-medium text-[color:var(--brand-primary)]">
          {badge}
        </div>
      }
      aside={
        <div className="flex h-full flex-col bg-[rgba(247,250,250,0.86)]">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-4 backdrop-blur-xl">
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              当前重点
            </div>
            <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
              先把桌面工作区骨架和关键信息位补完整。
            </div>
          </div>

          <div className="flex-1 px-4 py-4">
            <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
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
        </div>
      }
      contentClassName="bg-[rgba(255,255,255,0.62)]"
    >
      <div className="space-y-5 p-5">
        <div className="rounded-[18px] border border-[color:var(--border-faint)] bg-white p-6 shadow-[var(--shadow-card)]">
          <div className="text-xs tracking-[0.14em] text-[color:var(--text-dim)]">
            工作区规划
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {highlights.map((item) => (
              <div
                key={item.label}
                className="rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-4"
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
              className="mt-5 rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            >
              {ctaLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </DesktopUtilityShell>
  );
}
