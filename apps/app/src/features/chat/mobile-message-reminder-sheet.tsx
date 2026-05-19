import { useCallback, useEffect, useId, useRef } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

const t = translateRuntimeMessage;

export type MobileMessageReminderOption = {
  id: string;
  label: string;
  detail: string;
  remindAt: string;
};

type MobileMessageReminderSheetProps = {
  open: boolean;
  variant?: "mobile" | "desktop";
  title?: string;
  previewText?: string;
  options: MobileMessageReminderOption[];
  onClose: () => void;
  onSelect: (option: MobileMessageReminderOption) => void;
};

export function MobileMessageReminderSheet({
  open,
  variant = "mobile",
  title = t(msg`提醒这条消息`),
  previewText,
  options,
  onClose,
  onSelect,
}: MobileMessageReminderSheetProps) {
  const isDesktop = variant === "desktop";
  const titleId = useId();
  // 走查 2026-05-18 移动端群聊 R2：和姊妹 sheet mobile-message-action-sheet R2
  // (commit 30f58a286) / mobile-mention-picker-sheet R1 (commit 46dee9a87) 同款
  // 问题——下面 option 行 onClick 直接落到父组件的 handleSelectReminder，sheet
  // 关闭走 setReminderTargetMessage(null) 走 React state 必须 commit 才让 sheet
  // 卸载。同帧 <16ms 第二次 tap：sheet 还在 DOM、按钮仍可点 → setReminder mutation
  // 跑 2 次（同 messageId + 同 remindAt），服务端落 2 条独立 reminder 记录 →
  // 用户到点会被同一条消息提醒 2 次。actionFiredRef 同步赋值，第一次 tap 后所有
  // 后续 tap 直接 noop；open 切回 true 时复位。「取消」按钮不走 guard（与
  // mobile-message-action-sheet 同款选择，cancel 是预期可重复行为）。
  const actionFiredRef = useRef(false);
  useEffect(() => {
    if (open) {
      actionFiredRef.current = false;
    }
  }, [open]);
  const guardSelect = useCallback(
    (handler: () => void) => {
      return () => {
        if (actionFiredRef.current) return;
        actionFiredRef.current = true;
        handler();
      };
    },
    [],
  );

  // 走查 R3：原版 back/Esc 两个 effect deps 里都带 `onClose`，调用方
  // chat-message-list 是直接 `onClose={() => setReminderTargetMessage(null)}`
  // inline arrow，每次父帧重渲染就是新引用 → effect 拆装：
  // - back 拦截：registerAndroidBackInterceptor → unregister（操作的是 native
  //   bridge 注册表）；ChatMessageList 长聊里 typing tick / socket echo /
  //   setQueriesData 每次都会重 render，sheet 还开着的时候每帧拆装一次原生注册。
  // - Esc：window.removeEventListener / addEventListener("keydown") 每帧拆装。
  // 把 onClose 镜像到 ref，effect 内通过 ref 读，deps 只留 [isDesktop, open]
  // / [open]，让 sheet 开着期间只挂一次。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || isDesktop) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
    return unregister;
  }, [isDesktop, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={`fixed inset-0 z-50 ${
        isDesktop
          ? "flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]"
          : "bg-[rgba(15,23,42,0.14)]"
      }`}
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label={t(msg`关闭消息提醒面板`)}
        onClick={onClose}
        // 走查电脑端单聊 R121：和姊妹 R107-R120 backdrop 同款 —— 本 sheet 通过
        // variant="desktop" 也复用到桌面单聊路径（chat-message-list 4588 →
        // MobileMessageReminderSheet variant={variant}）。桌面单聊右键消息选
        //「提醒」时 sheet 弹成居中 modal，backdrop <button> (absolute inset-0)
        // 视觉不可见、纯 mouse"点击背景关闭"affordance，但 DOM 顺序排在 sheet
        // 子树第一位。用户开 sheet 后按 Tab 切预设时间 / 自定义时间 / 取消，
        // 焦点先落到这张不可见 backdrop → 看不到 focus → 再按 Enter sheet 秒
        // 关，选好的提醒时刻 / 写到一半的备注全丢。Esc keydown 已挂 (line
        // 88-101)，键盘用户走 Esc 关 sheet；移动端 sheet 走 bottom slide 不影
        // 响 mouse 用户路径。挂 tabIndex={-1} 把 backdrop 从 Tab 序列移出。
        tabIndex={-1}
      />
      {/* 走查新一轮 R2：和姊妹 sheet mobile-message-action-sheet.tsx
          （commit 30f58a286）同款 a11y 缺漏——长按消息选「提醒」打开
          的这个 sheet 的 modal panel 没挂 role="dialog" + aria-modal
          + aria-labelledby。屏幕阅读器（iOS VoiceOver / Android
          TalkBack）不会把它当 modal 念，盲人用户长按消息选「提醒」
          后只听到 "关闭消息提醒面板 按钮" + 几个 option 行，听不到
          "提醒这条消息" 这个标题。补 dialog 语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          isDesktop
            ? "relative w-full max-w-[440px] overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white/96 px-5 py-4 shadow-[var(--shadow-overlay)]"
            : "absolute inset-x-0 bottom-0 overflow-hidden rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]"
        }
      >
        {isDesktop ? null : (
          <div className="flex justify-center pb-1.5">
            <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
          </div>
        )}
        <div className={isDesktop ? "" : "px-1 pb-2.5"}>
          <div
            id={titleId}
            className={
              isDesktop
                ? "text-[15px] font-medium text-[color:var(--text-primary)]"
                : "text-center text-[12px] text-[#8c8c8c]"
            }
          >
            {title}
          </div>
          {previewText ? (
            <div
              className={
                isDesktop
                  ? "mt-2 line-clamp-2 rounded-[12px] border border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)] px-3 py-2 text-[12px] leading-5 text-[color:var(--text-secondary)]"
                  : "mt-2 line-clamp-2 rounded-[14px] border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-[12px] leading-5 text-[#4b5563]"
              }
            >
              {previewText}
            </div>
          ) : null}
        </div>
        <div
          className={
            isDesktop
              ? "mt-3 overflow-hidden rounded-[12px] border border-[color:var(--border-faint)] bg-white"
              : "overflow-hidden rounded-[14px] border border-[color:var(--border-subtle)] bg-white"
          }
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={guardSelect(() => onSelect(option))}
              className={
                isDesktop
                  ? "flex w-full items-center justify-between gap-3 border-b border-[color:var(--border-faint)] px-4 py-2.5 text-left transition hover:bg-[color:var(--surface-console)] last:border-b-0"
                  : "flex w-full items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] px-4 py-2.5 text-left transition active:bg-[color:var(--surface-card-hover)] last:border-b-0"
              }
            >
              <div className="min-w-0">
                <div
                  className={
                    isDesktop
                      ? "text-[14px] text-[color:var(--text-primary)]"
                      : "text-[15px] text-[#111827]"
                  }
                >
                  {option.label}
                </div>
                <div
                  className={
                    isDesktop
                      ? "mt-0.5 text-[11px] text-[color:var(--text-muted)]"
                      : "mt-0.5 text-[11px] text-[#8c8c8c]"
                  }
                >
                  {option.detail}
                </div>
              </div>
              <div className="shrink-0 text-[11px] text-[#07c160]">
                {t(msg`设为提醒`)}
              </div>
            </button>
          ))}
        </div>
        {isDesktop ? (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white px-6 shadow-none hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`取消`)}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="mt-2.5 flex h-11 w-full items-center justify-center rounded-[14px] border border-[color:var(--border-subtle)] bg-white text-[15px] font-medium text-[#111827] transition active:bg-[color:var(--surface-card-hover)]"
          >
            {t(msg`取消`)}
          </button>
        )}
      </div>
    </div>
  );
}
