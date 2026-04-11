import type { PropsWithChildren, ReactNode } from "react";

type DesktopEntryShellProps = PropsWithChildren<{
  badge: string;
  title: string;
  description: string;
  aside?: ReactNode;
}>;

export function DesktopEntryShell({
  aside,
  badge,
  children,
  description,
  title,
}: DesktopEntryShellProps) {
  return (
    <div className="grid min-h-full gap-6 p-6 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="relative flex min-h-[720px] flex-col justify-between overflow-hidden rounded-[20px] border border-black/6 bg-[#f7f7f7] p-8 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -right-16 top-0 h-40 w-40 rounded-full bg-[rgba(15,23,42,0.04)] blur-3xl" />
          <div className="absolute left-0 top-28 h-32 w-32 rounded-full bg-[rgba(15,23,42,0.03)] blur-3xl" />
          <div className="absolute bottom-0 right-20 h-36 w-36 rounded-full bg-[rgba(7,193,96,0.06)] blur-3xl" />
        </div>
        <div className="relative">
          <div className="inline-flex rounded-full border border-black/8 bg-white px-3 py-1 text-[11px] tracking-[0.16em] text-[color:var(--text-dim)]">
            {badge}
          </div>
          <h1 className="mt-5 max-w-[12ch] text-[42px] font-semibold leading-tight tracking-[0.02em] text-[color:var(--text-primary)]">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-[color:var(--text-secondary)]">
            {description}
          </p>
        </div>

        {aside ? aside : null}
      </section>

      <section className="flex min-h-[720px] flex-col justify-center rounded-[20px] border border-black/6 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
        {children}
      </section>
    </div>
  );
}
