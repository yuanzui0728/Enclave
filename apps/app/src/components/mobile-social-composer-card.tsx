import { Button, ErrorBlock, TextAreaField, cn } from "@yinjie/ui";

type MobileSocialComposerCardProps = {
  title: string;
  description: string;
  scopeLabel: string;
  scopeClassName?: string;
  value: string;
  placeholder: string;
  helperText: string;
  submitLabel: string;
  submittingLabel: string;
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
  value,
  placeholder,
  helperText,
  submitLabel,
  submittingLabel,
  pending = false,
  disabled = false,
  errorMessage,
  onChange,
  onSubmit,
}: MobileSocialComposerCardProps) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-black/5 bg-white">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <div className="text-[16px] font-medium text-[#111827]">{title}</div>
          <div className="mt-1 text-[12px] leading-5 text-[#8c8c8c]">
            {description}
          </div>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium",
            scopeClassName,
          )}
        >
          {scopeLabel}
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        <TextAreaField
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-32 resize-none rounded-[14px] border-0 bg-[#f5f5f5] px-4 py-3 shadow-none"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[12px] leading-5 text-[#8c8c8c]">{helperText}</div>
          <Button
            type="button"
            variant="primary"
            disabled={disabled}
            onClick={onSubmit}
            className="h-10 rounded-full bg-[#07c160] px-5 text-white hover:bg-[#06ad56]"
          >
            {pending ? submittingLabel : submitLabel}
          </Button>
        </div>

        {errorMessage ? (
          <div className="mt-3">
            <ErrorBlock message={errorMessage} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
