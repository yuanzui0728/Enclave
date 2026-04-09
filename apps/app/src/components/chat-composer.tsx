import { Mic, Plus, SendHorizontal, Smile, Square, WandSparkles, X } from "lucide-react";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";
import { useState } from "react";
import { MobileSpeechInputSheet } from "./mobile-speech-input-sheet";
import { useSpeechInput } from "../features/chat/use-speech-input";

type ChatComposerProps = {
  value: string;
  placeholder: string;
  variant?: "mobile" | "desktop";
  pending?: boolean;
  error?: string | null;
  speechInput?: {
    baseUrl?: string;
    conversationId: string;
    enabled: boolean;
  };
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function ChatComposer({
  value,
  placeholder,
  variant = "mobile",
  pending = false,
  error,
  speechInput,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const { keyboardInset, keyboardOpen } = useKeyboardInset();
  const isDesktop = variant === "desktop";
  const [mobileSpeechSheetOpen, setMobileSpeechSheetOpen] = useState(false);
  const speech = useSpeechInput({
    baseUrl: speechInput?.baseUrl,
    conversationId: speechInput?.conversationId ?? "",
    enabled: Boolean(speechInput?.enabled && speechInput?.conversationId),
  });
  const composerError = error ?? speech.error;
  const speechDisplayText = speech.displayText.trim();

  const commitSpeechInput = () => {
    const mergedValue = speech.commitToInput(value);
    onChange(mergedValue);
    setMobileSpeechSheetOpen(false);
  };

  const toggleMobileSpeech = async () => {
    setMobileSpeechSheetOpen(true);
    if (speech.status === "idle" || speech.status === "error") {
      await speech.start();
    }
  };

  return (
    <>
      <div
        className={
          isDesktop
            ? "border-t border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,254,249,0.98),rgba(255,248,239,0.98))] px-4 py-3"
            : "border-t border-white/70 bg-[linear-gradient(180deg,rgba(255,254,250,0.90),rgba(255,248,236,0.94))] px-3 pt-2 backdrop-blur-xl"
        }
        style={{
          paddingBottom: keyboardOpen
            ? `${keyboardInset}px`
            : isDesktop ? "0.75rem" : "0.35rem",
        }}
      >
        <div className={`flex items-center gap-2 ${isDesktop ? "rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 shadow-[var(--shadow-soft)]" : ""}`}>
          {isDesktop ? (
            <>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]" aria-label="表情">
                <Smile size={18} />
              </button>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]" aria-label="更多功能">
                <Plus size={18} />
              </button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void toggleMobileSpeech()}
              className={cn(
                "h-10 w-10 rounded-full border border-white/70 bg-white/80 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)] hover:bg-white",
                speech.status === "listening"
                  ? "border-[rgba(249,115,22,0.35)] text-[color:var(--brand-primary)]"
                  : "",
              )}
              aria-label="语音输入"
            >
              {speech.status === "listening" ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}
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
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (speech.status === "listening") {
                    speech.stop();
                    return;
                  }
                  void speech.start();
                }}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--brand-primary)]",
                  speech.status === "listening"
                    ? "bg-[color:var(--surface-soft)] text-[color:var(--brand-primary)]"
                    : "",
                )}
                aria-label={speech.status === "listening" ? "停止语音输入" : "语音输入"}
              >
                {speech.status === "listening" ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}
              </button>
            )}
          </div>

          {value.trim() ? (
            <Button
              onClick={onSubmit}
              disabled={pending}
              variant="primary"
              className={
                isDesktop
                  ? "h-10 rounded-[14px] bg-[var(--brand-gradient)] px-5 text-sm font-medium text-white shadow-[0_6px_16px_rgba(160,90,10,0.18)] hover:opacity-95"
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
        {!isDesktop && speech.status === "ready" && speechDisplayText ? (
          <InlineNotice className="mt-2 flex items-center justify-between gap-3 text-xs" tone="info">
            <span className="truncate">识别完成：{speechDisplayText}</span>
            <button type="button" onClick={commitSpeechInput} className="shrink-0 text-[color:var(--brand-primary)]">
              插入输入框
            </button>
          </InlineNotice>
        ) : null}
        {isDesktop && (speech.status !== "idle" || speechDisplayText) ? (
          <InlineNotice className="mt-2 flex flex-wrap items-center gap-2 text-xs" tone={speech.error ? "danger" : "info"}>
            <span>
              {speech.status === "listening"
                ? "正在聆听..."
                : speech.status === "processing"
                  ? "正在转写语音..."
                  : speech.status === "ready"
                    ? `识别完成：${speechDisplayText}`
                    : speech.status === "requesting-permission"
                      ? "正在请求麦克风权限..."
                      : composerError ?? "语音输入已停止"}
            </span>
            {speech.status === "ready" && speech.canCommit ? (
              <button type="button" onClick={commitSpeechInput} className="inline-flex items-center gap-1 text-[color:var(--brand-primary)]">
                <WandSparkles size={12} />
                插入输入框
              </button>
            ) : null}
            {speech.status === "listening" ? (
              <button type="button" onClick={speech.stop} className="text-[color:var(--brand-primary)]">
                停止
              </button>
            ) : null}
            {speech.status !== "idle" ? (
              <button type="button" onClick={speech.cancel} className="inline-flex items-center gap-1 text-[color:var(--text-secondary)]">
                <X size={12} />
                取消
              </button>
            ) : null}
          </InlineNotice>
        ) : null}
        {composerError && !isDesktop ? (
          <InlineNotice className="mt-2 text-xs" tone="danger">
            {composerError}
          </InlineNotice>
        ) : null}
        {pending ? (
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[color:var(--text-muted)]">
            <SendHorizontal size={12} />
            <span>正在发送...</span>
          </div>
        ) : null}
      </div>
      <MobileSpeechInputSheet
        open={mobileSpeechSheetOpen}
        supported={speech.supported}
        status={speech.status}
        text={speechDisplayText}
        error={speech.error}
        onClose={() => {
          if (
            speech.status === "listening" ||
            speech.status === "processing" ||
            speech.status === "requesting-permission"
          ) {
            speech.cancel();
          }
          setMobileSpeechSheetOpen(false);
        }}
        onStart={() => void speech.start()}
        onStop={speech.stop}
        onCancel={() => {
          speech.cancel();
          setMobileSpeechSheetOpen(false);
        }}
        onCommit={commitSpeechInput}
        canCommit={speech.canCommit}
      />
      {isDesktop && error ? (
        <div className="px-4 pb-3">
          <InlineNotice className="text-xs" tone="danger">
            {error}
          </InlineNotice>
        </div>
      ) : null}
    </>
  );
}
