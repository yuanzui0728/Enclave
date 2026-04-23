import type { ReactNode } from "react";
import { Trans } from "@lingui/react/macro";

type BootstrapScreenProps = {
  message?: ReactNode;
};

export function BootstrapScreen({ message }: BootstrapScreenProps) {
  return (
    <div
      className="flex min-h-screen min-h-dvh items-center justify-center bg-[#f5f5f5] px-4 py-10 text-center"
      style={{
        paddingTop: "max(2.5rem, env(safe-area-inset-top, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        paddingBottom: "max(2.5rem, env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
      }}
    >
      <div className="w-full max-w-md rounded-[32px] border border-black/5 bg-white px-8 py-10 shadow-none">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(7,193,96,0.16)] bg-[rgba(7,193,96,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.34em] text-[#15803d]">
          Beyond Reality
        </div>
        <div className="mx-auto mt-6 flex h-20 w-20 animate-pulse items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#07c160,#34c759)] text-2xl font-semibold text-white shadow-none">
          隐界
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
          <Trans>欢迎回到你的世界</Trans>
        </h1>
        <p className="mt-4 text-sm leading-8 text-[color:var(--text-secondary)]">
          <Trans>
            这里不是一串账号信息，而是一整片会继续生长、继续回应你的个人世界。
          </Trans>
        </p>

        <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          <div className="rounded-[22px] border border-black/5 bg-[#fafafa] px-4 py-3 shadow-none">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Step 1
            </div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Trans>确认入口</Trans>
            </div>
          </div>
          <div className="rounded-[22px] border border-black/5 bg-[#fafafa] px-4 py-3 shadow-none">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Step 2
            </div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Trans>同步世界主人</Trans>
            </div>
          </div>
          <div className="rounded-[22px] border border-black/5 bg-[#fafafa] px-4 py-3 shadow-none">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Step 3
            </div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
              <Trans>继续开启对话</Trans>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[22px] border border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.06)] px-4 py-3 text-left text-sm leading-7 text-[#475569]">
          {message ?? (
            <Trans>
              正在整理这次进入世界的路径，马上带你回到上次停留的地方。
            </Trans>
          )}
        </div>
      </div>
    </div>
  );
}
