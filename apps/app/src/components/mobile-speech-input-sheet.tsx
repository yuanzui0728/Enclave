import { Mic, Square, WandSparkles, X } from "lucide-react";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import type { SpeechInputStatus } from "../features/chat/speech-input-types";

type MobileSpeechInputSheetProps = {
  open: boolean;
  supported: boolean;
  status: SpeechInputStatus;
  text: string;
  error?: string | null;
  onClose: () => void;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  onCommit: () => void;
  canCommit: boolean;
};

function resolveStatusLabel(status: SpeechInputStatus) {
  switch (status) {
    case "requesting-permission":
      return "正在请求麦克风权限...";
    case "listening":
      return "正在聆听，点停止结束录音";
    case "processing":
      return "正在转写语音...";
    case "ready":
      return "识别完成，插入输入框后可继续编辑";
    case "error":
      return "语音输入暂时不可用";
    default:
      return "点击开始说话，识别结果会先进入草稿区";
  }
}

export function MobileSpeechInputSheet({
  open,
  supported,
  status,
  text,
  error,
  onClose,
  onStart,
  onStop,
  onCancel,
  onCommit,
  canCommit,
}: MobileSpeechInputSheetProps) {
  if (!open) {
    return null;
  }

  const listening = status === "listening";
  const processing = status === "processing" || status === "requesting-permission";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-[rgba(30,24,12,0.22)] backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0" aria-label="关闭语音输入面板" onClick={onClose} />
      <div className="relative w-full rounded-t-[28px] border-t border-white/70 bg-[linear-gradient(180deg,rgba(255,253,247,0.98),rgba(255,247,235,0.98))] px-4 pb-6 pt-4 shadow-[0_-16px_36px_rgba(90,56,16,0.16)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-[color:var(--text-primary)]">语音输入</div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">{resolveStatusLabel(status)}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/80 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 rounded-[22px] border border-white/75 bg-white/86 p-4 shadow-[var(--shadow-soft)]">
          <div className="text-xs text-[color:var(--text-muted)]">识别草稿</div>
          <div
            className={cn(
              "mt-2 min-h-[108px] rounded-[18px] border border-dashed px-4 py-3 text-[15px] leading-7",
              text
                ? "border-[rgba(249,115,22,0.28)] text-[color:var(--text-primary)]"
                : "border-white/70 text-[color:var(--text-dim)]",
            )}
          >
            {text || "识别结果会先显示在这里，不会自动发送。"}
          </div>
        </div>

        {!supported ? (
          <InlineNotice className="mt-4 text-xs" tone="warning">
            当前浏览器不支持语音输入，请改用键盘输入。
          </InlineNotice>
        ) : null}

        {error ? (
          <InlineNotice className="mt-4 text-xs" tone="danger">
            {error}
          </InlineNotice>
        ) : null}

        <div className="mt-5 flex items-center justify-center">
          <button
            type="button"
            onClick={listening ? onStop : onStart}
            disabled={!supported || processing}
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full text-white shadow-[0_10px_22px_rgba(249,115,22,0.28)] transition",
              listening
                ? "bg-[linear-gradient(135deg,#f97316,#ea580c)]"
                : "bg-[linear-gradient(135deg,#fbbf24,#f97316)]",
              processing ? "opacity-70" : "",
            )}
            aria-label={listening ? "停止录音" : "开始录音"}
          >
            {listening ? <Square size={24} fill="currentColor" /> : <Mic size={28} />}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Button
            variant="ghost"
            className="h-11 rounded-[16px] border border-white/70 bg-white/78 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]"
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            variant="ghost"
            className="h-11 rounded-[16px] border border-white/70 bg-white/78 text-[color:var(--text-secondary)] shadow-[var(--shadow-soft)]"
            onClick={listening ? onStop : onStart}
            disabled={!supported || processing}
          >
            {listening ? "停止" : "开始"}
          </Button>
          <Button
            className="h-11 rounded-[16px] bg-[linear-gradient(135deg,#fbbf24,#f97316)] text-white shadow-[0_6px_16px_rgba(249,115,22,0.26)]"
            onClick={onCommit}
            disabled={!canCommit || listening || processing}
          >
            <span className="inline-flex items-center gap-1.5">
              <WandSparkles size={15} />
              插入
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
