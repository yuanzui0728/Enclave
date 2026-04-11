import { type ReactNode } from "react";
import { Video } from "lucide-react";
import { cn } from "@yinjie/ui";

type DigitalHumanStageProps = {
  variant: "mobile" | "desktop";
  name: string;
  src?: string;
  talking: boolean;
  thinking: boolean;
  statusLabel: string;
  statusHint: string;
  providerLabel?: string;
  footerAction?: ReactNode;
};

export function DigitalHumanStage({
  variant,
  name,
  src,
  talking,
  thinking,
  statusLabel,
  statusHint,
  providerLabel,
  footerAction,
}: DigitalHumanStageProps) {
  const initial = name.trim().slice(0, 1) || "AI";
  const mobile = variant === "mobile";

  return (
    <section
      className={cn(
        "relative overflow-hidden border text-white",
        mobile
          ? "rounded-[30px] border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[0_26px_80px_rgba(15,23,42,0.34)]"
          : "flex min-h-0 flex-1 rounded-[28px] border-[rgba(15,23,42,0.06)] bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_30%),linear-gradient(180deg,#111827_0%,#0f172a_46%,#020617_100%)] shadow-[0_22px_60px_rgba(15,23,42,0.22)]",
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          mobile
            ? "bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.14),transparent_32%),radial-gradient(circle_at_bottom,rgba(96,165,250,0.18),transparent_36%)]"
            : "bg-[radial-gradient(circle_at_bottom,rgba(52,211,153,0.14),transparent_34%)]",
        )}
      />
      <div
        className={cn(
          "relative flex flex-col justify-between",
          mobile ? "min-h-[420px] p-4" : "flex-1 p-5",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#34d399]/20 bg-[#34d399]/10 px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-[#bbf7d0]">
              <Video size={13} />
              数字人舞台
            </div>
            <div
              className={cn(
                "font-semibold tracking-[0.01em]",
                mobile ? "mt-3 text-[28px]" : "mt-3 text-[28px]",
              )}
            >
              {name}
            </div>
          </div>
          <div
            className={cn(
              "rounded-[18px] border border-white/10 bg-white/8 px-3 py-2 text-right",
              mobile ? "max-w-[136px]" : "max-w-[156px]",
            )}
          >
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">
              状态
            </div>
            <div className="mt-1 text-sm font-medium text-[#bbf7d0]">
              {statusLabel}
            </div>
          </div>
        </div>

        <div className="relative flex flex-1 items-center justify-center py-6">
          <div className="relative flex flex-col items-center">
            <div
              className={cn(
                "absolute inset-[-18px] rounded-full border",
                talking
                  ? "animate-ping border-[#34d399]/28"
                  : thinking
                    ? "animate-pulse border-[#60a5fa]/24"
                    : "border-white/6",
              )}
            />
            <div className="absolute inset-[-34px] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,0.24),transparent_66%)] blur-3xl" />
            <div className="relative flex h-[224px] w-[224px] items-center justify-center overflow-hidden rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(30,41,59,0.96),rgba(15,23,42,0.98))] shadow-[0_26px_80px_rgba(2,6,23,0.46)]">
              {src ? (
                <img src={src} alt={name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-[64px] font-semibold text-white/86">
                  {initial}
                </span>
              )}
            </div>
            <div className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4">
              <div className="flex items-end gap-1">
                {[0, 1, 2].map((item) => (
                  <span
                    key={item}
                    className={cn(
                      "w-1.5 rounded-full transition-all",
                      talking
                        ? "h-5 animate-pulse bg-[#34d399]"
                        : thinking
                          ? "h-4 animate-pulse bg-[#60a5fa]"
                          : "h-2 bg-white/28",
                    )}
                    style={
                      talking || thinking
                        ? { animationDelay: `${item * 120}ms` }
                        : undefined
                    }
                  />
                ))}
              </div>
              <span className="text-sm text-white/76">
                {talking ? "数字人播报中" : thinking ? "数字人整理中" : "数字人在线"}
              </span>
              {providerLabel ? (
                <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[11px] text-white/56">
                  {providerLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-white/8 bg-white/6 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">
            通话提示
          </div>
          <div className="mt-1 text-[13px] leading-6 text-white/72">
            {statusHint}
          </div>
          {footerAction ? <div className="mt-3">{footerAction}</div> : null}
        </div>
      </div>
    </section>
  );
}
