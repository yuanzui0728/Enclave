import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { AppSection } from "@yinjie/ui";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  // 没传 icon 时落到 Inbox 兜底。历史版本这里渲染了一个写着"空"汉字的彩色方块，
  // 当 placeholder 用了好几个月——20+ 个调用方都吃到这个 placeholder。
  icon?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <AppSection className="rounded-[16px] border-[color:var(--border-faint)] bg-[color:var(--surface-section)] px-6 py-9 text-center shadow-none">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[16px] border border-[color:var(--border-faint)] bg-[rgba(7,193,96,0.06)] text-[#15803d]">
        {icon ?? <Inbox size={24} strokeWidth={1.6} />}
      </div>
      <div className="mt-5 text-lg font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-3 max-w-[28rem] text-sm leading-7 text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </AppSection>
  );
}
