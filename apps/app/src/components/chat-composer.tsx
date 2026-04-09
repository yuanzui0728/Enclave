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
      className="border-t border-black/6 bg-[#f7f7f7] px-3 pt-2"
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
          className="h-10 w-10 rounded-full border-none bg-transparent text-[#5f5f5f] shadow-none hover:bg-black/5"
          aria-label="语音输入"
        >
          <Mic size={18} />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[22px] border border-black/8 bg-white px-3 py-2">
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
            className="min-w-0 flex-1 bg-transparent py-1 text-[15px] text-[#111111] outline-none placeholder:text-[#a0a0a0]"
          />
          <button type="button" className="text-[#5f5f5f]" aria-label="表情">
            <Smile size={18} />
          </button>
        </div>
        {value.trim() ? (
          <Button
            onClick={onSubmit}
            disabled={pending}
            variant="primary"
            className="h-9 rounded-lg bg-[#07c160] px-3 text-sm font-medium text-white hover:bg-[#06ad56]"
          >
            发送
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border-none bg-transparent text-[#5f5f5f] shadow-none hover:bg-black/5"
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
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#8e8e93]">
          <SendHorizontal size={12} />
          <span>正在发送...</span>
        </div>
      ) : null}
    </div>
  );
}
