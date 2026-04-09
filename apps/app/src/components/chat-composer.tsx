import { Mic, Plus, SendHorizontal, Smile } from "lucide-react";
import { Button, InlineNotice } from "@yinjie/ui";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";

type ChatComposerProps = {
  value: string;
  placeholder: string;
  variant?: "mobile" | "desktop";
  pending?: boolean;
  error?: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatComposer({
  value,
  placeholder,
  variant = "mobile",
  pending = false,
  error,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const { keyboardInset, keyboardOpen } = useKeyboardInset();
  const isDesktop = variant === "desktop";

  return (
    <div
      className={
        isDesktop
          ? "border-t border-[rgba(15,23,42,0.06)] bg-[rgba(249,249,249,0.98)] px-4 py-3"
          : "border-t border-white/70 bg-[linear-gradient(180deg,rgba(255,254,250,0.90),rgba(255,248,236,0.94))] px-3 pt-2 backdrop-blur-xl"
      }
      style={{
        paddingBottom: keyboardOpen
          ? `${keyboardInset}px`
          : isDesktop ? "0.75rem" : "0.35rem",
      }}
    >
      <div className={`flex items-center gap-2 ${isDesktop ? "rounded-[22px] border border-[rgba(15,23,42,0.06)] bg-white px-3 py-2 shadow-[var(--shadow-soft)]" : ""}`}>
        {isDesktop ? (
          <>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.05)]" aria-label="表情">
              <Smile size={18} />
            </button>
            <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[rgba(15,23,42,0.05)]" aria-label="更多功能">
              <Plus size={18} />
            </button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-white/70 bg-white/80 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)] hover:bg-white"
            aria-label="语音输入"
          >
            <Mic size={18} />
          </Button>
        )}

        <div className={`flex min-w-0 flex-1 items-center gap-2 ${isDesktop ? "" : "rounded-[24px] border border-white/80 bg-white/90 px-3 py-2 shadow-[var(--shadow-soft)]"}`}>
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
          {!isDesktop ? (
            <button type="button" className="text-[color:var(--text-secondary)]" aria-label="表情">
              <Smile size={18} />
            </button>
          ) : null}
        </div>

        {value.trim() ? (
          <Button
            onClick={onSubmit}
            disabled={pending}
            variant="primary"
            className={
              isDesktop
                ? "h-10 rounded-[14px] bg-[rgba(7,193,96,0.96)] px-5 text-sm font-medium text-white shadow-none hover:bg-[rgba(7,193,96,1)]"
                : "h-10 rounded-[18px] bg-[linear-gradient(135deg,#fbbf24,#f97316)] px-4 text-sm font-medium shadow-[0_4px_12px_rgba(249,115,22,0.30)]"
            }
          >
            发送
          </Button>
        ) : !isDesktop ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full border border-white/70 bg-white/80 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)] hover:bg-white"
            aria-label="更多功能"
          >
            <Plus size={18} />
          </Button>
        ) : (
          <div className="h-10 w-[74px]" />
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
