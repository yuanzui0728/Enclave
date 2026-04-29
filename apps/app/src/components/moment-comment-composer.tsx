import type { KeyboardEvent, Ref } from "react";
import { Button, cn } from "@yinjie/ui";

type MomentCommentComposerProps = {
  value: string;
  placeholder: string;
  pending?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  submitLabel?: string;
  pendingLabel?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function MomentCommentComposer({
  value,
  placeholder,
  pending = false,
  disabled = false,
  className,
  inputClassName,
  buttonClassName,
  inputRef,
  submitLabel = "发送",
  pendingLabel = "发送中...",
  onChange,
  onSubmit,
}: MomentCommentComposerProps) {
  const canSubmit = Boolean(value.trim()) && !pending && !disabled;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    if (canSubmit) {
      onSubmit();
    }
  }

  return (
    <div className={cn("flex min-w-0 flex-1 items-end gap-2", className)}>
      <textarea
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="评论内容"
        disabled={disabled}
        inputMode="text"
        enterKeyHint="send"
        autoComplete="off"
        className={cn(
          "min-h-9 max-h-24 min-w-0 flex-1 resize-none rounded-[18px] border border-[color:var(--border-faint)] bg-white px-3 py-2 text-[16px] leading-5 text-[color:var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition-[border-color,background-color,box-shadow] placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)] focus:shadow-[var(--shadow-focus)]",
          inputClassName,
        )}
      />
      <Button
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
        variant="primary"
        size="sm"
        className={cn("h-9 shrink-0 px-3 text-[12px]", buttonClassName)}
      >
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}
