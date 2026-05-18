import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { ArrowLeft, Ellipsis, type LucideIcon } from "lucide-react";

const t = translateRuntimeMessage;

type MobileChatThreadHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onMore: () => void;
  moreLabel?: string;
  actions?: Array<{
    key: string;
    icon: LucideIcon;
    label: string;
    onClick: () => void;
  }>;
};

export function MobileChatThreadHeader({
  title,
  subtitle,
  onBack,
  onMore,
  moreLabel = t(msg`更多操作`),
  actions = [],
}: MobileChatThreadHeaderProps) {
  // 走查 R1：原 46 没匹配真实 button 槽位（h-10 w-10 = 40px 配 gap-2 = 8px →
  // 每个 button 实际占 48px），actions.length=2 时旧公式 138 比真实右簇宽度
  // 144 短 6px，title 用 truncate 撑满 inset 区时右边缘会和 Phone/Video icon
  // 重叠。改成 48 * (button 数 + 1 个外边距) 让 absolute 居中标题贴合实际
  // button 占位；左侧 back 槽位同款 48。
  const titleLeftInset = 48;
  const titleRightInset = 48 * (actions.length + 1);

  return (
    <header className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-2 py-1.5">
      <div className="relative flex min-h-11 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#111827] transition active:bg-[color:var(--surface-card-hover)]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <div className="h-10 w-10 shrink-0" aria-hidden="true" />
        )}

        <div
          className="pointer-events-none absolute text-center"
          style={{
            left: `${titleLeftInset}px`,
            right: `${titleRightInset}px`,
          }}
        >
          <div className="truncate text-[17px] font-medium text-[#111827]">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
              {subtitle}
            </div>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;

            return (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#111827] transition active:bg-[color:var(--surface-card-hover)]"
                aria-label={action.label}
                title={action.label}
              >
                <Icon size={19} />
              </button>
            );
          })}

          <button
            type="button"
            onClick={onMore}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[#111827] transition active:bg-[color:var(--surface-card-hover)]"
            aria-label={moreLabel}
          >
            <Ellipsis size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
