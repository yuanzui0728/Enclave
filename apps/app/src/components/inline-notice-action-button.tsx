import type { ReactNode } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

type InlineNoticeActionButtonProps = {
  label?: ReactNode;
  onClick: () => void;
  className?: string;
};

export function InlineNoticeActionButton({
  label,
  onClick,
  className,
}: InlineNoticeActionButtonProps) {
  const t = translateRuntimeMessage;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border border-current/18 bg-white/80 px-2.5 py-1 text-[10px] font-medium leading-none transition active:scale-[0.98] ${className ?? ""}`}
    >
      {label ?? t(msg`去设置`)}
    </button>
  );
}
