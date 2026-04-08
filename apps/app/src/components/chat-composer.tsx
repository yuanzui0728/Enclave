import { SendHorizontal } from "lucide-react";
import { Button, InlineNotice } from "@yinjie/ui";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";

type ChatComposerProps = {
  value: string;
  placeholder: string;
  pending?: boolean;
  error?: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatComposer({ value, placeholder, pending = false, error, onChange, onSubmit }: ChatComposerProps) {
  const { keyboardInset, keyboardOpen } = useKeyboardInset();

  return (
    <div
      className="border-t border-[color:var(--border-faint)] bg-[color:var(--surface-shell)] px-4 pt-3"
      style={{
        paddingBottom: keyboardOpen
          ? `max(0.75rem, ${keyboardInset}px)`
          : "max(0.75rem, var(--safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center gap-3 rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-3 py-2 shadow-[var(--shadow-soft)]">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
        />
        <Button onClick={onSubmit} disabled={!value.trim() || pending} variant="primary" size="icon" className="shrink-0">
          <SendHorizontal size={16} />
        </Button>
      </div>
      {error ? (
        <InlineNotice className="mt-3 text-xs" tone="danger">
          {error}
        </InlineNotice>
      ) : null}
    </div>
  );
}
