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
      ? t(msg`视频流`)
      : t(msg`视频画面`);
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
      className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--border-faint)]/12 bg-[color:var(--surface-card)]/8 px-4 text-sm text-[color:var(--text-on-brand)] transition hover:bg-[color:var(--surface-card)]/12"
    >
      {t(msg`重新连接`)}
    </button>
  ) : null;

  if (!streamUrl) {
    if (playerUrl) {
      return (
        <section
          className={cn(
            "relative overflow-hidden border text-[color:var(--text-on-brand)]",
            variant === "mobile"
              ? "rounded-[var(--radius-xl)] border-[color:var(--border-faint)]/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[0_26px_80px_rgba(60, 40, 110, 0.34)]"
              : "flex min-h-0 flex-1 rounded-[var(--radius-xl)] border-[color:var(--border-faint)] bg-[linear-gradient(180deg,#111827_0%,#0f172a_46%,#020617_100%)] shadow-[0_22px_60px_rgba(60, 40, 110, 0.22)]",
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
            title={t(msg`${name} 的视频播放器`)}
            allow="autoplay"
            // 走查电脑端单聊 R134：单聊「视频通话」打开 DigitalHumanPlayer 时
            // iframe.src 是 provider (minimax) 自己的 player URL，跨源加载。
            // 原版没显式 referrerPolicy，浏览器走 default `strict-origin-when-
            // cross-origin` → cross-origin 时仍把"完整 origin"附在 Referer 上
            // (e.g. `https://1gw06751dd053.vicp.fun`)；同时 same-origin 时附完整
            // URL（含 conversation 路由 hash）。对外部数字人 player：
            // · provider 完全用 URL query token 鉴权 (?token=…)，根本不读
            //   Referer 校验，所以 Referer 对 provider 完全无业务必要。
            // · 但 vicp.fun 隧道公开域名经 provider 端日志/IDS/反向代理 access
            //   log 命中后会带上 conversation route 痕迹（move-id / hash），
            //   即便不含明文 yinjie-id，3rd-party 仍能积累"哪个会话发起过几次
            //   AI 数字人通话"的元数据。
            // 收紧到 referrerPolicy="no-referrer" — 整条 Referer 头不发送，
            // 既不影响 provider 鉴权（query token 不变）也消除日志侧的隐式
            // 元数据外泄。和 fetch / <a target=_blank> 加 rel="noreferrer"
            // 同款隐私防御思路。
            referrerPolicy="no-referrer"
            className="absolute inset-0 h-full w-full border-0"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 rounded-t-[22px] bg-[linear-gradient(180deg,rgba(2,6,23,0),rgba(2,6,23,0.78))] px-4 pb-4 pt-10">
            <div className="rounded-[var(--radius-lg)] border border-[color:var(--border-faint)]/10 bg-[rgba(2,6,23,0.44)] px-4 py-3 backdrop-blur">
              <div className="text-[length:var(--text-eyebrow)] uppercase tracking-[0.18em] text-[color:var(--text-on-brand)]/42">
                {t(msg`通话提示`)}
              </div>
              <div className="mt-1 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-on-brand)]/78">
                {statusHint}
              </div>
              {renderStatusHint ? (
                <div className="mt-2 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-on-brand)]/64">
                  {renderStatusHint}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--text-eyebrow)] text-[color:var(--text-on-brand)]/52">
                <span>{providerLabel}</span>
                {renderStatusLabel ? (
                  <span>{renderStatusLabel}</span>
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
        "relative overflow-hidden border text-[color:var(--text-on-brand)]",
        variant === "mobile"
          ? "rounded-[var(--radius-xl)] border-[color:var(--border-faint)]/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[0_26px_80px_rgba(60, 40, 110, 0.34)]"
          : "flex min-h-0 flex-1 rounded-[var(--radius-xl)] border-[color:var(--border-faint)] bg-[linear-gradient(180deg,#111827_0%,#0f172a_46%,#020617_100%)] shadow-[0_22px_60px_rgba(60, 40, 110, 0.22)]",
      )}
    >
      {/* 走查电脑端单聊 R136：和姊妹 R133 (CameraPreviewCard <video>) 同款。本
          <video> 是 DigitalHumanPlayer streamUrl 分支挂在 absolute inset-0 当
          背景流，上层 z-10 overlay 渲染状态卡 / 通话提示 / renderStatus
          InlineNotice。video 自身 muted / 无 controls / 无 captions，SR
          (NVDA/JAWS/VoiceOver) tab 或虚拟光标走过来只能朗读 "视频 播放中"
          一段 generic 噪声 —— 对应内容（数字人画面）SR 用户根本拿不到任何信息，
          所有 user-actionable 状态都已在下方 overlay 通过 statusLabel / statusHint
          / renderStatus InlineNotice 提供（renderStatus=failed 走
          role="alert" / assertive、其它走 role="status" / polite 已在
          R55 修过）。挂 aria-hidden="true" 把这条纯视觉镜像从 AT tree
          移除，避免 AI 视频通话期间反复出现 "video / video player"
          噪声播报。和姊妹 R133 / digital-human-stage R100 走的 "label/hidden
          二选一" 标记思路一致。 */}
      <video
        src={streamUrl}
        autoPlay
        playsInline
        muted
        loop
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="relative z-10 flex h-full flex-col justify-between bg-[linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.54))] p-4">
        <div className="max-w-[196px] rounded-[var(--radius-lg)] border border-[color:var(--border-faint)]/10 bg-[rgba(2,6,23,0.44)] px-3 py-2 backdrop-blur">
          <div className="text-[length:var(--text-eyebrow)] uppercase tracking-[0.18em] text-[color:var(--text-on-brand)]/42">
            {t(msg`状态`)}
          </div>
          <div className="mt-1 text-sm font-medium text-[color:var(--state-success-text)]">
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
              ? t(msg`画面生成失败，已切换到语音`)
              : renderStatus === "rendering"
                ? t(msg`画面生成中`)
                : renderStatus === "queued"
                  ? t(msg`画面正在排队，请稍候`)
                  : t(msg`画面已开启`)}
          </InlineNotice>
          <div className="rounded-[var(--radius-xl)] border border-[color:var(--border-faint)]/10 bg-[rgba(2,6,23,0.44)] px-4 py-3 backdrop-blur">
            <div className="text-[length:var(--text-eyebrow)] uppercase tracking-[0.18em] text-[color:var(--text-on-brand)]/42">
              {t(msg`通话提示`)}
            </div>
            <div className="mt-1 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-on-brand)]/78">
              {statusHint}
            </div>
            {renderStatusHint ? (
              <div className="mt-2 text-[length:var(--text-caption)] leading-6 text-[color:var(--text-on-brand)]/64">
                {renderStatusHint}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--text-eyebrow)] text-[color:var(--text-on-brand)]/52">
              <span>{providerLabel}</span>
              {renderStatusLabel ? (
                <span>{t(msg`画面: ${renderStatusLabel}`)}</span>
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
      return t(msg`等待中`);
    case "rendering":
      return t(msg`加载中`);
    case "ready":
      return t(msg`已就绪`);
    case "failed":
      return t(msg`加载失败`);
    default:
      return null;
  }
}

function resolveRenderStatusHint(renderStatus?: DigitalHumanSession["renderStatus"]) {
  switch (renderStatus) {
    case "queued":
      return t(msg`画面准备中`);
    case "rendering":
      return t(msg`画面生成中`);
    case "ready":
      return t(msg`画面已就绪`);
    case "failed":
      return t(msg`画面生成失败，可继续语音`);
    default:
      return null;
  }
}
