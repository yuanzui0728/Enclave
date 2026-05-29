import { useCallback, useRef } from "react";
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
  // 走查新一轮 R1：和 MobileDetailsActionSheet 新会话 R2（commit bb1f6bf63）/
  // mobile-message-action-sheet R2 同款修法——本 header 上 4 个按钮（back /
  // voice-call / video-call / more）的 onClick 在调用方那边全都是 `void
  // navigate({to:...})` 形态，没挂 disabled / 没同步 ref 守。navigate 本身
  // 不是 React state，同帧 <16ms 双击 Phone/Video/More 任一按钮，两次 onClick
  // 都跑 navigate(...)，tanstack-router push 2 条相同 history 项——用户点
  // 返回要按 2 次才能退出群聊页。group-chat-thread-panel 的 voice-call /
  // video-call / 「...」更多 三个按钮、conversation-thread-panel 的同款三个、
  // 加上 onBack 都中招。
  //
  // 任何 button 点过一次就 guard 住所有后续 button click —— 本 header 的
  // 4 个按钮目的都是"导航离开当前聊天页"，第一次成功后 header 会跟着 page
  // unmount，re-mount 时 ref 自动复位；同 mount 内连点不该多飞一次。
  const actionFiredRef = useRef(false);
  const guardAction = useCallback(
    <T extends (...args: never[]) => unknown>(
      handler: T | undefined,
    ): T | undefined => {
      if (!handler) return undefined;
      return ((...args: Parameters<T>) => {
        if (actionFiredRef.current) return;
        actionFiredRef.current = true;
        handler(...args);
      }) as T;
    },
    [],
  );
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
            onClick={guardAction(onBack)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--text-primary)] transition active:bg-[color:var(--surface-card-hover)]"
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
          <div className="truncate text-[length:var(--text-title)] font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-0.5 truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
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
                onClick={guardAction(action.onClick)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--text-primary)] transition active:bg-[color:var(--surface-card-hover)]"
                aria-label={action.label}
                title={action.label}
              >
                <Icon size={19} />
              </button>
            );
          })}

          <button
            type="button"
            onClick={guardAction(onMore)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--text-primary)] transition active:bg-[color:var(--surface-card-hover)]"
            aria-label={moreLabel}
          >
            <Ellipsis size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
