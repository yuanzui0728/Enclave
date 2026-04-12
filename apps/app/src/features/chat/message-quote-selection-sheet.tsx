import { useEffect, useRef, useState } from "react";
import { Button } from "@yinjie/ui";

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

  useEffect(() => {
    if (!open) {
      setSelectedText("");
      return;
    }

    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(timer);
  }, [open, messageText]);

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
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.14)]">
      <button
        type="button"
        aria-label="关闭部分引用面板"
        onClick={onClose}
        className="absolute inset-0"
      />
      <div
        className={`absolute ${
          isDesktop
            ? "left-1/2 top-1/2 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[22px] bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
            : "inset-x-0 bottom-0 overflow-hidden rounded-t-[20px] border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-2 shadow-[0_-14px_28px_rgba(15,23,42,0.10)]"
        }`}
      >
        {isDesktop ? null : (
          <div className="flex justify-center pb-1.5">
            <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
          </div>
        )}

        <div className={isDesktop ? "" : "px-1 pb-0.5"}>
          <div className="text-center text-[12px] text-[#8c8c8c]">
            部分引用
          </div>
          <div
            className={`mt-1.5 text-center text-[12px] leading-5 text-[color:var(--text-secondary)] ${
              isDesktop ? "" : "px-3"
            }`}
          >
            选择来自 {senderName} 的文字，确认后带入回复。
          </div>
        </div>

        <div
          className={`mt-4 rounded-[16px] ${
            isDesktop
              ? "border border-black/6 bg-[#fafafa] p-4"
              : "border border-[color:var(--border-subtle)] bg-white px-3 py-3"
          }`}
        >
          <div
            className={`mb-2 font-medium uppercase text-[color:var(--text-dim)] ${
              isDesktop
                ? "text-[11px] tracking-[0.14em]"
                : "text-[10px] tracking-[0.1em]"
            }`}
          >
            原消息
          </div>
          <textarea
            ref={textareaRef}
            readOnly
            value={messageText}
            onSelect={updateSelection}
            onKeyUp={updateSelection}
            onPointerUp={updateSelection}
            spellCheck={false}
            className={`w-full resize-none bg-transparent text-[color:var(--text-primary)] outline-none ${
              isDesktop
                ? "min-h-[164px] text-[15px] leading-7"
                : "min-h-[152px] rounded-[12px] text-[14px] leading-6"
            }`}
          />
        </div>

        <div
          className={`mt-3 rounded-[14px] px-3 py-2 text-[12px] leading-5 ${
            selectedText
              ? isDesktop
                ? "bg-[rgba(7,193,96,0.10)] text-[#11925a]"
                : "bg-[rgba(7,193,96,0.10)] text-[#11925a]"
              : isDesktop
                ? "bg-white text-[color:var(--text-muted)]"
                : "border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] text-[color:var(--text-muted)]"
          }`}
        >
          {selectedText
            ? `将引用：${selectedText}`
            : "在上方拖动选择要引用的文字。"}
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
                : "h-11 flex-1 rounded-[14px] border-[color:var(--border-subtle)] bg-white text-[15px] active:bg-[color:var(--surface-card-hover)]"
            }
          >
            取消
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (selectedText) {
                onConfirm(selectedText);
              }
            }}
            disabled={!selectedText}
            className={
              isDesktop
                ? "rounded-full"
                : "h-11 flex-1 rounded-[14px] text-[15px]"
            }
          >
            引用所选文字
          </Button>
        </div>
      </div>
    </div>
  );
}
