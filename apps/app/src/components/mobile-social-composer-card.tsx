import type { ReactNode } from "react";
import { Button, TextAreaField, cn } from "@yinjie/ui";

type MobileSocialComposerCardProps = {
  title: string;
  description: string;
  scopeLabel: string;
  scopeClassName?: string;
  sectionId?: string;
  textareaId?: string;
  value: string;
  placeholder: string;
  helperText: string;
  submitLabel: string;
  submittingLabel: string;
  mediaPreview?: ReactNode;
  mediaActions?: ReactNode;
  pending?: boolean;
  disabled?: boolean;
  errorMessage?: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function MobileSocialComposerCard({
  title,
  description,
  scopeLabel,
  scopeClassName,
  sectionId,
  textareaId,
  value,
  placeholder,
  helperText,
  submitLabel,
  submittingLabel,
  mediaPreview,
  mediaActions,
  pending = false,
  disabled = false,
  errorMessage,
  onChange,
  onSubmit,
}: MobileSocialComposerCardProps) {
  return (
    <section
      id={sectionId}
      className="overflow-hidden rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]"
    >
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          <div className="mt-0.5 text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
            {description}
          </div>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium",
            scopeClassName,
          )}
        >
          {scopeLabel}
        </div>
      </div>

      <div className="px-4 pb-3 pt-1.5">
        <TextAreaField
          id={textareaId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-[7rem] resize-none rounded-[12px] border-0 bg-[color:var(--surface-console)] px-3.5 py-2.5 text-[13px] leading-[1.35rem] shadow-none"
        />

        {mediaPreview ? <div className="mt-3">{mediaPreview}</div> : null}

        {mediaActions ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {mediaActions}
          </div>
        ) : null}

        <div className="mt-2.5 flex items-center justify-between gap-3">
          <div className="text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
            {helperText}
          </div>
          <Button
            type="button"
            variant="primary"
            disabled={disabled}
            onClick={onSubmit}
            className="h-9 rounded-full bg-[#07c160] px-4 text-[12px] text-white hover:bg-[#06ad56]"
          >
            {pending ? submittingLabel : submitLabel}
          </Button>
        </div>

        {errorMessage ? (
          <div className="mt-2.5 rounded-[14px] border border-[#f2c6c3] bg-[#fff7f5] px-3.5 py-3 text-[11px] leading-[1.35rem] text-[#b42318]">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
