import { useEffect, useId, useRef } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";

const t = translateRuntimeMessage;

type FeatureUnavailableDialogProps = {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  confirmLabel?: string;
};

export function FeatureUnavailableDialog({
  open,
  title,
  description,
  onClose,
  confirmLabel,
}: FeatureUnavailableDialogProps) {
  const resolvedConfirmLabel = confirmLabel ?? t(msg`我知道了`);
  const titleId = useId();
  const descId = useId();
  // 走查 2026-05-18 移动端群聊 R6：和姊妹 sheet/dialog mobile-message-reminder-
  // sheet R3 / mobile-mention-picker-sheet R3 / group-message-context-menu R4 /
  // mobile-details-action-sheet R5 同款修法——下方 Esc/Back 两个 effect 原本
  // 把 onClose 列进 deps。本 dialog 被 group-chat-thread-panel.tsx / conversation-
  // thread-panel.tsx 用作"群语音/视频通话开发中"提示弹层，调用方都是 inline
  // arrow `onClose={() => setCallUnavailableKind(null)}`。dialog 弹起来后只要
  // 父级 typing tick / socket echo / setMessages 任意 re-render，就会让两条
  // effect 拆装一次 native back interceptor + window keydown listener。镜像
  // onCloseRef，deps 收紧到 [open]。
  // 顺手对齐 ESC defaultPrevented 检查——和 4 个姊妹 sheet 同口径，让位嵌套子
  // 模态的 ESC 语义。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  // 原生壳硬件 Back 键：dialog 打开时拦掉，关 dialog 不退页（场景：聊天页
  // 里点不可用的语音/视频通话按钮弹出"功能开发中"对话框，BACK 应当先关掉
  // 它）。和 desktop Escape 一致。
  useEffect(() => {
    if (!open) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
    return unregister;
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label={t(msg`关闭提示`)}
        onClick={onClose}
        // 走查电脑端群聊 R104：和姊妹 R101-R103 / 电脑端单聊 R107-R113 一批同款
        // —— FeatureUnavailableDialog 的 backdrop <button> (absolute inset-0)
        // 视觉不可见、纯 mouse"点击背景关闭"affordance，但 DOM 顺序在 dialog
        // 子树第一位。本 dialog 被 group-chat-thread-panel / conversation-
        // thread-panel 用作"群语音/视频通话开发中"提示，用户在群聊里点 header
        // 「语音/视频通话」icon 弹出 dialog 后按 Tab → 焦点先落到这张不可见
        // backdrop → 看不到 focus ring → 再按 Enter dialog 秒关。Esc keydown
        // 已挂 (line 41-56)，键盘用户走 Esc 关 dialog。
        tabIndex={-1}
        className="absolute inset-0"
      />

      {/* 走查新一轮 R5：和姊妹 sheet/dialog mobile-message-action-sheet.tsx
          / mobile-message-reminder-sheet.tsx / mobile-speech-input-sheet.tsx
          同款 a11y 缺漏——这是个 modal（点击 backdrop 关闭、屏幕居中弹），
          但 panel 既没挂 role="dialog" + aria-modal，也没挂 aria-labelledby
          /aria-describedby。屏幕阅读器（iOS VoiceOver / Android TalkBack）
          打开时只听到 "关闭提示 按钮" 和 button，听不到 title/description。
          单聊点视频/语音通话按钮时这个 dialog 会弹（FeatureUnavailableDialog
          被 conversation-thread-panel.tsx 引用），盲人用户无法理解为什么
          按钮没生效。补 dialog 语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-[360px] overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-overlay)]"
      >
        <div className="px-6 pb-2 pt-6 text-center">
          <div
            id={titleId}
            className="text-[16px] font-medium text-[color:var(--text-primary)]"
          >
            {title}
          </div>
          <div
            id={descId}
            className="mt-3 text-[13px] leading-6 text-[color:var(--text-muted)]"
          >
            {description}
          </div>
        </div>
        <div className="border-t border-[color:var(--border-faint)] px-4 pb-4 pt-3">
          <Button
            type="button"
            variant="primary"
            onClick={onClose}
            className="w-full rounded-[12px] bg-[color:var(--brand-primary)] py-2 text-white shadow-none hover:opacity-95"
          >
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
