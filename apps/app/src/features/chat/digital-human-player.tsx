import type { DigitalHumanSession } from "@yinjie/contracts";
import { InlineNotice, cn } from "@yinjie/ui";
import { DigitalHumanStage } from "./digital-human-stage";

type DigitalHumanPlayerProps = {
  variant: "mobile" | "desktop";
  name: string;
  fallbackSrc?: string;
  session?: DigitalHumanSession | null;
  talking: boolean;
  thinking: boolean;
  statusLabel: string;
  statusHint: string;
};

export function DigitalHumanPlayer({
  variant,
  name,
  fallbackSrc,
  session,
  talking,
  thinking,
  statusLabel,
  statusHint,
}: DigitalHumanPlayerProps) {
  const providerLabel =
    session?.presentationMode === "provider_stream"
      ? "数字人视频流"
      : "内置数字人舞台";
  const renderStatus = session?.renderStatus;
  const playerUrl =
    session?.presentationMode === "provider_stream"
      ? session.playerUrl?.trim() || undefined
      : undefined;
  const posterSrc = session?.posterUrl || fallbackSrc;
  const streamUrl =
    session?.presentationMode === "provider_stream"
      ? session.streamUrl?.trim() || undefined
      : undefined;

  if (!streamUrl) {
    if (playerUrl) {
      return (
        <section
          className={cn(
            "relative overflow-hidden border text-white",
            variant === "mobile"
              ? "rounded-[30px] border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[0_26px_80px_rgba(15,23,42,0.34)]"
              : "flex min-h-0 flex-1 rounded-[28px] border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,#111827_0%,#0f172a_46%,#020617_100%)] shadow-[0_22px_60px_rgba(15,23,42,0.22)]",
          )}
        >
          <iframe
            src={playerUrl}
            title={`${name} digital human player`}
            allow="autoplay"
            className="absolute inset-0 h-full w-full border-0"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 rounded-t-[22px] bg-[linear-gradient(180deg,rgba(2,6,23,0),rgba(2,6,23,0.78))] px-4 pb-4 pt-10">
            <div className="rounded-[18px] border border-white/10 bg-[rgba(2,6,23,0.44)] px-4 py-3 backdrop-blur">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
                通话提示
              </div>
              <div className="mt-1 text-[13px] leading-6 text-white/78">
                {statusHint}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/52">
                <span>{providerLabel}</span>
                {renderStatus ? <span>渲染状态: {renderStatus}</span> : null}
              </div>
            </div>
          </div>
        </section>
      );
    }

    return (
      <DigitalHumanStage
        variant={variant}
        name={name}
        src={posterSrc}
        talking={talking}
        thinking={thinking}
        statusLabel={statusLabel}
        statusHint={statusHint}
        providerLabel={
          renderStatus ? `${providerLabel} · ${renderStatus}` : providerLabel
        }
      />
    );
  }

  return (
    <section
      className={cn(
        "relative overflow-hidden border text-white",
        variant === "mobile"
          ? "rounded-[30px] border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[0_26px_80px_rgba(15,23,42,0.34)]"
          : "flex min-h-0 flex-1 rounded-[28px] border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,#111827_0%,#0f172a_46%,#020617_100%)] shadow-[0_22px_60px_rgba(15,23,42,0.22)]",
      )}
    >
      <video
        src={streamUrl}
        autoPlay
        playsInline
        muted
        loop
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="relative z-10 flex h-full flex-col justify-between bg-[linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.54))] p-4">
        <div className="max-w-[196px] rounded-[18px] border border-white/10 bg-[rgba(2,6,23,0.44)] px-3 py-2 backdrop-blur">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
            状态
          </div>
          <div className="mt-1 text-sm font-medium text-[#bbf7d0]">
            {statusLabel}
          </div>
        </div>
        <div className="space-y-3">
          <InlineNotice tone="info">
            当前已切到数字人视频流播放器；若流不可用会自动回退到内置舞台。
          </InlineNotice>
          <div className="rounded-[22px] border border-white/10 bg-[rgba(2,6,23,0.44)] px-4 py-3 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
              通话提示
            </div>
            <div className="mt-1 text-[13px] leading-6 text-white/78">
              {statusHint}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/52">
              <span>{providerLabel}</span>
              {renderStatus ? <span>渲染状态: {renderStatus}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
