import type { HTMLAttributes, ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { cn } from "../cn";

type LoadingBlockProps = HTMLAttributes<HTMLDivElement> & {
  label?: ReactNode;
};

export function LoadingBlock({
  className,
  label,
  role,
  "aria-live": ariaLive,
  "aria-busy": ariaBusy,
  ...props
}: LoadingBlockProps) {
  return (
    // 走查再走一轮 R3：LoadingBlock 是 chat workspace / 历史搜索 / 笔记列表
    // / 通话面板 / 各种 query loading 状态共用的可视占位。原版裸 <div> 视
    // 觉给三颗 pulse dot + "加载中..." 文案，盲人 SR (NVDA / JAWS /
    // VoiceOver) 完全感知不到——用户切到一段会话后等慢公网 RTT 时除了静
    // 默没有任何反馈，体感"是不是按错了"。挂 role="status" 让 implicit
    // aria-live="polite" 在 block 出现时朗读 label；aria-busy="true" 给
    // 严格模式 SR 显式声明本区域处于"加载中、不要 walk children"状态，
    // 避免读取下方还没填充好的占位结构。允许调用方覆盖（极个别地方可能
    // 想用 role="presentation" 关掉播报）。
    <div
      role={role ?? "status"}
      aria-live={ariaLive ?? "polite"}
      aria-busy={ariaBusy ?? true}
      className={cn(
        "rounded-[20px] border border-black/6 bg-white px-5 py-8 text-center text-sm text-[color:var(--text-secondary)] shadow-[0_14px_36px_rgba(15,23,42,0.05)]",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          // 三颗装饰性 pulse dot，对 SR 无信息量；aria-hidden 把它们从 AT
          // 树移走，让 status 区域只剩 label 文案被朗读，避免 NVDA 把
          // 「空」连读 3 遍。
          aria-hidden="true"
          className="flex items-center gap-2"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-black/18 animate-pulse" />
          <span className="h-2.5 w-2.5 rounded-full bg-black/28 animate-pulse [animation-delay:120ms]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#8ecf9d] animate-pulse [animation-delay:240ms]" />
        </div>
        <div>{label ?? <Trans>加载中...</Trans>}</div>
      </div>
    </div>
  );
}
