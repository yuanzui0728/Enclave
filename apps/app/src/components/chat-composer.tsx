import { SendHorizontal } from "lucide-react";
import { Button, InlineNotice } from "@yinjie/ui";

type ChatComposerProps = {
  value: string;
  placeholder: string;
  pending?: boolean;
  error?: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatComposer({ value, placeholder, pending = false, error, onChange, onSubmit }: ChatComposerProps) {
  return (
    <div className="border-t border-[color:var(--border-subtle)] bg-[rgba(7,12,20,0.42)] px-4 py-3">
      <div className="flex items-center gap-3 rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-3 py-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) {
              onSubmit();
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-[color:var(--text-dim)]"
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
