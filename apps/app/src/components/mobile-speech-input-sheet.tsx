import { Mic, Square, WandSparkles, X } from "lucide-react";
import { cn } from "@yinjie/ui";
import type { SpeechInputStatus } from "../features/chat/speech-input-types";

type MobileSpeechInputSheetProps = {
  open: boolean;
  status: SpeechInputStatus;
  text: string;
  error?: string | null;
  holding: boolean;
  cancelIntent: boolean;
  mode?: "dictation" | "voice";
  onClose: () => void;
  onCancel: () => void;
  onCommit: () => void;
  canCommit: boolean;
};

function resolveStatusTitle(
  mode: "dictation" | "voice",
  status: SpeechInputStatus,
  holding: boolean,
  cancelIntent: boolean,
) {
  if (holding) {
    return cancelIntent
      ? "松开手指，取消发送"
      : mode === "voice"
        ? "松开手指，发送语音"
        : "松开手指，转成文字";
  }

  switch (status) {
    case "requesting-permission":
      return "正在请求麦克风权限...";
    case "listening":
      return "继续按住说话";
    case "processing":
      return mode === "voice" ? "正在整理语音..." : "正在转写语音...";
    case "ready":
      return mode === "voice" ? "语音已准备发送" : "识别完成";
    case "error":
      return mode === "voice" ? "语音发送暂时不可用" : "语音输入暂时不可用";
    default:
      return "按住说话";
  }
}

function resolveStatusHint(
  mode: "dictation" | "voice",
  status: SpeechInputStatus,
  holding: boolean,
  cancelIntent: boolean,
) {
  if (holding) {
    return cancelIntent
      ? "向下移回按钮区域，可以继续保留本次语音。"
      : mode === "voice"
        ? "上滑取消，松开后会直接发送这条语音。"
        : "上滑取消，松开后只会转成文字，不会直接发送。";
  }

  switch (status) {
    case "requesting-permission":
      return "第一次使用时，系统可能会弹出麦克风授权。";
    case "listening":
      return "继续按住说话，松开后结束本次输入。";
    case "processing":
      return mode === "voice"
        ? "录音已经结束，正在整理语音文件。"
        : "录音已经结束，正在把语音整理成文字。";
    case "ready":
      return mode === "voice"
        ? "确认后会直接发到当前会话。"
        : "确认后插入输入框，你还可以继续修改。";
    case "error":
      return "可以关闭后重试，或直接切回键盘输入。";
    default:
      return mode === "voice"
        ? "按住录一条语音，松开后就能直接发送。"
        : "识别结果会先停留在这里，等待你决定是否插入。";
  }
}

export function MobileSpeechInputSheet({
  open,
  status,
  text,
  error,
  holding,
  cancelIntent,
  mode = "dictation",
  onClose,
  onCancel,
  onCommit,
  canCommit,
}: MobileSpeechInputSheetProps) {
  if (!open) {
    return null;
  }

  const listening = status === "listening";
  const processing =
    status === "processing" || status === "requesting-permission";
  const title = resolveStatusTitle(mode, status, holding, cancelIntent);
  const hint = resolveStatusHint(mode, status, holding, cancelIntent);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(15,23,42,0.18)] backdrop-blur-[1.5px]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭语音输入面板"
        onClick={onClose}
        disabled={holding}
      />
      <div className="relative w-full max-w-sm px-5 pb-[calc(env(safe-area-inset-bottom,0px)+18px)]">
        <div className="rounded-[28px] border border-white/8 bg-[rgba(22,24,28,0.94)] px-5 pb-5 pt-2.5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.28)]">
          <div className="flex justify-center pb-3">
            <div className="h-1 w-10 rounded-full bg-white/18" />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[16px] font-medium tracking-[0.01em]">
                {title}
              </div>
              <div className="mt-1 text-[11px] leading-5 text-white/62">
                {hint}
              </div>
            </div>
            <button
              type="button"
              className={cn(
                "flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/7 text-white/72 transition active:bg-white/12",
                holding ? "pointer-events-none opacity-0" : "opacity-100",
              )}
              onClick={onClose}
              disabled={holding}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-center">
            <div
              className={cn(
                "flex h-22 w-22 items-center justify-center rounded-full border text-white transition",
                holding && cancelIntent
                  ? "border-[#ff7875]/36 bg-[#ef4444]"
                  : listening || holding
                    ? "border-[#07c160]/28 bg-[#07c160]"
                    : processing
                      ? "border-white/12 bg-white/12"
                      : "border-white/10 bg-white/8",
              )}
            >
              {processing ? (
                <WandSparkles size={30} />
              ) : listening || holding ? (
                cancelIntent ? (
                  <X size={32} />
                ) : (
                  <Mic size={32} />
                )
              ) : status === "ready" ? (
                <Square size={26} fill="currentColor" />
              ) : (
                <Mic size={32} />
              )}
            </div>
          </div>

          <div
            className={cn(
              "mt-5 min-h-[104px] rounded-[20px] border px-4 py-3 text-[14px] leading-6",
              text
                ? "border-white/12 bg-white/10 text-white/92"
                : "border-white/8 bg-white/[0.05] text-white/42",
            )}
          >
            {text ||
              (mode === "voice"
                ? "录音时长会显示在这里。"
                : "识别结果会显示在这里。")}
          </div>

          {error ? (
            <div className="mt-3 rounded-[14px] border border-[#ff7875]/22 bg-[#ff4d4f]/10 px-3 py-2 text-[11px] leading-5 text-[#ffd7d5]">
              {error}
            </div>
          ) : null}

          {!holding ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex h-10.5 items-center justify-center rounded-[15px] border border-white/10 bg-white/7 text-[14px] font-medium text-white/78 transition active:bg-white/12"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onCommit}
                disabled={!canCommit || processing}
                className="flex h-10.5 items-center justify-center rounded-[15px] bg-[#07c160] text-[14px] font-medium text-white transition disabled:opacity-45"
              >
                <span className="inline-flex items-center gap-1.5">
                  <WandSparkles size={15} />
                  {mode === "voice" ? "立即发送" : "插入输入框"}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
