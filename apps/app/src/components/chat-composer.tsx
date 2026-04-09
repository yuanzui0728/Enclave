import { Mic, Plus, SendHorizontal, Smile } from "lucide-react";
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
      className="border-t border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(255,248,239,0.92))] px-3 pt-2 backdrop-blur-xl"
      style={{
        paddingBottom: keyboardOpen
          ? `${keyboardInset}px`
          : "0.35rem",
      }}
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full border border-white/70 bg-white/80 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)] hover:bg-white"
          aria-label="语音输入"
        >
          <Mic size={18} />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[24px] border border-white/80 bg-white/90 px-3 py-2 shadow-[var(--shadow-soft)]">
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
            className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
          />
          <button type="button" className="text-[color:var(--text-secondary)]" aria-label="表情">
            <Smile size={18} />
          </button>
        </div>
        {value.trim() ? (
          <Button
            onClick={onSubmit}
            disabled={pending}
            variant="primary"
            className="h-10 rounded-[18px] px-4 text-sm font-medium"
          >
            发送
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-white/70 bg-white/80 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)] hover:bg-white"
            aria-label="更多功能"
          >
            <Plus size={18} />
          </Button>
        )}
      </div>
      {error ? (
        <InlineNotice className="mt-2 text-xs" tone="danger">
          {error}
        </InlineNotice>
      ) : null}
      {pending ? (
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[color:var(--text-muted)]">
          <SendHorizontal size={12} />
          <span>正在发送...</span>
        </div>
      ) : null}
    </div>
  );
}
