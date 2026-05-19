import { msg } from "@lingui/macro";
import type { DigitalHumanSession } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { InlineNotice, cn } from "@yinjie/ui";
import { DigitalHumanStage } from "./digital-human-stage";

const t = translateRuntimeMessage;

type DigitalHumanPlayerProps = {
  variant: "mobile" | "desktop";
  name: string;
  fallbackSrc?: string;
  session?: DigitalHumanSession | null;
  talking: boolean;
  thinking: boolean;
  statusLabel: string;
  statusHint: string;
  onRetryRender?: () => void;
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
  onRetryRender,
}: DigitalHumanPlayerProps) {
  const providerLabel =
    session?.presentationMode === "provider_stream"
      ? t(msg`数字人视频流`)
      : t(msg`内置数字人舞台`);
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
  const renderTone =
    renderStatus === "failed"
      ? "warning"
      : renderStatus === "ready"
        ? "info"
        : "info";
  const renderStatusLabel = resolveRenderStatusLabel(renderStatus);
  const renderStatusHint = resolveRenderStatusHint(renderStatus);
  const showRetryRenderAction = renderStatus === "failed" && onRetryRender;
  const retryRenderAction = showRetryRenderAction ? (
    <button
      type="button"
      onClick={onRetryRender}
      className="inline-flex h-10 items-center justify-center rounded-full border border-white/12 bg-white/8 px-4 text-sm text-white transition hover:bg-white/12"
    >
      {t(msg`重试连接数字人`)}
    </button>
  ) : null;

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
            // 走查电脑端单聊 R126：单聊「视频通话」打开 DesktopDirectCallPanel
            // → DigitalHumanPlayer 在 provider 返回 playerUrl 时渲染这条 iframe
            // 嵌入 provider 数字人流。原版 title 写死英文 "digital human player"
            // —— 这是 iframe 给 SR (NVDA/JAWS/VoiceOver) 朗读的唯一 accessible
            // name，整个 app 都翻了 ja-JP/ko-KR/zh-CN 但 SR 用户在这条通话
            // 入口听到突兀的英文「Lily digital human player」。translateRuntimeMessage
            // 走运行时 catalog，和姊妹 R55 InlineNotice / R8 channels-workspace
            // 同款 i18n 修法。
            title={t(msg`${name} 的数字人视频播放器`)}
            allow="autoplay"
            className="absolute inset-0 h-full w-full border-0"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 rounded-t-[22px] bg-[linear-gradient(180deg,rgba(2,6,23,0),rgba(2,6,23,0.78))] px-4 pb-4 pt-10">
            <div className="rounded-[18px] border border-white/10 bg-[rgba(2,6,23,0.44)] px-4 py-3 backdrop-blur">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
                {t(msg`通话提示`)}
              </div>
              <div className="mt-1 text-[13px] leading-6 text-white/78">
                {statusHint}
              </div>
              {renderStatusHint ? (
                <div className="mt-2 text-[12px] leading-6 text-white/64">
                  {renderStatusHint}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/52">
                <span>{providerLabel}</span>
                {renderStatusLabel ? (
                  <span>{t(msg`渲染状态: ${renderStatusLabel}`)}</span>
                ) : null}
              </div>
              {retryRenderAction ? (
                <div className="pointer-events-auto mt-3">{retryRenderAction}</div>
              ) : null}
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
          renderStatusLabel
            ? `${providerLabel} · ${renderStatusLabel}`
            : providerLabel
        }
        footerAction={retryRenderAction}
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
            {t(msg`状态`)}
          </div>
          <div className="mt-1 text-sm font-medium text-[#bbf7d0]">
            {statusLabel}
          </div>
        </div>
        <div className="space-y-3">
          {/* R55：数字人 player 的 renderStatus notice 文案随 backend 渲染
              状态 queued → rendering → failed / 成功 动态切换；用户在 AI
              视频通话中盲人 SR 必须能感知（"rendering 失败回退文字语音
              链路"是 user-facing fatal）。failed 走 alert assertive，其余
              走 status polite，对齐姊妹 R8 channels-workspace tone 分流。 */}
          <InlineNotice
            role={renderStatus === "failed" ? "alert" : "status"}
            aria-live={renderStatus === "failed" ? "assertive" : "polite"}
            tone={renderTone}
          >
            {renderStatus === "failed"
              ? t(msg`数字人视频流渲染失败，当前已回退到文字加语音通话链路。可稍后重试连接数字人。`)
              : renderStatus === "rendering"
                ? t(msg`数字人视频流正在渲染，当前会优先保持播放器连接并继续刷新状态。`)
                : renderStatus === "queued"
                  ? t(msg`数字人视频流已进入队列，当前会先保持会话连接，渲染完成后自动切到视频流。`)
                  : t(msg`当前已切到数字人视频流播放器；若流不可用会自动回退到内置舞台。`)}
          </InlineNotice>
          <div className="rounded-[22px] border border-white/10 bg-[rgba(2,6,23,0.44)] px-4 py-3 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">
              {t(msg`通话提示`)}
            </div>
            <div className="mt-1 text-[13px] leading-6 text-white/78">
              {statusHint}
            </div>
            {renderStatusHint ? (
              <div className="mt-2 text-[12px] leading-6 text-white/64">
                {renderStatusHint}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/52">
              <span>{providerLabel}</span>
              {renderStatusLabel ? (
                <span>{t(msg`渲染状态: ${renderStatusLabel}`)}</span>
              ) : null}
            </div>
            {retryRenderAction ? (
              <div className="mt-3">{retryRenderAction}</div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function resolveRenderStatusLabel(renderStatus?: DigitalHumanSession["renderStatus"]) {
  switch (renderStatus) {
    case "queued":
      return t(msg`排队中`);
    case "rendering":
      return t(msg`渲染中`);
    case "ready":
      return t(msg`视频流就绪`);
    case "failed":
      return t(msg`渲染失败`);
    default:
      return null;
  }
}

function resolveRenderStatusHint(renderStatus?: DigitalHumanSession["renderStatus"]) {
  switch (renderStatus) {
    case "queued":
      return t(msg`正在排队准备数字人画面。`);
    case "rendering":
      return t(msg`数字人画面生成中，请稍候。`);
    case "ready":
      return t(msg`数字人视频流已就绪。`);
    case "failed":
      return t(msg`本轮视频流没有成功生成，但语音回复链路仍然可继续使用。`);
    default:
      return null;
  }
}
