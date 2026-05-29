import { type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Video } from "lucide-react";
import { cn } from "@yinjie/ui";

const t = translateRuntimeMessage;

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
          ? "rounded-[var(--radius-xl)] border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[0_26px_80px_rgba(60, 40, 110, 0.34)]"
          : "flex min-h-0 flex-1 rounded-[var(--radius-xl)] border-[color:var(--border-faint)] bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_30%),linear-gradient(180deg,#111827_0%,#0f172a_46%,#020617_100%)] shadow-[0_22px_60px_rgba(60, 40, 110, 0.22)]",
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
            <div className="inline-flex items-center gap-2 rounded-full border border-[#34d399]/20 bg-[#34d399]/10 px-3 py-1 text-[length:var(--text-eyebrow)] font-medium tracking-[0.12em] text-[color:var(--state-success-text)]">
              <Video size={13} />
              {t(msg`视频通话`)}
            </div>
            <div
              className={cn(
                "font-semibold tracking-[0.01em]",
                mobile ? "mt-3 text-[length:var(--text-display)]" : "mt-3 text-[length:var(--text-display)]",
              )}
            >
              {name}
            </div>
          </div>
          <div
            className={cn(
              "rounded-[var(--radius-lg)] border border-white/10 bg-white/8 px-3 py-2 text-right",
              mobile ? "max-w-[136px]" : "max-w-[156px]",
            )}
          >
            <div className="text-[length:var(--text-eyebrow)] uppercase tracking-[0.18em] text-white/38">
              {t(msg`状态`)}
            </div>
            <div className="mt-1 text-sm font-medium text-[color:var(--state-success-text)]">
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
                // 走查电脑端单聊 R100：和姊妹 R88/R92/R93 一批 viewer img 已挂的同款。
                // src 通常是 minimax 生成的角色头像（1024×1024 原图、200-600KB），
                // 这里缩到 224×224 圆形显示。原版裸 <img> 没 decoding/draggable：
                // 1) decoding="async"——浏览器默认同步在主线程 decode，桌面 1:1 视频
                //    通话起手 mount 这条 DigitalHumanStage 时会卡 80-150ms（同帧
                //    还有 status pill / 3 颗 talking dot 在 animate-pulse），用户
                //    体感"接通瞬间整面板顿一下"。off-thread decode 让卡顿消失。
                // 2) draggable={false}——通话期间用户按住头像（误以为能查看 AI 资料
                //    或想试试拖动）会触发 HTML5 native drag，把 src URL 释放到桌面
                //    意外触发"下载 AI 头像到桌面"；同时 drag start 后 mouseup 不
                //    fire click，干扰未来在头像上挂点击进资料页的扩展。
                <img
                  src={src}
                  alt={name}
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
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
                        ? "h-5 animate-pulse bg-[color:var(--state-success-bg)]"
                        : thinking
                          ? "h-4 animate-pulse bg-[color:var(--state-info-bg)]"
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
                {talking
                  ? t(msg`对方正在说话`)
                  : thinking
                    ? t(msg`对方正在回复`)
                    : t(msg`在线`)}
              </span>
              {providerLabel ? (
                <span className="rounded-full border border-white/10 bg-white/6 px-2 py-0.5 text-[length:var(--text-eyebrow)] text-white/56">
                  {providerLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--radius-xl)] border border-white/8 bg-white/6 px-4 py-3">
          <div className="text-[length:var(--text-eyebrow)] uppercase tracking-[0.18em] text-white/38">
            {t(msg`通话提示`)}
          </div>
          <div className="mt-1 text-[length:var(--text-caption)] leading-6 text-white/72">
            {statusHint}
          </div>
          {footerAction ? <div className="mt-3">{footerAction}</div> : null}
        </div>
      </div>
    </section>
  );
}
