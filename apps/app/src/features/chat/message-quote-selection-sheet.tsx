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
    <div className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.22)]">
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
            : "inset-x-0 bottom-0 rounded-t-[18px] bg-[#f2f2f2] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.9rem)] pt-3 shadow-[0_-16px_36px_rgba(15,23,42,0.14)]"
        }`}
      >
        <div className={isDesktop ? "" : "px-1"}>
          <div className="text-center text-[13px] text-[#8c8c8c]">
            部分引用
          </div>
          <div className="mt-2 text-center text-[13px] leading-5 text-[color:var(--text-secondary)]">
            选择来自 {senderName} 的文字，确认后带入回复。
          </div>
        </div>

        <div
          className={`mt-4 rounded-[16px] ${
            isDesktop
              ? "border border-black/6 bg-[#fafafa] p-4"
              : "bg-white px-3 py-3"
          }`}
        >
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
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
            className={`min-h-[164px] w-full resize-none bg-transparent text-[15px] leading-7 text-[color:var(--text-primary)] outline-none ${
              isDesktop ? "" : "rounded-[12px]"
            }`}
          />
        </div>

        <div
          className={`mt-3 rounded-[14px] px-3 py-2 text-[13px] ${
            selectedText
              ? "bg-[rgba(7,193,96,0.10)] text-[#11925a]"
              : "bg-white text-[color:var(--text-muted)]"
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
            className={isDesktop ? "rounded-full" : "h-11 flex-1 rounded-[14px]"}
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
            className={isDesktop ? "rounded-full" : "h-11 flex-1 rounded-[14px]"}
          >
            引用所选文字
          </Button>
        </div>
      </div>
    </div>
  );
}
