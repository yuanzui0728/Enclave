import { cn } from "@yinjie/ui";

// 单行极简状态文字（"正在聆听…"/"对方正在说话…"）。空文本不占位。
type CallStatusLineProps = {
  text?: string;
  className?: string;
};

export function CallStatusLine({ text, className }: CallStatusLineProps) {
  if (!text) {
    return null;
  }
  return (
    <div className={cn("text-[length:var(--text-caption)] leading-5 text-white/55", className)}>
      {text}
    </div>
  );
}
