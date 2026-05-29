import { useEffect, useId, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

const t = translateRuntimeMessage;

type MessageQuoteSelectionSheetProps = {
  open: boolean;
  variant?: "mobile" | "desktop";
  senderName: string;
  messageText: string;
  onClose: () => void;
  onConfirm: (selectedText: string) => void;
};

export function MessageQuoteSelectionSheet({
  open,
  variant = "mobile",
  senderName,
  messageText,
  onClose,
  onConfirm,
}: MessageQuoteSelectionSheetProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const isDesktop = variant === "desktop";
  const titleId = useId();
  // 走查 R2：「引用所选文字」按钮 onClick 只看 React state selectedText 兜
  // 双触发，sheet 关闭由父组件 setQuoteSelectionMessage(null) 走 state 更新，
  // 必须等 React commit 才让 sheet 卸载。同帧 <16ms 双击：第二次 click 时
  // sheet 还在 DOM、selectedText 还非空 → onConfirm 调用 2 次 → handleReply
  // 飞两次 → setActionNotice("已带入所选文字") 闪两次（虽然内容相同视觉看不
  // 出来）、analytics 双埋点。同 mount sync ref，open 切换时复位。
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setSelectedText("");
      confirmingRef.current = false;
      return;
    }

    confirmingRef.current = false;
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(timer);
  }, [open, messageText]);

  // 走查 R3：onClose 是父组件 inline arrow，每个父帧新引用 → 原写法 effect 每
  // 帧 unregister + register Android back interceptor / removeEventListener +
  // addEventListener("keydown") 一遍。和 mobile-message-action-sheet /
  // mobile-message-reminder-sheet R3 同款修法 —— ref 镜像 onClose，让 deps
  // 收紧到 [open] / [isDesktop, open]。
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

  const updateSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const nextSelectedText = textarea.value
      .slice(textarea.selectionStart ?? 0, textarea.selectionEnd ?? 0)
      .trim();
    setSelectedText(nextSelectedText);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[color:var(--border-strong)]">
      <button
        type="button"
        aria-label={t(msg`关闭部分引用面板`)}
        onClick={onClose}
        // 走查电脑端单聊 R118：和姊妹 R107-R117 dialog / menu / viewer backdrop
        // 同款 —— 单聊消息右键「部分引用」打开的 QuoteSelectionSheet 的
        // backdrop <button> (absolute inset-0) 视觉不可见、纯 mouse"点击背景
        // 关闭"affordance，但 DOM 顺序排在 sheet 子树第一位。用户打开 sheet
        // 后按 Tab 切到 textarea 框选 / 「插入引用」按钮，焦点先落到这张不
        // 可见 backdrop → 看不到 focus → 再按 Enter sheet 秒关，框选好的
        // 引用文字一并丢。挂 tabIndex={-1} 把 backdrop 从 Tab 序列移出；
        // onClick 鼠标点击关闭路径不受影响。
        tabIndex={-1}
        className="absolute inset-0"
      />
      {/* 走查新一轮 R3：和姊妹 sheet mobile-message-action-sheet.tsx
          （commit 30f58a286）+ mobile-message-reminder-sheet.tsx（本轮 R2）
          同款 a11y 缺漏——长按消息选「部分引用」打开的这个 sheet 没挂
          role="dialog" + aria-modal + aria-labelledby。盲人用户长按后只
          听到 "关闭部分引用面板 按钮" + 一片 textarea，听不到 "部分引用"
          这个标题。Desktop variant 同一个 panel 复用 backdrop modal 写法，
          统一覆盖。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute ${
          isDesktop
            ? "left-1/2 top-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-xl)] bg-[color:var(--surface-card)] p-5 shadow-[0_24px_60px_rgba(60, 40, 110, 0.18)]"
            : "inset-x-0 bottom-0 overflow-hidden rounded-t-[var(--radius-lg)] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 shadow-[0_-14px_28px_rgba(60, 40, 110, 0.10)]"
        }`}
      >
        {isDesktop ? null : (
          <div className="flex justify-center pb-1.5">
            <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
          </div>
        )}

        <div className={isDesktop ? "" : "px-1 pb-0.5"}>
          <div id={titleId} className="text-center text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
            {t(msg`部分引用`)}
          </div>
          <div
            className={`mt-1.5 text-center text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)] ${
              isDesktop ? "" : "px-3"
            }`}
          >
            {t(msg`选择来自 ${senderName} 的文字，确认后带入回复。`)}
          </div>
        </div>

        <div
          className={`mt-4 rounded-[var(--radius-md)] ${
            isDesktop
              ? "border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] p-4"
              : "border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-3"
          }`}
        >
          <div
            className={`mb-2 font-medium uppercase text-[color:var(--text-dim)] ${
              isDesktop
                ? "text-[length:var(--text-eyebrow)] tracking-[0.14em]"
                : "text-[10px] tracking-[0.1em]"
            }`}
          >
            {t(msg`原消息`)}
          </div>
          <textarea
            ref={textareaRef}
            readOnly
            value={messageText}
            onSelect={updateSelection}
            onKeyUp={updateSelection}
            onPointerUp={updateSelection}
            spellCheck={false}
            // 走查 R10：和姊妹页 R1-R9 同款 a11y 修法——上方"原消息"小标题
            // 视觉上是 label，但和这个 readonly textarea 之间没有 htmlFor /
            // aria-labelledby 关联，屏幕阅读器 focus 进来听不到上下文。挂
            // aria-label="原消息内容" 让 SR 知道这块是被引用的原文。本 sheet
            // 同时给单聊 / 群聊"部分引用"路径用，一处修复双路径受益。
            aria-label={t(msg`原消息内容`)}
            className={`w-full resize-none bg-transparent text-[color:var(--text-primary)] outline-none ${
              isDesktop
                ? "min-h-[164px] text-[length:var(--text-base)] leading-7"
                : // text-[length:var(--text-title)]: iOS Safari focus 时 <16px 会强制 viewport
                  // zoom-in，readOnly 也不豁免。用户点 textarea 选文字也算
                  // focus → 页面突然放大。
                  "min-h-[152px] rounded-[var(--radius-sm)] text-[length:var(--text-title)] leading-6"
            }`}
          />
        </div>

        <div
          className={`mt-3 rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-caption)] leading-5 ${
            selectedText
              ? isDesktop
                ? "bg-[color:var(--brand-primary)]/10 text-[color:var(--state-success-text)]"
                : "bg-[color:var(--brand-primary)]/10 text-[color:var(--state-success-text)]"
              : isDesktop
                ? "bg-[color:var(--surface-card)] text-[color:var(--text-muted)]"
                : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-muted)]"
          }`}
        >
          {selectedText
            ? t(msg`将引用：${selectedText}`)
            : t(msg`在上方拖动选择要引用的文字。`)}
        </div>

        <div
          className={`mt-4 flex gap-3 ${isDesktop ? "justify-end" : ""}`}
        >
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className={
              isDesktop
                ? "rounded-full"
                : "h-11 flex-1 rounded-[var(--radius-md)] border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] text-[length:var(--text-base)] active:bg-[color:var(--surface-card-hover)]"
            }
          >
            {t(msg`取消`)}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (confirmingRef.current) return;
              if (!selectedText) return;
              confirmingRef.current = true;
              onConfirm(selectedText);
            }}
            disabled={!selectedText}
            className={
              isDesktop
                ? "rounded-full"
                : "h-11 flex-1 rounded-[var(--radius-md)] text-[length:var(--text-base)]"
            }
          >
            {t(msg`引用所选文字`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
